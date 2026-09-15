import { and, desc, eq, gte, isNull, lt, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertSakuAgent, InsertSakuAutomation, InsertSakuAutomationRun, InsertSakuCrmActivity, InsertSakuCrmContact, InsertSakuDivision, InsertSakuFile, InsertSakuInventoryItem, InsertSakuInventoryMovement, InsertSakuMemory, InsertSakuMessage, InsertSakuPipeline, InsertSakuSupportRequest, InsertSakuTeamStandard, InsertSakuWorkspace, InsertSakuWorkspaceMember, InsertUser, passwordResetTokens, sakuAgents, sakuAutomations, sakuAutomationRuns, sakuBankMutations, sakuBomLines, sakuBoms, sakuCrmActivities, sakuCrmContacts, sakuDivisions, sakuFiles, sakuFinanceReceivables, sakuIntegrationCredentials, sakuInventoryItems, sakuInventoryMovements, sakuJournalEntries, sakuMemories, sakuMessages, sakuPipelines, sakuProductionConsumptions, sakuProductionOrders, sakuReconciliationRules, sakuSalesOrderLines, sakuSalesOrders, sakuSupportRequests, sakuTeamStandards, sakuWorkspaceBusinessTypes, sakuWorkspaceMembers, sakuWorkspaces, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { cosineSimilarity, createTextEmbedding, createTextEmbeddingWithProvider, parseEmbedding, type Embedding } from "./embeddings";
import { createHash, randomBytes } from "node:crypto";

let _db: ReturnType<typeof drizzle> | null = null;

export function canonicalizeReceiptItems(value: string) {
  try { return JSON.stringify((JSON.parse(value) as Array<{ name?: string; quantity?: number; unitPrice?: number; total?: number }>).map((item) => ({ name: String(item.name || "").trim().toLowerCase(), quantity: Number(item.quantity) || 0, unitPrice: Number(item.unitPrice) || 0, total: Number(item.total) || 0 })).sort((a, b) => a.name.localeCompare(b.name))); } catch { return value; }
}

export function isReceiptDuplicate(candidate: { vendor: string; total: number; itemsText: string }, input: { vendor: string; total: number; itemsText: string }) {
  return candidate.vendor.trim().toLowerCase() === input.vendor.trim().toLowerCase() && candidate.total === input.total && canonicalizeReceiptItems(candidate.itemsText) === canonicalizeReceiptItems(input.itemsText);
}

const SAKU_BUSINESS_TIME_ZONE = "Asia/Jakarta";
const sakuBusinessDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SAKU_BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getSakuWibDayBounds(transactionDate: Date) {
  if (Number.isNaN(transactionDate.getTime())) throw new Error("Invalid transaction date");
  const parts = Object.fromEntries(sakuBusinessDateFormatter.formatToParts(transactionDate).map(({ type, value }) => [type, value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const start = new Date(Date.UTC(year, month - 1, day) - 7 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export function mergeLoginMethods(existing: string | null | undefined, incoming: string) {
  const methods = new Set((existing || "").split(",").map((method) => method.trim()).filter(Boolean));
  methods.add(incoming.trim());
  return Array.from(methods).join(",").slice(0, 64);
}

/**
 * Reuse an existing account when an OAuth provider returns the same verified
 * email. This keeps a user's password, workspace, and social sign-ins under
 * one stable openId instead of creating duplicate accounts.
 */
export async function upsertOAuthUser(input: { openId: string; name?: string | null; email?: string | null; loginMethod: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existingByOpenId = await getUserByOpenId(input.openId);
  const existingByEmail = input.email ? await getUserByEmail(input.email.trim().toLowerCase()) : undefined;
  const existing = existingByOpenId || existingByEmail;
  if (existing) {
    await db.update(users).set({
      name: input.name || existing.name,
      email: input.email || existing.email,
      loginMethod: mergeLoginMethods(existing.loginMethod, input.loginMethod),
      lastSignedIn: new Date(),
    }).where(eq(users.id, existing.id));
    return getUserByOpenId(existing.openId);
  }
  await upsertUser({
    openId: input.openId,
    name: input.name ?? null,
    email: input.email ? input.email.trim().toLowerCase() : null,
    loginMethod: input.loginMethod,
    lastSignedIn: new Date(),
  });
  return getUserByOpenId(input.openId);
}

export async function createEmailUser(input: { email: string; name: string; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const openId = `email:${createHash("sha256").update(input.email).digest("hex").slice(0, 48)}`;
  await db.insert(users).values({ openId, email: input.email, name: input.name, passwordHash: input.passwordHash, passwordUpdatedAt: new Date(), loginMethod: "email", lastSignedIn: new Date() });
  return getUserByOpenId(openId);
}

export async function updateUserPassword(openId: string, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ passwordHash, passwordUpdatedAt: new Date(), loginMethod: "email" }).where(eq(users.openId, openId));
  return getUserByOpenId(openId);
}

export function createPasswordResetTokenValue() {
  return randomBytes(32).toString("hex");
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function savePasswordResetToken(userOpenId: string, tokenHash: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(passwordResetTokens).where(and(eq(passwordResetTokens.userOpenId, userOpenId), isNull(passwordResetTokens.usedAt)));
  await db.insert(passwordResetTokens).values({ userOpenId, tokenHash, expiresAt });
}

export async function getPasswordResetToken(tokenHash: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(passwordResetTokens).where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt))).limit(1);
  return rows[0];
}

export async function consumePasswordResetToken(tokenHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)));
}

export async function getSakuWorkspace(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(sakuWorkspaces).where(eq(sakuWorkspaces.ownerOpenId, ownerOpenId)).limit(1);
  return rows[0];
}

export async function upsertSakuWorkspace(workspace: InsertSakuWorkspace) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(sakuWorkspaces).values(workspace).onDuplicateKeyUpdate({
    set: {
      businessName: workspace.businessName,
      persona: workspace.persona ?? null,
      updatedAt: new Date(),
    },
  });
  return getSakuWorkspace(workspace.ownerOpenId);
}

export async function upsertMootaIntegration(ownerOpenId: string, values: { apiKeyEncrypted: string; webhookSecretEncrypted: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!workspace) throw new Error("Workspace is not available");
  await db.insert(sakuIntegrationCredentials).values({ workspaceId: workspace.id, provider: "moota", ...values, status: "active" }).onDuplicateKeyUpdate({ set: { ...values, status: "active", updatedAt: new Date() } });
  return db.select({ id: sakuIntegrationCredentials.id, workspaceId: sakuIntegrationCredentials.workspaceId, provider: sakuIntegrationCredentials.provider, status: sakuIntegrationCredentials.status }).from(sakuIntegrationCredentials).where(and(eq(sakuIntegrationCredentials.workspaceId, workspace.id), eq(sakuIntegrationCredentials.provider, "moota"))).limit(1).then((rows) => rows[0]);
}

export async function createSakuFinanceReceivable(ownerOpenId: string, input: { channelId: string; customerReference: string; amount: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!workspace) throw new Error("Workspace is not available");
  await db.insert(sakuFinanceReceivables).values({ workspaceId: workspace.id, ...input, status: "open", paidMutationId: null });
  return db.select().from(sakuFinanceReceivables).where(and(eq(sakuFinanceReceivables.workspaceId, workspace.id), eq(sakuFinanceReceivables.customerReference, input.customerReference))).orderBy(desc(sakuFinanceReceivables.id)).limit(1).then((rows) => rows[0]);
}

export async function getSakuFinanceReview(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return { mutations: [], receivables: [] };
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!workspace) return { mutations: [], receivables: [] };
  const [mutations, receivables] = await Promise.all([
    db.select().from(sakuBankMutations).where(and(eq(sakuBankMutations.workspaceId, workspace.id), eq(sakuBankMutations.matchStatus, "unidentified"))).orderBy(desc(sakuBankMutations.createdAt)),
    db.select().from(sakuFinanceReceivables).where(and(eq(sakuFinanceReceivables.workspaceId, workspace.id), eq(sakuFinanceReceivables.status, "open"))).orderBy(desc(sakuFinanceReceivables.createdAt)),
  ]);
  return { mutations, receivables };
}

