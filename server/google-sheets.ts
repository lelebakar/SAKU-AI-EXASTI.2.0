import { google } from "googleapis";
import { and, eq } from "drizzle-orm";
import { decryptCredential } from "./credential-crypto";
import { getDb, getSakuFinanceReview, getSakuWorkspace, getSakuWorkspaceSnapshot } from "./db";
import { sakuIntegrationCredentials } from "../drizzle/schema";

export type ReportTemplateId = "receivables" | "bank_mutations" | "workspace_summary";
export type ReportData = { title: string; values: Array<Array<string | number>> };

type SheetMetadata = { spreadsheets?: Partial<Record<ReportTemplateId, string>> };

function googleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  };
}

async function getGoogleSheetsIntegration(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const workspace = await getSakuWorkspace(ownerOpenId);
  if (!workspace) return undefined;
  const rows = await db.select().from(sakuIntegrationCredentials).where(and(eq(sakuIntegrationCredentials.workspaceId, workspace.id), eq(sakuIntegrationCredentials.provider, "google_sheets"), eq(sakuIntegrationCredentials.status, "active"))).limit(1);
  return rows[0] ? { db, workspace, integration: rows[0] } : undefined;
}

export async function getGoogleSheetsStatus(ownerOpenId: string) {
  const connection = await getGoogleSheetsIntegration(ownerOpenId);
  if (!connection) return { connected: false, spreadsheetIds: {} as Partial<Record<ReportTemplateId, string>> };
  const metadata = readMetadata(connection.integration.metadataJson);
  return { connected: true, spreadsheetIds: metadata.spreadsheets || {} };
}

async function createSheetsClient(integration: NonNullable<Awaited<ReturnType<typeof getGoogleSheetsIntegration>>>["integration"]) {
  const { clientId, clientSecret } = googleConfig();
  if (!clientId || !clientSecret) throw new Error("Google Sheets OAuth belum dikonfigurasi.");
  const refreshToken = decryptCredential(integration.apiKeyEncrypted);
  if (!refreshToken) throw new Error("Refresh token Google Sheets tidak tersedia. Hubungkan ulang Google Sheets.");
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const accessToken = await oauth2Client.getAccessToken();
  if (!accessToken.token) throw new Error("Token akses Google Sheets tidak dapat diperbarui. Hubungkan ulang Google Sheets.");
  return google.sheets({ version: "v4", auth: oauth2Client });
}

export async function getGoogleSheetsClient(ownerOpenId: string) {
  const connection = await getGoogleSheetsIntegration(ownerOpenId);
  if (!connection) throw new Error("Google Sheets belum terhubung.");
  return createSheetsClient(connection.integration);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

export async function generateReceivablesReport(ownerOpenId: string): Promise<ReportData> {
  const review = await getSakuFinanceReview(ownerOpenId);
  return {
    title: "Laporan Piutang",
    values: [
      ["No", "Pelanggan", "Jumlah", "Status", "Diperbarui"],
      ...review.receivables.map((item, index) => [index + 1, item.customerReference, item.amount, item.status, formatDate(item.updatedAt)]),
    ],
  };
}

export async function generateBankMutationsReport(ownerOpenId: string): Promise<ReportData> {
  const review = await getSakuFinanceReview(ownerOpenId);
  return {
    title: "Laporan Mutasi Bank",
    values: [
      ["External ID", "Jumlah", "Tipe", "Deskripsi", "Status Pencocokan", "Waktu"],
      ...review.mutations.map((item) => [item.externalId, item.amount, item.mutationType, item.description, item.matchStatus, formatDate(item.createdAt)]),
    ],
  };
}

export async function generateWorkspaceSummaryReport(ownerOpenId: string): Promise<ReportData> {
  const snapshot = await getSakuWorkspaceSnapshot(ownerOpenId);
  return {
    title: "Ringkasan Workspace",
    values: [["Metrik", "Jumlah"], ["Divisi", snapshot.divisions], ["Dokumen", snapshot.files], ["Automasi", snapshot.automations], ["Pipeline", snapshot.pipelines]],
  };
}

export async function generateReport(ownerOpenId: string, templateId: ReportTemplateId) {
  if (templateId === "receivables") return generateReceivablesReport(ownerOpenId);
  if (templateId === "bank_mutations") return generateBankMutationsReport(ownerOpenId);
  return generateWorkspaceSummaryReport(ownerOpenId);
}

function readMetadata(metadataJson: string | null) {
  try {
    const parsed = metadataJson ? JSON.parse(metadataJson) as SheetMetadata : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function exportReportToSheet(ownerOpenId: string, templateId: ReportTemplateId) {
  const connection = await getGoogleSheetsIntegration(ownerOpenId);
  if (!connection) throw new Error("Google Sheets belum terhubung.");
  const report = await generateReport(ownerOpenId, templateId);
  const sheets = await createSheetsClient(connection.integration);
  const metadata = readMetadata(connection.integration.metadataJson);
  const existingSpreadsheetId = metadata.spreadsheets?.[templateId];
  let spreadsheetId = existingSpreadsheetId;
  let sheetTitle = "Sheet1";

  if (!spreadsheetId) {
    const created = await sheets.spreadsheets.create({ requestBody: { properties: { title: `SAKU AI - ${report.title} - ${connection.workspace.businessName}` } }, fields: "spreadsheetId,sheets.properties" });
    const createdSpreadsheetId = created.data.spreadsheetId;
    sheetTitle = created.data.sheets?.[0]?.properties?.title || sheetTitle;
    if (!createdSpreadsheetId) throw new Error("Google tidak mengembalikan spreadsheet ID.");
    spreadsheetId = createdSpreadsheetId;
    const updatedMetadata: SheetMetadata = { ...metadata, spreadsheets: { ...(metadata.spreadsheets || {}), [templateId]: spreadsheetId } };
    await connection.db.update(sakuIntegrationCredentials).set({ metadataJson: JSON.stringify(updatedMetadata), updatedAt: new Date() }).where(eq(sakuIntegrationCredentials.id, connection.integration.id));
  } else {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
    sheetTitle = spreadsheet.data.sheets?.[0]?.properties?.title || sheetTitle;
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: sheetTitle });
  }

  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: "USER_ENTERED", requestBody: { values: report.values } });
  return { spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, title: report.title, rowCount: report.values.length };
}

export function isReportTemplateId(value: string): value is ReportTemplateId {
  return value === "receivables" || value === "bank_mutations" || value === "workspace_summary";
}
