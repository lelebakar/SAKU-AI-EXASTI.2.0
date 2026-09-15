import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { decryptCredential, encryptCredential } from "./credential-crypto";
import { getDb, insertSakuMessage } from "./db";
import { sakuBankMutations, sakuFinanceReceivables, sakuIntegrationCredentials, sakuReconciliationRules, sakuWorkspaces } from "../drizzle/schema";
import { consumeRateLimit } from "./rate-limit";

export type NormalizedMutation = { externalId: string; amount: number; type: "credit" | "debit" | "unknown"; description: string; rawPayload: string };
export type ReceivableCandidate = { id: number; amount: number; customerReference: string; status: "open" | "paid" | "ambiguous" };
export type ReconciliationRule = { pattern: string; targetCategory: string; autoConfirm: number | boolean };

export function verifyMootaSignature(rawBody: string, signature: string | undefined, secret: string) {
  if (!signature || !secret) return false;
  const tokenBuffer = Buffer.from(signature.trim());
  const secretBuffer = Buffer.from(secret);
  if (tokenBuffer.length === secretBuffer.length && timingSafeEqual(tokenBuffer, secretBuffer)) return true;
  const expectedBuffer = createHmac("sha256", secret).update(rawBody).digest();
  const provided = signature.replace(/^sha256=/i, "").trim();
  const providedBuffer = Buffer.from(provided, "hex");
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9-]/g, ""));
  return Number.isFinite(number) ? Math.round(number) : 0;
}

export function normalizeMootaMutation(payload: Record<string, unknown>): NormalizedMutation {
  const externalId = String(payload.id ?? payload.mutation_id ?? payload.mutationId ?? payload.trx_id ?? payload.transaction_id ?? "");
  const amount = numberValue(payload.amount ?? payload.nominal ?? payload.total);
  const rawType = String(payload.type ?? payload.mutation_type ?? "").toLowerCase();
  const type = rawType === "credit" || rawType === "kredit" || rawType === "in" ? "credit" : rawType === "debit" || rawType === "out" ? "debit" : "unknown";
  const description = String(payload.description ?? payload.note ?? payload.mutation_desc ?? payload.sender ?? "").trim();
  return { externalId, amount, type, description, rawPayload: JSON.stringify(payload) };
}

export function matchReceivable(mutation: Pick<NormalizedMutation, "amount" | "description" | "type">, candidates: ReceivableCandidate[]) {
  if (mutation.type !== "credit") return { status: "unidentified" as const, candidate: undefined };
  const exact = candidates.filter((candidate) => candidate.status === "open" && candidate.amount === mutation.amount);
  if (exact.length === 1) return { status: "matched" as const, candidate: exact[0] };
  if (exact.length > 1) {
    const described = exact.filter((candidate) => mutation.description.toLowerCase().includes(candidate.customerReference.toLowerCase()));
    if (described.length === 1) return { status: "matched" as const, candidate: described[0] };
    return { status: "ambiguous" as const, candidate: undefined };
  }
  return { status: "unidentified" as const, candidate: undefined };
}

export function matchReconciliationRule(description: string, rules: ReconciliationRule[]) {
  const normalizedDescription = description.trim().toLocaleLowerCase("id-ID");
  return [...rules]
    .filter((rule) => rule.pattern.trim() && normalizedDescription.includes(rule.pattern.trim().toLocaleLowerCase("id-ID")))
    .sort((left, right) => right.pattern.length - left.pattern.length)[0];
}

type ReconciliationDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function reconcileBankMutation(db: ReconciliationDb, input: { workspaceId: number; ownerOpenId: string; provider: string; mutation: NormalizedMutation }) {
  const { workspaceId, ownerOpenId, provider, mutation } = input;
  const existing = await db.select().from(sakuBankMutations).where(eq(sakuBankMutations.externalId, mutation.externalId)).limit(1);
  if (existing.length) return { externalId: mutation.externalId, status: existing[0].matchStatus, category: existing[0].category, duplicate: true };
  const rules = await db.select().from(sakuReconciliationRules).where(eq(sakuReconciliationRules.workspaceId, workspaceId));
  const rule = matchReconciliationRule(mutation.description, rules);
  const receivables = await db.select().from(sakuFinanceReceivables).where(and(eq(sakuFinanceReceivables.workspaceId, workspaceId), eq(sakuFinanceReceivables.status, "open")));
  const match = matchReceivable(mutation, receivables);
  const autoConfirmed = Boolean(rule?.autoConfirm);
  const matchStatus = autoConfirmed ? "matched" : match.status;
  await db.insert(sakuBankMutations).values({ workspaceId, provider, externalId: mutation.externalId, amount: mutation.amount, mutationType: mutation.type, description: mutation.description, category: rule?.targetCategory ?? null, matchStatus, matchedReceivableId: match.candidate?.id ?? null, rawPayload: mutation.rawPayload });
  if (match.candidate) await db.update(sakuFinanceReceivables).set({ status: "paid", paidMutationId: mutation.externalId }).where(eq(sakuFinanceReceivables.id, match.candidate.id));
  const message = autoConfirmed ? `Mutasi ${provider} Rp${mutation.amount.toLocaleString("id-ID")} otomatis masuk kategori ${rule?.targetCategory} berdasarkan aturan “${rule?.pattern}” dan dikonfirmasi.` : match.status === "matched" ? `Mutasi ${provider} Rp${mutation.amount.toLocaleString("id-ID")} cocok dengan piutang ${match.candidate?.customerReference} dan ditandai lunas.` : match.status === "ambiguous" ? `Mutasi ${provider} Rp${mutation.amount.toLocaleString("id-ID")} punya lebih dari satu kandidat piutang. Mohon konfirmasi manual.` : rule ? `Mutasi ${provider} Rp${mutation.amount.toLocaleString("id-ID")} diberi kategori ${rule.targetCategory}, tetapi masih menunggu konfirmasi.` : `Mutasi ${provider} Rp${mutation.amount.toLocaleString("id-ID")} belum teridentifikasi. Mohon cek dan cocokkan manual.`;
  await insertSakuMessage({ ownerOpenId, channelId: "finance", messageKey: `${provider}:${mutation.externalId}`, sender: "assistant", senderName: "Kiki", senderRole: "Finance Controller", content: message, attachmentJson: null });
  return { externalId: mutation.externalId, status: matchStatus, category: rule?.targetCategory, duplicate: false };
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { values.push(value.trim()); value = ""; continue; }
    value += char;
  }
  values.push(value.trim());
  return values;
}