export async function getSakuFinanceStatements(ownerOpenId: string, from: Date, to: Date) {
  const db = await getDb();
  if (!db) return { mutations: [], receivables: [], journalEntries: [], from, to, basis: "Belum ada koneksi database." };
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!workspace) return { mutations: [], receivables: [], journalEntries: [], from, to, basis: "Workspace belum tersedia." };
  const [mutations, receivables, journalEntries] = await Promise.all([
    db.select().from(sakuBankMutations).where(and(eq(sakuBankMutations.workspaceId, workspace.id), gte(sakuBankMutations.createdAt, from), lte(sakuBankMutations.createdAt, to))).orderBy(sakuBankMutations.createdAt),
    db.select().from(sakuFinanceReceivables).where(and(eq(sakuFinanceReceivables.workspaceId, workspace.id), gte(sakuFinanceReceivables.createdAt, from), lte(sakuFinanceReceivables.createdAt, to))).orderBy(sakuFinanceReceivables.createdAt),
    db.select().from(sakuJournalEntries).where(and(eq(sakuJournalEntries.workspaceId, workspace.id), gte(sakuJournalEntries.transactionDate, from), lte(sakuJournalEntries.transactionDate, to))).orderBy(sakuJournalEntries.transactionDate),
  ]);
  return { mutations, receivables, journalEntries, from, to, basis: "Ringkasan indikatif dari mutasi bank, piutang, dan jurnal transaksi yang tercatat di SAKU. Lengkapi jurnal dan review akuntan sebelum diserahkan sebagai laporan resmi." };
}

export async function listSakuReconciliationRules(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!workspace) return [];
  return db.select().from(sakuReconciliationRules).where(eq(sakuReconciliationRules.workspaceId, workspace.id)).orderBy(desc(sakuReconciliationRules.id));
}

export async function createSakuReconciliationRule(ownerOpenId: string, input: { pattern: string; targetCategory: string; autoConfirm: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!workspace) throw new Error("Workspace is not available");
  await db.insert(sakuReconciliationRules).values({ workspaceId: workspace.id, pattern: input.pattern, targetCategory: input.targetCategory, autoConfirm: input.autoConfirm ? 1 : 0 });
  return db.select().from(sakuReconciliationRules).where(and(eq(sakuReconciliationRules.workspaceId, workspace.id), eq(sakuReconciliationRules.pattern, input.pattern))).orderBy(desc(sakuReconciliationRules.id)).limit(1).then((rows) => rows[0]);
}

export async function deleteSakuReconciliationRule(ownerOpenId: string, ruleId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!workspace) throw new Error("Workspace is not available");
  await db.delete(sakuReconciliationRules).where(and(eq(sakuReconciliationRules.id, ruleId), eq(sakuReconciliationRules.workspaceId, workspace.id)));
  return { success: true } as const;
}

export async function createSakuJournalEntry(ownerOpenId: string, input: { vendor: string; transactionDate: Date; total: number; itemsText: string; category?: string; sourceUrl?: string; sourceType?: string; entryType?: "expense" | "income" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!workspace) throw new Error("Workspace is not available");
  await db.insert(sakuJournalEntries).values({ workspaceId: workspace.id, vendor: input.vendor, transactionDate: input.transactionDate, entryType: input.entryType || "expense", total: input.total, itemsText: input.itemsText, category: input.category || null, sourceUrl: input.sourceUrl || null, sourceType: input.sourceType || "receipt" });
  return db.select().from(sakuJournalEntries).where(eq(sakuJournalEntries.workspaceId, workspace.id)).orderBy(desc(sakuJournalEntries.id)).limit(1).then((rows) => rows[0]);
}

export async function listSakuJournalEntries(ownerOpenId: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!workspace) return [];
  return db.select().from(sakuJournalEntries).where(eq(sakuJournalEntries.workspaceId, workspace.id)).orderBy(desc(sakuJournalEntries.transactionDate), desc(sakuJournalEntries.id)).limit(Math.min(Math.max(limit, 1), 50));
}

export async function findSakuJournalDuplicates(ownerOpenId: string, input: { vendor: string; transactionDate: Date; total: number; itemsText: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!workspace) throw new Error("Workspace is not available");
  const { start, end } = getSakuWibDayBounds(input.transactionDate);
  const rows = await db.select().from(sakuJournalEntries).where(and(eq(sakuJournalEntries.workspaceId, workspace.id), eq(sakuJournalEntries.total, input.total), gte(sakuJournalEntries.transactionDate, start), lte(sakuJournalEntries.transactionDate, end))).orderBy(desc(sakuJournalEntries.id));
  return rows.filter((row) => isReceiptDuplicate(row, input));
}

export async function listSakuMessages(ownerOpenId: string, channelId: string, options: { limit?: number; cursor?: number } = {}) {
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null };
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
  const where = and(eq(sakuMessages.ownerOpenId, ownerOpenId), eq(sakuMessages.channelId, channelId), options.cursor ? lt(sakuMessages.id, options.cursor) : undefined);
  const rows = await db.select().from(sakuMessages).where(where).orderBy(desc(sakuMessages.id)).limit(limit + 1);
  const page = rows.slice(0, limit).reverse();
  return { items: page, nextCursor: rows.length > limit ? page[0]?.id ?? null : null };
}

export async function insertSakuMessage(message: InsertSakuMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(sakuMessages).values(message).onDuplicateKeyUpdate({ set: { messageKey: message.messageKey } });
  const rows = await db.select().from(sakuMessages).where(and(eq(sakuMessages.ownerOpenId, message.ownerOpenId), eq(sakuMessages.messageKey, message.messageKey))).limit(1);
  return rows[0];
}

export async function listSakuWorkspaceMembers(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sakuWorkspaceMembers).where(eq(sakuWorkspaceMembers.ownerOpenId, ownerOpenId)).orderBy(desc(sakuWorkspaceMembers.id));
}
export async function getSakuWorkspaceMembership(memberOpenId?: string, email?: string) {
  const db = await getDb();
  if (!db || (!memberOpenId && !email)) return undefined;
  const identity = memberOpenId && email
    ? or(eq(sakuWorkspaceMembers.memberOpenId, memberOpenId), eq(sakuWorkspaceMembers.email, email.toLowerCase()))
    : memberOpenId
      ? eq(sakuWorkspaceMembers.memberOpenId, memberOpenId)
      : eq(sakuWorkspaceMembers.email, email!.toLowerCase());
  const rows = await db.select().from(sakuWorkspaceMembers).where(and(identity, eq(sakuWorkspaceMembers.status, "active"))).orderBy(desc(sakuWorkspaceMembers.id)).limit(1);
  return rows[0];
}
export async function listSakuPendingWorkspaceInvitations(email: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: sakuWorkspaceMembers.id, ownerOpenId: sakuWorkspaceMembers.ownerOpenId, email: sakuWorkspaceMembers.email, name: sakuWorkspaceMembers.name, role: sakuWorkspaceMembers.role, status: sakuWorkspaceMembers.status, businessName: sakuWorkspaces.businessName, createdAt: sakuWorkspaceMembers.createdAt })
    .from(sakuWorkspaceMembers)
    .leftJoin(sakuWorkspaces, eq(sakuWorkspaces.ownerOpenId, sakuWorkspaceMembers.ownerOpenId))
    .where(and(eq(sakuWorkspaceMembers.email, email.toLowerCase()), eq(sakuWorkspaceMembers.status, "pending")))
    .orderBy(desc(sakuWorkspaceMembers.createdAt));
}
export async function acceptSakuWorkspaceInvitation(input: { id: number; email: string; memberOpenId: string; name?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(sakuWorkspaceMembers).set({ memberOpenId: input.memberOpenId, status: "active", name: input.name?.trim() || undefined }).where(and(eq(sakuWorkspaceMembers.id, input.id), eq(sakuWorkspaceMembers.email, input.email.toLowerCase()), eq(sakuWorkspaceMembers.status, "pending")));
  const rows = await db.select().from(sakuWorkspaceMembers).where(eq(sakuWorkspaceMembers.id, input.id)).limit(1);
  return rows[0];
}
export async function inviteSakuWorkspaceMember(member: InsertSakuWorkspaceMember) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(sakuWorkspaceMembers).values(member);
  const rows = await db.select().from(sakuWorkspaceMembers).where(and(eq(sakuWorkspaceMembers.ownerOpenId, member.ownerOpenId), eq(sakuWorkspaceMembers.email, member.email))).orderBy(desc(sakuWorkspaceMembers.id)).limit(1);
  return rows[0];
}

export async function updateSakuWorkspaceMember(ownerOpenId: string, id: number, update: { role?: "admin" | "member"; status?: "pending" | "active" | "removed" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(sakuWorkspaceMembers).set(update).where(and(eq(sakuWorkspaceMembers.id, id), eq(sakuWorkspaceMembers.ownerOpenId, ownerOpenId)));
  const rows = await db.select().from(sakuWorkspaceMembers).where(and(eq(sakuWorkspaceMembers.id, id), eq(sakuWorkspaceMembers.ownerOpenId, ownerOpenId))).limit(1);
  return rows[0];
}

export async function listSakuSupportRequests(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sakuSupportRequests).where(eq(sakuSupportRequests.ownerOpenId, ownerOpenId)).orderBy(desc(sakuSupportRequests.id));
}

export async function createSakuSupportRequest(request: InsertSakuSupportRequest) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(sakuSupportRequests).values(request);
  const rows = await db.select().from(sakuSupportRequests).where(eq(sakuSupportRequests.ownerOpenId, request.ownerOpenId)).orderBy(desc(sakuSupportRequests.id)).limit(1);
  return rows[0];
}

export async function insertSakuFile(file: InsertSakuFile) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(sakuFiles).values(file);
  const rows = await db.select().from(sakuFiles).where(eq(sakuFiles.ownerOpenId, file.ownerOpenId)).orderBy(desc(sakuFiles.id)).limit(1);
  return rows[0];
}

export async function getSakuFiles(ownerOpenId: string, channelId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sakuFiles).where(and(eq(sakuFiles.ownerOpenId, ownerOpenId), eq(sakuFiles.channelId, channelId))).orderBy(desc(sakuFiles.id));
}
export async function getSakuFileByStorageKey(ownerOpenId: string, storageKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select({ id: sakuFiles.id, ownerOpenId: sakuFiles.ownerOpenId, storageKey: sakuFiles.storageKey }).from(sakuFiles).where(and(eq(sakuFiles.ownerOpenId, ownerOpenId), eq(sakuFiles.storageKey, storageKey))).limit(1);
  return rows[0];
}

export async function updateSakuFileExtraction(ownerOpenId: string, id: number, update: { detectedKind: string; extractionStatus: "pending" | "complete" | "unsupported" | "failed"; extractedText?: string; structuredPreview?: string }) {
  const db = await getDb();
  if (!db) return undefined;
  await db.update(sakuFiles).set(update).where(and(eq(sakuFiles.id, id), eq(sakuFiles.ownerOpenId, ownerOpenId)));
  const rows = await db.select().from(sakuFiles).where(and(eq(sakuFiles.id, id), eq(sakuFiles.ownerOpenId, ownerOpenId))).limit(1);
  return rows[0];
}

export async function listSakuDivisions(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sakuDivisions).where(eq(sakuDivisions.ownerOpenId, ownerOpenId)).orderBy(desc(sakuDivisions.id));
}
export async function getSakuDivisionByChannel(ownerOpenId: string, channelId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(sakuDivisions).where(and(eq(sakuDivisions.ownerOpenId, ownerOpenId), eq(sakuDivisions.channelId, channelId))).limit(1);
  return rows[0];
}
export async function createSakuDivision(division: InsertSakuDivision) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(sakuDivisions).values(division);
  const rows = await db.select().from(sakuDivisions).where(eq(sakuDivisions.ownerOpenId, division.ownerOpenId)).orderBy(desc(sakuDivisions.id)).limit(1);
  return rows[0];
}

export async function listSakuAutomations(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sakuAutomations).where(eq(sakuAutomations.ownerOpenId, ownerOpenId)).orderBy(desc(sakuAutomations.id));
}

export async function createSakuAutomation(automation: InsertSakuAutomation) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(sakuAutomations).values(automation);
  const rows = await db.select().from(sakuAutomations).where(eq(sakuAutomations.ownerOpenId, automation.ownerOpenId)).orderBy(desc(sakuAutomations.id)).limit(1);
  return rows[0];
}

export async function updateSakuAutomationSchedule(ownerOpenId: string, id: number, schedule: { scheduleCron?: string | null; scheduleCronTaskUid?: string | null; status?: "draft" | "active" | "paused" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(sakuAutomations).set(schedule).where(and(eq(sakuAutomations.id, id), eq(sakuAutomations.ownerOpenId, ownerOpenId)));
  const rows = await db.select().from(sakuAutomations).where(and(eq(sakuAutomations.id, id), eq(sakuAutomations.ownerOpenId, ownerOpenId))).limit(1);
  return rows[0];
}

export async function getSakuAutomationByScheduleTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(sakuAutomations).where(eq(sakuAutomations.scheduleCronTaskUid, taskUid)).limit(1);
  return rows[0];
}

export const SAKU_PIPELINE_TEMPLATES = [
  { id: "sales", department: "Sales", name: "Lead sampai Closing", description: "Mengubah lead masuk menjadi pelanggan yang terlayani dan terukur.", steps: ["Lead masuk", "Kualifikasi kebutuhan", "Follow-up", "Kirim penawaran", "Negosiasi", "Closing", "After-sales"] },
  { id: "finance", department: "Finance", name: "Kontrol Arus Kas", description: "Menjaga transaksi tercatat, tagihan terpantau, dan arus kas sehat.", steps: ["Catat transaksi", "Cek bukti", "Rekonsiliasi", "Pantau piutang", "Review biaya", "Laporan mingguan"] },
  { id: "marketing", department: "Marketing", name: "Campaign sampai Publish", description: "Membawa ide kampanye dari brief sampai evaluasi hasil.", steps: ["Brief kampanye", "Riset audiens", "Buat konsep", "Produksi konten", "Review", "Publish", "Evaluasi performa"] },
  { id: "operations", department: "Operations", name: "Order sampai Terkirim", description: "Memastikan order diproses konsisten sesuai SOP dan tepat waktu.", steps: ["Order masuk", "Cek stok", "Picking", "Packing", "Quality check", "Serah ke kurir", "Konfirmasi terkirim"] },
] as const;

export function getSakuPipelineTemplate(idOrArea: string) {
  const value = idOrArea.toLowerCase();
  return SAKU_PIPELINE_TEMPLATES.find((template) => template.id === value || template.department.toLowerCase() === value || value.includes(template.id)) || SAKU_PIPELINE_TEMPLATES[0];
}

export function buildSakuPipelineTemplateRecord(ownerOpenId: string, channelId: string) {
  const template = getSakuPipelineTemplate(channelId);
  return { ownerOpenId, channelId, name: template.name, status: "active" as const, currentStep: 1, stepsText: JSON.stringify(template.steps) };
}

const SEEDED_EMPLOYEE_CONTEXT: Record<string, { name: string; roleTitle: string; skills: string[]; memory: string; dataAccess: string[]; pipeline: string[]; automation: string }> = {
  assistant: { name: "Dita", roleTitle: "Asisten Pribadi", skills: ["Prioritas", "Koordinasi", "Ringkasan"], memory: "Pemilik bisnis suka update yang ringkas dan langsung bisa ditindaklanjuti.", dataAccess: ["Penjualan", "Stok", "Dokumen"], pipeline: ["Prioritas", "Delegasi", "Update"], automation: "Ringkasan pagi" },
  sales: { name: "Raka", roleTitle: "Senior Sales", skills: ["Follow-up", "Kualifikasi lead", "Penawaran"], memory: "Lead hangat wajib di-follow-up maksimal 24 jam.", dataAccess: ["CRM", "Pesanan", "Riwayat pelanggan"], pipeline: ["Lead", "Follow-up", "Closing"], automation: "Alert lead hangat" },
  marketing: { name: "Sari", roleTitle: "Content Strategist", skills: ["Copywriting", "Campaign", "Analitik"], memory: "Brand bisnis harus terasa hangat, jujur, dan tidak berlebihan.", dataAccess: ["Campaign", "Kalender konten", "Performa"], pipeline: ["Brief", "Draft", "Review", "Publish"], automation: "Rangkuman performa" },
  finance: { name: "Kiki", roleTitle: "Finance Controller", skills: ["Cashflow", "Rekonsiliasi", "Laporan"], memory: "Pisahkan uang operasional dan uang pribadi.", dataAccess: ["Transaksi", "Biaya", "Laporan"], pipeline: ["Catat", "Cek", "Rekonsiliasi"], automation: "Pengingat rekonsiliasi" },
  operations: { name: "Gilang", roleTitle: "Ops Lead", skills: ["SOP", "Stok", "Quality check"], memory: "Checklist packing harus selesai sebelum pickup kurir.", dataAccess: ["Stok", "Pesanan", "SOP"], pipeline: ["Order", "Packing", "Pickup"], automation: "Alert stok menipis" },
};