export async function importBankCsv(ownerOpenId: string, csvText: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const workspace = await db.select().from(sakuWorkspaces).where(eq(sakuWorkspaces.ownerOpenId, ownerOpenId)).limit(1);
  if (!workspace[0]) throw new Error("Workspace is not available");
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV belum berisi baris transaksi.");
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  const valueFor = (row: string[], names: string[]) => { const index = names.map((name) => headers.indexOf(name)).find((candidate) => candidate >= 0); return index === undefined ? "" : row[index] || ""; };
  const results = [];
  for (let index = 1; index < lines.length; index += 1) {
    const row = parseCsvLine(lines[index]);
    const externalId = valueFor(row, ["external_id", "externalid", "id", "transaction_id"]) || `csv-${Date.now()}-${index}`;
    const amount = numberValue(valueFor(row, ["amount", "nominal", "jumlah", "total"]));
    if (!amount) continue;
    const typeValue = valueFor(row, ["type", "mutation_type", "debit_credit", "tipe"]).toLowerCase();
    const type = typeValue.includes("debit") || typeValue.includes("keluar") || typeValue === "out" ? "debit" : typeValue.includes("credit") || typeValue.includes("kredit") || typeValue.includes("masuk") || typeValue === "in" ? "credit" : "unknown";
    const description = valueFor(row, ["description", "deskripsi", "keterangan", "note", "remark"]);
    results.push(await reconcileBankMutation(db, { workspaceId: workspace[0].id, ownerOpenId, provider: "csv", mutation: { externalId, amount, type, description, rawPayload: JSON.stringify({ headers, row }) } }));
  }
  return { ok: true, results };
}

export async function handleMootaWebhook(req: Request, res: Response) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
  const integrationId = Number(req.params.integrationId);
  const db = await getDb();
  if (!db || !Number.isInteger(integrationId)) return res.status(404).json({ error: "integration_not_found" });
  const integrations = await db.select().from(sakuIntegrationCredentials).where(and(eq(sakuIntegrationCredentials.id, integrationId), eq(sakuIntegrationCredentials.provider, "moota"), eq(sakuIntegrationCredentials.status, "active"))).limit(1);
  const integration = integrations[0];
  if (!integration) return res.status(404).json({ error: "integration_not_found" });
  const rate = await consumeRateLimit(`moota.webhook:${integrationId}`, 120, 60_000);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfterSeconds));
    return res.status(429).json({ error: "rate_limited", message: `Webhook terlalu sering diterima. Coba lagi dalam ${rate.retryAfterSeconds} detik.` });
  }
  const workspace = await db.select().from(sakuWorkspaces).where(eq(sakuWorkspaces.id, integration.workspaceId)).limit(1);
  const ownerOpenId = workspace[0]?.ownerOpenId;
  if (!ownerOpenId) return res.status(404).json({ error: "workspace_not_found" });
  if (!integration.webhookSecretEncrypted) return res.status(503).json({ error: "moota_webhook_secret_not_configured" });
  const secret = decryptCredential(integration.webhookSecretEncrypted);
  if (!verifyMootaSignature(rawBody, req.header("Signature") || req.header("X-Signature"), secret)) return res.status(401).json({ error: "invalid_signature" });
  const parsed = JSON.parse(rawBody) as Record<string, unknown>;
  const items = Array.isArray(parsed.data) ? parsed.data : Array.isArray(parsed.mutations) ? parsed.mutations : [parsed];
  const results = [];
  for (const item of items) {
    const mutation = normalizeMootaMutation(item as Record<string, unknown>);
    if (!mutation.externalId || !mutation.amount) continue;
    results.push(await reconcileBankMutation(db, { workspaceId: integration.workspaceId, ownerOpenId, provider: "moota", mutation }));
  }
  return res.json({ ok: true, results });
}

export function encryptMootaCredentials(apiKey: string, webhookSecret: string) {
  return { apiKeyEncrypted: encryptCredential(apiKey), webhookSecretEncrypted: encryptCredential(webhookSecret) };
}