type SakuEmployeeBundleDeps = {
  getAgent: typeof getSakuAgentByChannel;
  getDivision?: typeof getSakuDivisionByChannel;
  upsertAgent: typeof upsertSakuAgent;
  createMemory: typeof createSakuMemory;
  createPipeline: typeof createSakuPipeline;
  createAutomation: typeof createSakuAutomation;
};

export async function ensureSakuEmployeeBundle(ownerOpenId: string, channelId: string, deps: SakuEmployeeBundleDeps = { getAgent: getSakuAgentByChannel, getDivision: getSakuDivisionByChannel, upsertAgent: upsertSakuAgent, createMemory: createSakuMemory, createPipeline: createSakuPipeline, createAutomation: createSakuAutomation }) {
  const existing = await deps.getAgent(ownerOpenId, channelId);
  if (existing) return existing;
  let seed = SEEDED_EMPLOYEE_CONTEXT[channelId];
  if (!seed) {
    const division = deps.getDivision ? await deps.getDivision(ownerOpenId, channelId) : (await listSakuDivisions(ownerOpenId)).find((item) => item.channelId === channelId);
    if (!division) return undefined;
    const cleanName = division.name.replace(/^Tim\s+/i, "").trim() || "Divisi";
    seed = {
      name: `Nara · ${cleanName}`,
      roleTitle: `Lead ${cleanName}`,
      skills: ["Koordinasi", "Eksekusi", "Pelaporan"],
      memory: `${division.name} fokus pada ${division.description.trim() || `prioritas ${division.businessArea}`}. Selalu rangkum progres, risiko, dan langkah berikutnya.`,
      dataAccess: [`Data ${division.businessArea}`, "Dokumen", "Percakapan"],
      pipeline: ["Brief", "Kerjakan", "Update"],
      automation: `Update progres ${division.name}`,
    };
  }
  const agent = await deps.upsertAgent({ ownerOpenId, channelId, name: seed.name, roleTitle: seed.roleTitle, status: "online", personality: "Hangat, terstruktur, dan proaktif.", skillsText: JSON.stringify(seed.skills), dataAccessText: JSON.stringify(seed.dataAccess) });
  if (agent?.id) {
    await deps.createMemory({ ownerOpenId, agentId: agent.id, memory: seed.memory, importance: "high" });
    const existingPipelines = await listSakuPipelines(ownerOpenId, channelId);
    if (!existingPipelines.length) {
      await deps.createPipeline(SEEDED_EMPLOYEE_CONTEXT[channelId]
        ? buildSakuPipelineTemplateRecord(ownerOpenId, channelId)
        : { ownerOpenId, channelId, name: `${seed.name} workflow`, status: "active", currentStep: 1, stepsText: JSON.stringify(seed.pipeline) });
    }
    const existingAutomations = await listSakuAutomations(ownerOpenId);
    if (!existingAutomations.some((automation) => automation.channelId === channelId)) {
      await deps.createAutomation({ ownerOpenId, channelId, name: seed.automation, description: `Automasi utama untuk ${seed.roleTitle}.`, trigger: "Sesuai ritme kerja tim", status: "active" });
    }
  }
  return agent;
}

const ONBOARDING_CHANNELS: Record<string, string> = {
  Penjualan: "sales",
  Marketing: "marketing",
  Keuangan: "finance",
  Operasional: "operations",
};

export async function seedSakuOnboarding(ownerOpenId: string, priorities: string[] = ["Penjualan"], deps: SakuEmployeeBundleDeps = { getAgent: getSakuAgentByChannel, upsertAgent: upsertSakuAgent, createMemory: createSakuMemory, createPipeline: createSakuPipeline, createAutomation: createSakuAutomation }) {
  const requestedChannels = priorities.map((priority) => ONBOARDING_CHANNELS[priority]).filter(Boolean);
  const channels = Array.from(new Set(["assistant", ...requestedChannels]));
  const seededChannels: string[] = [];
  for (const channelId of channels) {
    const agent = await ensureSakuEmployeeBundle(ownerOpenId, channelId, deps);
    if (agent) seededChannels.push(channelId);
  }
  return { seededChannels, priorities: priorities.filter((priority) => ONBOARDING_CHANNELS[priority]) };
}

export async function listSakuAgents(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sakuAgents).where(eq(sakuAgents.ownerOpenId, ownerOpenId)).orderBy(desc(sakuAgents.id));
}

export async function getSakuAgentByChannel(ownerOpenId: string, channelId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(sakuAgents).where(and(eq(sakuAgents.ownerOpenId, ownerOpenId), eq(sakuAgents.channelId, channelId))).orderBy(desc(sakuAgents.id)).limit(1);
  return rows[0];
}

export async function upsertSakuAgent(agent: InsertSakuAgent) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(sakuAgents).values(agent);
  const rows = await db.select().from(sakuAgents).where(eq(sakuAgents.ownerOpenId, agent.ownerOpenId)).orderBy(desc(sakuAgents.id)).limit(1);
  return rows[0];
}

export async function getSakuTeamStandards(ownerOpenId: string, channelId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(sakuTeamStandards).where(and(eq(sakuTeamStandards.ownerOpenId, ownerOpenId), eq(sakuTeamStandards.channelId, channelId))).limit(1);
  return rows[0];
}

export async function upsertSakuTeamStandards(standards: InsertSakuTeamStandard) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(sakuTeamStandards).values(standards).onDuplicateKeyUpdate({ set: { purpose: standards.purpose, principles: standards.principles, responseStyle: standards.responseStyle, outputFormat: standards.outputFormat, guardrails: standards.guardrails, checklist: standards.checklist, updatedAt: new Date() } });
  return getSakuTeamStandards(standards.ownerOpenId, standards.channelId);
}

export function buildDefaultSakuTeamStandards(channelId: string, teamName: string, roleTitle: string) {
  const focus = channelId === "sales" ? "mengubah peluang yang relevan menjadi pelanggan" : channelId === "marketing" ? "menghasilkan konten dan campaign yang konsisten" : channelId === "finance" ? "menjaga pencatatan dan keputusan keuangan tetap akurat" : channelId === "operations" ? "menjaga pekerjaan harian, stok, dan kualitas tetap terkendali" : "membantu pemilik bisnis memilih prioritas dan menyelesaikan pekerjaan";
  return {
    purpose: `${teamName} bertugas ${focus}. ${roleTitle} harus menjaga percakapan tetap berada di ruang lingkup tim ini.`,
    principles: "Mulai dari tujuan pemilik; gunakan data yang tersedia; bedakan fakta, asumsi, dan rekomendasi; prioritaskan pekerjaan yang paling berdampak; jangan melompati tahap kerja yang sudah ditetapkan.",
    responseStyle: "Gunakan Bahasa Indonesia yang ringkas, hangat, profesional, dan langsung ke inti. Ajukan satu pertanyaan klarifikasi yang paling penting bila konteks belum cukup.",
    outputFormat: "Mulai dengan kesimpulan singkat; lanjutkan dengan status atau fakta penting; gunakan bullet untuk langkah kerja; sebutkan asumsi dan risiko; tutup dengan next step yang jelas.",
    guardrails: "Jangan mengarang data, harga, status, sumber, atau hasil tindakan. Jangan mengambil keputusan berisiko tanpa persetujuan pemilik. Jangan menjalankan tindakan di luar ruang lingkup tim. Jika aturan bertentangan, berhenti dan minta arahan.",
    checklist: "Pahami tujuan; pastikan permintaan sesuai peran tim; cek memory, dokumen, dan data; pilih pipeline yang tepat; periksa guardrail; jawab sesuai format; berikan next step.",
  } satisfies Omit<InsertSakuTeamStandard, "ownerOpenId" | "channelId">;
}

export async function ensureSakuTeamStandards(ownerOpenId: string, channelId: string, teamName: string, roleTitle: string) {
  const existing = await getSakuTeamStandards(ownerOpenId, channelId);
  if (existing) return existing;
  return upsertSakuTeamStandards({ ownerOpenId, channelId, ...buildDefaultSakuTeamStandards(channelId, teamName, roleTitle) });
}

export async function getSakuTeamConfiguration(ownerOpenId: string, channelId: string, teamName: string, roleTitle: string, memoryQuery?: string, ownerName?: string, businessName?: string) {
  const agent = await ensureSakuEmployeeBundle(ownerOpenId, channelId);
  const [division, standards, pipelines, automations] = await Promise.all([
    getSakuDivisionByChannel(ownerOpenId, channelId),
    ensureSakuTeamStandards(ownerOpenId, channelId, teamName, agent?.roleTitle || roleTitle),
    listSakuPipelines(ownerOpenId, channelId),
    listSakuAutomations(ownerOpenId),
  ]);
  const memories = agent?.id ? await listSakuMemories(ownerOpenId, agent.id, memoryQuery) : [];
  return {
    division,
    agent,
    standards,
    memories: memories.map((memory) => ({ ...memory, memory: memory.memory.replace(/\bkak\s+rani\b/gi, ownerName || "pemilik bisnis").replace(/\btoko\s+rona\b/gi, businessName || "bisnis ini") })),
    pipelines,
    automations: automations.filter((automation) => automation.channelId === channelId),
  };
}

export function selectRelevantMemories<T extends { memory: string; importance: string; embeddingJson?: string | null }>(rows: T[], query?: string, queryEmbedding?: Embedding) {
  if (!query?.trim()) return rows.slice(0, 12);
  if (queryEmbedding) {
    const semanticMatches = rows
      .map((row) => ({ row, score: cosineSimilarity(queryEmbedding, parseEmbedding(row.embeddingJson)) }))
      .filter((item): item is { row: T; score: number } => typeof item.score === "number")
      .filter((item) => item.score >= 0.2)
      .sort((a, b) => b.score - a.score || Number(b.row.importance === "high") - Number(a.row.importance === "high"))
      .slice(0, 6)
      .map((item) => item.row);
    if (semanticMatches.length) return semanticMatches;
  }
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
  return [...rows].sort((a, b) => Number(b.importance === "high") - Number(a.importance === "high")).filter((row) => terms.some((term) => row.memory.toLowerCase().includes(term)) || row.importance === "high").slice(0, 6);
}

export async function listSakuMemories(ownerOpenId: string, agentId: number, query?: string) {
  const db = await getDb();
  if (!db) return [];
  const agentMemories = await db.select().from(sakuMemories).where(and(eq(sakuMemories.ownerOpenId, ownerOpenId), eq(sakuMemories.agentId, agentId))).orderBy(desc(sakuMemories.id));
  const queryEmbedding = query ? await createTextEmbedding(query) : undefined;
  return selectRelevantMemories(agentMemories, query, queryEmbedding);
}

export async function getSakuWorkspaceSnapshot(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return { divisions: 0, files: 0, automations: 0, pipelines: 0 };
  const [divisions, files, automations, pipelines] = await Promise.all([
    db.select().from(sakuDivisions).where(eq(sakuDivisions.ownerOpenId, ownerOpenId)),
    db.select().from(sakuFiles).where(eq(sakuFiles.ownerOpenId, ownerOpenId)),
    db.select().from(sakuAutomations).where(eq(sakuAutomations.ownerOpenId, ownerOpenId)),
    db.select().from(sakuPipelines).where(eq(sakuPipelines.ownerOpenId, ownerOpenId)),
  ]);
  return { divisions: divisions.length, files: files.length, automations: automations.length, pipelines: pipelines.length };
}

export async function createSakuMemory(memory: InsertSakuMemory) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const embeddingResult = await createTextEmbeddingWithProvider(memory.memory);
  await db.insert(sakuMemories).values({
    ...memory,
    embeddingJson: embeddingResult ? JSON.stringify(embeddingResult.embedding) : null,
    embeddingProvider: embeddingResult?.provider ?? "keyword",
  });
  const rows = await db.select().from(sakuMemories).where(eq(sakuMemories.ownerOpenId, memory.ownerOpenId)).orderBy(desc(sakuMemories.id)).limit(1);
  return rows[0];
}

export async function backfillSakuMemoryEmbeddings() {
  const db = await getDb();
  if (!db) return { scanned: 0, updated: 0, failed: 0 };
  const rows = await db.select().from(sakuMemories).where(or(isNull(sakuMemories.embeddingJson), isNull(sakuMemories.embeddingProvider), eq(sakuMemories.embeddingProvider, "manus-projection"), eq(sakuMemories.embeddingProvider, "keyword")));
  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      if (row.embeddingProvider === "manus-projection") {
        await db.update(sakuMemories).set({ embeddingJson: null, embeddingProvider: "keyword" }).where(eq(sakuMemories.id, row.id));
        updated += 1;
        continue;
      }
      const embeddingResult = await createTextEmbeddingWithProvider(row.memory);
      if (!embeddingResult) {
        failed += 1;
        continue;
      }
      await db.update(sakuMemories).set({ embeddingJson: JSON.stringify(embeddingResult.embedding), embeddingProvider: embeddingResult.provider }).where(eq(sakuMemories.id, row.id));
      updated += 1;
    } catch (error) {
      failed += 1;
      console.warn(`[Embeddings] backfill failed memoryId=${row.id}:`, error);
    }
  }
  console.info(`[Embeddings] backfill scanned=${rows.length} updated=${updated} failed=${failed}`);
  return { scanned: rows.length, updated, failed };
}

export async function listSakuPipelineTemplates() {
  return SAKU_PIPELINE_TEMPLATES;
}

export async function listSakuInventoryItems(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sakuInventoryItems).where(and(eq(sakuInventoryItems.ownerOpenId, ownerOpenId), eq(sakuInventoryItems.status, "active"))).orderBy(sakuInventoryItems.name);
}

export async function createSakuInventoryItem(item: InsertSakuInventoryItem) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(sakuInventoryItems).values(item);
  const rows = await db.select().from(sakuInventoryItems).where(and(eq(sakuInventoryItems.ownerOpenId, item.ownerOpenId), eq(sakuInventoryItems.sku, item.sku))).orderBy(desc(sakuInventoryItems.id)).limit(1);
  return rows[0];
}

export async function listSakuInventoryMovements(ownerOpenId: string, itemId?: number) {
  const db = await getDb();
  if (!db) return [];
  const where = itemId
    ? and(eq(sakuInventoryMovements.ownerOpenId, ownerOpenId), eq(sakuInventoryMovements.itemId, itemId))
    : eq(sakuInventoryMovements.ownerOpenId, ownerOpenId);
  return db.select().from(sakuInventoryMovements).where(where).orderBy(desc(sakuInventoryMovements.id)).limit(100);
}

export function calculateSakuInventoryQuantity(currentQuantity: number, movementType: "in" | "out" | "adjustment", quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Jumlah stok harus lebih dari 0.");
  const nextQuantity = movementType === "in" ? currentQuantity + quantity : movementType === "out" ? currentQuantity - quantity : quantity;
  if (nextQuantity < 0) throw new Error("Stok tidak cukup untuk pergerakan ini.");
  return Math.round(nextQuantity * 1_000_000) / 1_000_000;
}

export async function recordSakuInventoryMovement(ownerOpenId: string, input: { itemId: number; movementType: InsertSakuInventoryMovement["movementType"]; quantity: number; note?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(sakuInventoryItems).where(and(eq(sakuInventoryItems.ownerOpenId, ownerOpenId), eq(sakuInventoryItems.id, input.itemId), eq(sakuInventoryItems.status, "active"))).limit(1);
  const item = rows[0];
  if (!item) throw new Error("Produk inventory tidak ditemukan.");
  let nextQuantity: number;
  try {
    nextQuantity = calculateSakuInventoryQuantity(item.quantity, input.movementType, input.quantity);
  } catch {
    throw new Error(`Stok ${item.name} tidak cukup. Saldo saat ini ${item.quantity} ${item.unit}.`);
  }
  await db.insert(sakuInventoryMovements).values({ ownerOpenId, itemId: item.id, movementType: input.movementType, quantity: input.quantity, note: input.note || null, sourceType: "manual", sourceId: null });
  await db.update(sakuInventoryItems).set({ quantity: nextQuantity }).where(and(eq(sakuInventoryItems.ownerOpenId, ownerOpenId), eq(sakuInventoryItems.id, item.id)));
  const updated = await db.select().from(sakuInventoryItems).where(eq(sakuInventoryItems.id, item.id)).limit(1);
  return updated[0];
}

export async function listSakuWorkspaceBusinessTypes(ownerOpenId: string) {
  const db = await getDb();
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!db || !workspace) return [];
  return db.select().from(sakuWorkspaceBusinessTypes).where(and(eq(sakuWorkspaceBusinessTypes.workspaceId, workspace.id), eq(sakuWorkspaceBusinessTypes.active, 1))).orderBy(desc(sakuWorkspaceBusinessTypes.isPrimary), sakuWorkspaceBusinessTypes.businessType);
}

export async function replaceSakuWorkspaceBusinessTypes(ownerOpenId: string, types: Array<"service" | "retail" | "manufacturing" | "food_beverage">) {
  const db = await getDb();
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!db || !workspace) throw new Error("Workspace is not available");
  const uniqueTypes = Array.from(new Set(types));
  if (!uniqueTypes.length) throw new Error("Pilih minimal satu jenis usaha.");
  await db.update(sakuWorkspaceBusinessTypes).set({ active: 0 }).where(eq(sakuWorkspaceBusinessTypes.workspaceId, workspace.id));
  for (let index = 0; index < uniqueTypes.length; index += 1) { const businessType = uniqueTypes[index]; await db.insert(sakuWorkspaceBusinessTypes).values({ workspaceId: workspace.id, businessType, isPrimary: index === 0 ? 1 : 0, active: 1 }).onDuplicateKeyUpdate({ set: { isPrimary: index === 0 ? 1 : 0, active: 1 } }); }
  return listSakuWorkspaceBusinessTypes(ownerOpenId);
}

export async function listSakuSalesOrders(ownerOpenId: string) {
  const db = await getDb();
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!db || !workspace) return [];
  return db.select().from(sakuSalesOrders).where(eq(sakuSalesOrders.workspaceId, workspace.id)).orderBy(desc(sakuSalesOrders.id)).limit(100);
}

export async function createSakuSalesOrder(ownerOpenId: string, input: { orderNumber: string; channelId?: string; customerId?: number; lines: Array<{ itemId: number; quantity: number; unitPrice?: number }>; discount?: number; tax?: number; paymentStatus?: "unpaid" | "partial" | "paid" | "refunded" }) {
  const db = await getDb();
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!db || !workspace) throw new Error("Workspace is not available");
  if (!input.lines.length) throw new Error("Order harus memiliki minimal satu item.");
  const items = await db.select().from(sakuInventoryItems).where(and(eq(sakuInventoryItems.ownerOpenId, ownerOpenId), eq(sakuInventoryItems.status, "active")));
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const lines = input.lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("Jumlah item order harus lebih dari 0.");
    const item = itemMap.get(line.itemId);
    if (!item || !item.sellable) throw new Error("Item order tidak ditemukan atau tidak dapat dijual.");
    const unitPrice = line.unitPrice ?? item.sellingPrice;
    return { item, quantity: line.quantity, unitPrice, lineTotal: line.quantity * unitPrice };
  });
  const subtotal = lines.reduce((total, line) => total + line.lineTotal, 0);
  const discount = Math.max(0, input.discount || 0);
  const tax = Math.max(0, input.tax || 0);
  const total = Math.max(0, subtotal - discount + tax);
  await db.insert(sakuSalesOrders).values({ workspaceId: workspace.id, orderNumber: input.orderNumber, channelId: input.channelId || null, customerId: input.customerId || null, status: "draft", subtotal, discount, tax, total, paymentStatus: input.paymentStatus || "unpaid" });
  const order = await db.select().from(sakuSalesOrders).where(and(eq(sakuSalesOrders.workspaceId, workspace.id), eq(sakuSalesOrders.orderNumber, input.orderNumber))).limit(1).then((rows) => rows[0]);
  if (!order) throw new Error("Order belum bisa disimpan.");
  await db.insert(sakuSalesOrderLines).values(lines.map((line) => ({ orderId: order.id, itemId: line.item.id, quantity: line.quantity, unitPrice: line.unitPrice, costPriceSnapshot: line.item.costPrice, lineTotal: line.lineTotal })));
  return { ...order, lines: await db.select().from(sakuSalesOrderLines).where(eq(sakuSalesOrderLines.orderId, order.id)) };
}

export async function confirmSakuSalesOrder(ownerOpenId: string, orderId: number) {
  const db = await getDb();
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!db || !workspace) throw new Error("Workspace is not available");
  const order = await db.select().from(sakuSalesOrders).where(and(eq(sakuSalesOrders.id, orderId), eq(sakuSalesOrders.workspaceId, workspace.id))).limit(1).then((rows) => rows[0]);
  if (!order) throw new Error("Order tidak ditemukan.");
  if (order.status !== "draft") return order;
  const lines = await db.select().from(sakuSalesOrderLines).where(eq(sakuSalesOrderLines.orderId, order.id));
  const items = await db.select().from(sakuInventoryItems).where(and(eq(sakuInventoryItems.ownerOpenId, ownerOpenId), eq(sakuInventoryItems.status, "active")));
  const itemMap = new Map(items.map((item) => [item.id, item]));
  for (const line of lines) {
    const item = itemMap.get(line.itemId);
    if (!item) throw new Error("Item order tidak ditemukan.");
    if (item.trackStock && item.quantity < line.quantity) throw new Error(`Stok ${item.name} tidak cukup. Saldo saat ini ${item.quantity} ${item.unit}.`);
  }
  for (const line of lines) {
    const item = itemMap.get(line.itemId);
    if (item?.trackStock) {
      await db.insert(sakuInventoryMovements).values({ ownerOpenId, itemId: item.id, movementType: "out", quantity: line.quantity, note: `Penjualan ${order.orderNumber}`, sourceType: "sale", sourceId: order.id });
      await db.update(sakuInventoryItems).set({ quantity: item.quantity - line.quantity }).where(and(eq(sakuInventoryItems.id, item.id), eq(sakuInventoryItems.ownerOpenId, ownerOpenId)));
    }
  }
  await db.update(sakuSalesOrders).set({ status: "confirmed" }).where(and(eq(sakuSalesOrders.id, order.id), eq(sakuSalesOrders.workspaceId, workspace.id)));
  return db.select().from(sakuSalesOrders).where(eq(sakuSalesOrders.id, order.id)).limit(1).then((rows) => rows[0]);
}

export async function listSakuBoms(ownerOpenId: string) {
  const db = await getDb();
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!db || !workspace) return [];
  const boms = await db.select().from(sakuBoms).where(and(eq(sakuBoms.workspaceId, workspace.id), eq(sakuBoms.status, "active"))).orderBy(desc(sakuBoms.id));
  if (!boms.length) return [];
  const lines = await db.select().from(sakuBomLines).where(or(...boms.map((bom) => eq(sakuBomLines.bomId, bom.id))));
  return boms.map((bom) => ({ ...bom, lines: lines.filter((line) => line.bomId === bom.id) }));
}

export async function createSakuBom(ownerOpenId: string, input: { name: string; version: string; outputItemId: number; outputQuantity: number; unit: string; lines: Array<{ inputItemId: number; quantity: number; unit: string; wastePercent?: number }> }) {
  const db = await getDb();
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!db || !workspace) throw new Error("Workspace is not available");
  if (!input.lines.length) throw new Error("Resep harus memiliki minimal satu bahan.");
  const items = await db.select().from(sakuInventoryItems).where(and(eq(sakuInventoryItems.ownerOpenId, ownerOpenId), eq(sakuInventoryItems.status, "active")));
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const output = itemMap.get(input.outputItemId);
  if (!output || !output.producible) throw new Error("Produk hasil belum ditandai sebagai produk yang bisa diproduksi.");
  for (const line of input.lines) {
    const inputItem = itemMap.get(line.inputItemId);
    if (!inputItem || !inputItem.trackStock) throw new Error("Semua bahan resep harus berupa item dengan stok yang dilacak.");
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error("Jumlah bahan resep harus lebih dari 0.");
    if (!Number.isInteger(line.wastePercent) || (line.wastePercent || 0) < 0 || (line.wastePercent || 0) > 100) throw new Error("Waste resep harus berada di antara 0 sampai 100 persen.");
  }
  await db.insert(sakuBoms).values({ workspaceId: workspace.id, outputItemId: input.outputItemId, name: input.name, version: input.version, outputQuantity: input.outputQuantity, unit: input.unit, status: "active" });
  const bom = await db.select().from(sakuBoms).where(and(eq(sakuBoms.workspaceId, workspace.id), eq(sakuBoms.name, input.name), eq(sakuBoms.version, input.version))).orderBy(desc(sakuBoms.id)).limit(1).then((rows) => rows[0]);
  if (!bom) throw new Error("Resep belum bisa disimpan.");
  await db.insert(sakuBomLines).values(input.lines.map((line) => ({ bomId: bom.id, inputItemId: line.inputItemId, quantity: line.quantity, unit: line.unit, wastePercent: line.wastePercent || 0 })));
  return { ...bom, lines: await db.select().from(sakuBomLines).where(eq(sakuBomLines.bomId, bom.id)) };
}

export async function createSakuProductionOrder(ownerOpenId: string, input: { bomId: number; orderNumber: string; plannedQuantity: number; notes?: string }) {
  const db = await getDb();
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!db || !workspace) throw new Error("Workspace is not available");
  if (!Number.isFinite(input.plannedQuantity) || input.plannedQuantity <= 0) throw new Error("Jumlah produksi harus lebih dari 0.");
  const bom = await db.select().from(sakuBoms).where(and(eq(sakuBoms.id, input.bomId), eq(sakuBoms.workspaceId, workspace.id), eq(sakuBoms.status, "active"))).limit(1).then((rows) => rows[0]);
  if (!bom) throw new Error("BOM/resep tidak ditemukan.");
  await db.insert(sakuProductionOrders).values({ workspaceId: workspace.id, bomId: bom.id, outputItemId: bom.outputItemId, orderNumber: input.orderNumber, plannedQuantity: input.plannedQuantity, actualQuantity: 0, status: "draft", notes: input.notes || null });
  return db.select().from(sakuProductionOrders).where(and(eq(sakuProductionOrders.workspaceId, workspace.id), eq(sakuProductionOrders.orderNumber, input.orderNumber))).limit(1).then((rows) => rows[0]);
}

export async function listSakuProductionOrders(ownerOpenId: string) {
  const db = await getDb();
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!db || !workspace) return [];
  return db.select().from(sakuProductionOrders).where(eq(sakuProductionOrders.workspaceId, workspace.id)).orderBy(desc(sakuProductionOrders.id)).limit(100);
}

export function calculateSakuProductionConsumption(baseQuantity: number, outputQuantity: number, bomOutputQuantity: number, wastePercent = 0) {
  if (![baseQuantity, outputQuantity, bomOutputQuantity, wastePercent].every(Number.isFinite) || baseQuantity <= 0 || outputQuantity <= 0 || bomOutputQuantity <= 0 || wastePercent < 0) throw new Error("Parameter konsumsi produksi tidak valid.");
  return Math.round(((baseQuantity * outputQuantity * (100 + wastePercent)) / (bomOutputQuantity * 100)) * 1_000_000) / 1_000_000;
}

export async function completeSakuProductionOrder(ownerOpenId: string, productionOrderId: number, actualQuantity?: number) {
  const db = await getDb();
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!db || !workspace) throw new Error("Workspace is not available");
  const order = await db.select().from(sakuProductionOrders).where(and(eq(sakuProductionOrders.id, productionOrderId), eq(sakuProductionOrders.workspaceId, workspace.id))).limit(1).then((rows) => rows[0]);
  if (!order) throw new Error("Production order tidak ditemukan.");
  if (order.status === "completed") return order;
  if (order.status === "cancelled") throw new Error("Production order sudah dibatalkan.");
  const outputQuantity = actualQuantity ?? order.plannedQuantity;
  if (!Number.isFinite(outputQuantity) || outputQuantity <= 0) throw new Error("Hasil produksi harus lebih dari 0.");
  const bom = await db.select().from(sakuBoms).where(eq(sakuBoms.id, order.bomId)).limit(1).then((rows) => rows[0]);
  if (!bom) throw new Error("BOM/resep tidak ditemukan.");
  const lines = await db.select().from(sakuBomLines).where(eq(sakuBomLines.bomId, bom.id));
  const items = await db.select().from(sakuInventoryItems).where(and(eq(sakuInventoryItems.ownerOpenId, ownerOpenId), eq(sakuInventoryItems.status, "active")));
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const consumptions = lines.map((line) => ({ line, quantity: calculateSakuProductionConsumption(line.quantity, outputQuantity, bom.outputQuantity, line.wastePercent) }));
  for (const consumption of consumptions) {
    const item = itemMap.get(consumption.line.inputItemId);
    if (!item) throw new Error("Bahan resep tidak ditemukan.");
    if (item.quantity < consumption.quantity) throw new Error(`Bahan ${item.name} tidak cukup. Saldo saat ini ${item.quantity} ${item.unit}.`);
  }
  const output = itemMap.get(order.outputItemId);
  if (!output) throw new Error("Produk hasil produksi tidak ditemukan.");
  for (const consumption of consumptions) {
    const item = itemMap.get(consumption.line.inputItemId);
    if (!item) continue;
    await db.insert(sakuInventoryMovements).values({ ownerOpenId, itemId: item.id, movementType: "out", quantity: consumption.quantity, note: `Konsumsi produksi ${order.orderNumber}`, sourceType: "production", sourceId: order.id });
    await db.update(sakuInventoryItems).set({ quantity: item.quantity - consumption.quantity }).where(and(eq(sakuInventoryItems.id, item.id), eq(sakuInventoryItems.ownerOpenId, ownerOpenId)));
    const baseQuantity = calculateSakuProductionConsumption(consumption.line.quantity, outputQuantity, bom.outputQuantity, 0);
    await db.insert(sakuProductionConsumptions).values({ productionOrderId: order.id, inputItemId: item.id, plannedQuantity: consumption.quantity, actualQuantity: consumption.quantity, wasteQuantity: Math.max(0, Math.round((consumption.quantity - baseQuantity) * 1_000_000) / 1_000_000) });
  }
  if (output.trackStock) {
    await db.insert(sakuInventoryMovements).values({ ownerOpenId, itemId: output.id, movementType: "in", quantity: outputQuantity, note: `Hasil produksi ${order.orderNumber}`, sourceType: "production", sourceId: order.id });
    await db.update(sakuInventoryItems).set({ quantity: output.quantity + outputQuantity }).where(and(eq(sakuInventoryItems.id, output.id), eq(sakuInventoryItems.ownerOpenId, ownerOpenId)));
  }
  await db.update(sakuProductionOrders).set({ status: "completed", actualQuantity: outputQuantity, startedAt: order.startedAt || new Date(), completedAt: new Date() }).where(and(eq(sakuProductionOrders.id, order.id), eq(sakuProductionOrders.workspaceId, workspace.id)));
  return db.select().from(sakuProductionOrders).where(eq(sakuProductionOrders.id, order.id)).limit(1).then((rows) => rows[0]);
}

export async function listSakuCrmContacts(ownerOpenId: string, options: { limit?: number; cursor?: number } = {}) {
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null };
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const where = and(eq(sakuCrmContacts.ownerOpenId, ownerOpenId), eq(sakuCrmContacts.status, "active"), options.cursor ? lt(sakuCrmContacts.id, options.cursor) : undefined);
  const rows = await db.select().from(sakuCrmContacts).where(where).orderBy(desc(sakuCrmContacts.id)).limit(limit + 1);
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null };
}

export async function createSakuCrmContact(contact: InsertSakuCrmContact) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(sakuCrmContacts).values(contact);
  const rows = await db.select().from(sakuCrmContacts).where(eq(sakuCrmContacts.ownerOpenId, contact.ownerOpenId)).orderBy(desc(sakuCrmContacts.id)).limit(1);
  return rows[0];
}

export async function updateSakuCrmContact(ownerOpenId: string, contactId: number, patch: Partial<Pick<InsertSakuCrmContact, "stage" | "opportunityValue" | "nextFollowUp" | "notes">>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(sakuCrmContacts).set(patch).where(and(eq(sakuCrmContacts.ownerOpenId, ownerOpenId), eq(sakuCrmContacts.id, contactId), eq(sakuCrmContacts.status, "active")));
  const rows = await db.select().from(sakuCrmContacts).where(and(eq(sakuCrmContacts.ownerOpenId, ownerOpenId), eq(sakuCrmContacts.id, contactId))).limit(1);
  return rows[0];
}

export async function listSakuCrmActivities(ownerOpenId: string, contactId?: number, options: { limit?: number; cursor?: number } = {}) {
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null };
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const where = and(eq(sakuCrmActivities.ownerOpenId, ownerOpenId), contactId ? eq(sakuCrmActivities.contactId, contactId) : undefined, options.cursor ? lt(sakuCrmActivities.id, options.cursor) : undefined);
  const rows = await db.select().from(sakuCrmActivities).where(where).orderBy(desc(sakuCrmActivities.id)).limit(limit + 1);
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null };
}

export async function createSakuCrmActivity(activity: InsertSakuCrmActivity) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const contact = await db.select().from(sakuCrmContacts).where(and(eq(sakuCrmContacts.ownerOpenId, activity.ownerOpenId), eq(sakuCrmContacts.id, activity.contactId), eq(sakuCrmContacts.status, "active"))).limit(1);
  if (!contact[0]) throw new Error("Kontak CRM tidak ditemukan.");
  await db.insert(sakuCrmActivities).values(activity);
  const rows = await db.select().from(sakuCrmActivities).where(and(eq(sakuCrmActivities.ownerOpenId, activity.ownerOpenId), eq(sakuCrmActivities.contactId, activity.contactId))).orderBy(desc(sakuCrmActivities.id)).limit(1);
  return rows[0];
}

export function summarizeSakuCrmContacts(contacts: Array<{ stage: "lead" | "qualified" | "proposal" | "won" | "lost"; opportunityValue: number; nextFollowUp: Date | null }>, now = new Date()) {
  const stageCounts = { lead: 0, qualified: 0, proposal: 0, won: 0, lost: 0 };
  for (const contact of contacts) stageCounts[contact.stage] += 1;
  const pipelineValue = contacts.filter((contact) => contact.stage !== "won" && contact.stage !== "lost").reduce((sum, contact) => sum + contact.opportunityValue, 0);
  const wonValue = contacts.filter((contact) => contact.stage === "won").reduce((sum, contact) => sum + contact.opportunityValue, 0);
  const followUpsDue = contacts.filter((contact) => contact.nextFollowUp && contact.nextFollowUp.getTime() <= now.getTime() + 7 * 86400000 && contact.stage !== "won" && contact.stage !== "lost").length;
  return { stageCounts, pipelineValue, wonValue, followUpsDue };
}

export async function listSakuPipelines(ownerOpenId: string, channelId?: string) {
  const db = await getDb();
  if (!db) return [];
  const where = channelId
    ? and(eq(sakuPipelines.ownerOpenId, ownerOpenId), eq(sakuPipelines.channelId, channelId))
    : eq(sakuPipelines.ownerOpenId, ownerOpenId);
  return db.select().from(sakuPipelines).where(where).orderBy(desc(sakuPipelines.id));
}

export async function createSakuPipeline(pipeline: InsertSakuPipeline) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(sakuPipelines).values(pipeline);
  const rows = await db.select().from(sakuPipelines).where(eq(sakuPipelines.ownerOpenId, pipeline.ownerOpenId)).orderBy(desc(sakuPipelines.id)).limit(1);
  return rows[0];
}

export async function advanceSakuPipeline(ownerOpenId: string, channelId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(sakuPipelines).where(and(eq(sakuPipelines.ownerOpenId, ownerOpenId), eq(sakuPipelines.channelId, channelId))).orderBy(desc(sakuPipelines.id)).limit(1);
  const pipeline = rows[0];
  if (!pipeline) return undefined;
  let stepCount = 1;
  try { const parsed = JSON.parse(pipeline.stepsText); if (Array.isArray(parsed)) stepCount = parsed.length; } catch { /* keep safe default */ }
  const nextStep = Math.min(stepCount, pipeline.currentStep + 1);
  await db.update(sakuPipelines).set({ currentStep: nextStep, status: nextStep >= stepCount ? "completed" : "active" }).where(eq(sakuPipelines.id, pipeline.id));
  const updated = await db.select().from(sakuPipelines).where(eq(sakuPipelines.id, pipeline.id)).limit(1);
  return updated[0];
}

export function formatAutomationRunNotification(automationName: string, status: "success" | "failed", output?: string | null) {
  const resultLabel = status === "success" ? "berhasil" : "gagal";
  const detail = output?.trim() || (status === "success" ? "Pekerjaan selesai dijalankan." : "Terjadi kendala saat menjalankan pekerjaan.");
  return `Automasi “${automationName}” ${resultLabel}. ${detail}`;
}

export async function createSakuAutomationRun(run: InsertSakuAutomationRun) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (run.executionKey) {
    const existing = await db.select().from(sakuAutomationRuns).where(eq(sakuAutomationRuns.executionKey, run.executionKey)).limit(1);
    if (existing[0]) return existing[0];
  }
  await db.insert(sakuAutomationRuns).values(run);
  const rows = await db.select().from(sakuAutomationRuns).where(eq(sakuAutomationRuns.ownerOpenId, run.ownerOpenId)).orderBy(desc(sakuAutomationRuns.id)).limit(1);
  const createdRun = rows[0];
  if (createdRun && (createdRun.status === "success" || createdRun.status === "failed")) {
    try {
      const automations = await db.select({ name: sakuAutomations.name }).from(sakuAutomations).where(and(eq(sakuAutomations.id, run.automationId), eq(sakuAutomations.ownerOpenId, run.ownerOpenId))).limit(1);
      const automationName = automations[0]?.name || `Automasi #${run.automationId}`;
      await insertSakuMessage({
        ownerOpenId: run.ownerOpenId,
        channelId: run.channelId,
        messageKey: `automation-run:${createdRun.id}`,
        sender: "assistant",
        senderName: "Saku AI",
        senderRole: "Automation",
        content: formatAutomationRunNotification(automationName, createdRun.status, run.output),
        attachmentJson: null,
      });
    } catch (error) {
      console.warn(`[Automation] notification failed runId=${createdRun.id}:`, error);
    }
  }
  return createdRun;
}

export async function listSakuAutomationRuns(ownerOpenId: string, automationId?: number) {
  const db = await getDb();
  if (!db) return [];
  const where = automationId
    ? and(eq(sakuAutomationRuns.ownerOpenId, ownerOpenId), eq(sakuAutomationRuns.automationId, automationId))
    : eq(sakuAutomationRuns.ownerOpenId, ownerOpenId);
  return db.select().from(sakuAutomationRuns).where(where).orderBy(desc(sakuAutomationRuns.id));
}
