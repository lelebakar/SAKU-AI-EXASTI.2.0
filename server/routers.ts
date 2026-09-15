import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM, type Message, type Tool, type ToolCall } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router, workspaceAdminProcedure, workspaceProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { acceptSakuWorkspaceInvitation, consumePasswordResetToken, createPasswordResetTokenValue, getPasswordResetToken, hashPasswordResetToken, listSakuPendingWorkspaceInvitations, savePasswordResetToken, advanceSakuPipeline, completeSakuProductionOrder, confirmSakuSalesOrder, createEmailUser, createSakuAutomation, createSakuAutomationRun, createSakuBom, createSakuCrmActivity, createSakuCrmContact, createSakuDivision, createSakuFinanceReceivable, createSakuInventoryItem, createSakuJournalEntry, createSakuMemory, createSakuPipeline, createSakuProductionOrder, createSakuReconciliationRule, createSakuSalesOrder, createSakuSupportRequest, deleteSakuDivision, deleteSakuReconciliationRule, ensureSakuEmployeeBundle, ensureSakuTeamStandards, findSakuJournalDuplicates, getSakuAgentByChannel, getSakuFiles, getSakuFinanceReview, getSakuFinanceStatements, getSakuTeamConfiguration, getSakuTeamStandards, getSakuWorkspace, getSakuWorkspaceSnapshot, getUserByEmail, insertSakuFile, insertSakuMessage, inviteSakuWorkspaceMember, listSakuAgents, listSakuAutomations, listSakuBoms, listSakuCrmActivities, listSakuCrmContacts, listSakuDivisions, getSakuPipelineTemplate, listSakuInventoryItems, listSakuInventoryMovements, listSakuJournalEntries, listSakuMemories, listSakuMessages, listSakuPipelineTemplates, listSakuPipelines, listSakuProductionOrders, listSakuAutomationRuns, listSakuReconciliationRules, listSakuSalesOrders, listSakuSupportRequests, listSakuWorkspaceBusinessTypes, listSakuWorkspaceMembers, recordSakuInventoryMovement, replaceSakuWorkspaceBusinessTypes, seedSakuOnboarding, updateSakuCrmContact, updateSakuWorkspaceMember, updateSakuDivision, updateUserPassword, upsertMootaIntegration, upsertSakuAgent, upsertSakuTeamStandards, upsertSakuWorkspace } from "./db";
import { storagePut } from "./storage";
import { generateImage } from "./_core/imageGeneration";
import { generateSpeech, generateVideo } from "./_core/mediaGeneration";
import { extractFileIntelligence } from "./file-intelligence.ts";
import { buildWorkspaceSystemPrompt, normalizeAssistantReply, extractReceiptDrafts, extractTextContent, fallbackWorkspaceReply, MAX_HISTORY_MESSAGE_CHARS, MAX_HISTORY_TOTAL_CHARS, truncateForLLM } from "./saku-ai.ts";
import { getAutomationSessionToken, scheduleSakuAutomation } from "./automation-scheduler";
import { encryptMootaCredentials, importBankCsv } from "./reconciliation";
import { validateUploadFile } from "./upload-security";
import { consumeRateLimit } from "./rate-limit";
import { exportReportToSheet, getGoogleSheetsStatus } from "./google-sheets";
import { hashPassword, normalizeEmail, verifyPassword } from "./password-auth";
import { sdk } from "./_core/sdk";
import { getPublicOrigin, sendPasswordResetEmail } from "./password-reset-email";
import { assertToolAllowed, capabilityDescription, isToolAllowed, resolveTeamPolicy, scopedDataAccess } from "./team-policy";

export const IMAGE_OCR_PROMPT = "Baca gambar ini dengan OCR. Ekstrak semua teks, angka, nama produk, harga, tanggal, dan catatan penting. Balas hanya dengan transkrip terstruktur dalam Bahasa Indonesia.";
const FILE_UNDERSTANDING_PROMPT = "Kamu adalah analis file untuk pemilik UMKM. Jelaskan dalam Bahasa Indonesia secara singkat: (1) file ini kemungkinan berisi apa, (2) untuk apa file ini berguna dalam pekerjaan bisnis, dan (3) tindakan berikutnya yang disarankan. Jangan mengarang fakta yang tidak ada; tandai keterbatasan jika hanya metadata yang tersedia. Format: Isi:, Kegunaan:, Saran:.";

async function understandUploadedFile(fileName: string, mimeType: string, fileSize: number, extractedText?: string, preview?: string): Promise<string> {
  const source = `Nama file: ${fileName}\nJenis MIME: ${mimeType || "application/octet-stream"}\nUkuran: ${fileSize} byte\nKonten/preview:\n${(extractedText || preview || "Tidak ada teks yang dapat diekstrak.").slice(0, 12_000)}`;
  try {
    const response = await invokeLLM({ messages: [{ role: "system", content: FILE_UNDERSTANDING_PROMPT }, { role: "user", content: source }] });
    return extractTextContent(response.choices?.[0]?.message?.content).trim().slice(0, 2_000) || "Isi file tersimpan, tetapi AI belum dapat membuat ringkasan.";
  } catch {
    return "Isi file tersimpan aman. Analisis AI belum tersedia untuk file ini.";
  }
}

const historyMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
});

const persistedMessage = z.object({
  messageKey: z.string().min(1).max(80),
  sender: z.enum(["owner", "agent", "assistant"]),
  senderName: z.string().max(100).optional(),
  senderRole: z.string().max(120).optional(),
  content: z.string().max(8000).optional(),
  attachmentJson: z.string().max(12000).optional(),
});

const onboardingInterview = z.object({
  businessName: z.string().trim().min(2).max(120),
  businessDescription: z.string().trim().min(10).max(600),
  customer: z.string().trim().min(3).max(300),
  biggestChallenge: z.string().trim().min(3).max(300),
  priorities: z.array(z.string().trim().min(2).max(80)).min(1).max(5),
});

const onboardingPlan = z.object({
  teams: z.array(z.object({
    name: z.string().min(2).max(120),
    businessArea: z.string().min(2).max(80),
    description: z.string().min(8).max(500),
    agentName: z.string().min(2).max(80),
    roleTitle: z.string().min(2).max(100),
    skills: z.array(z.string().min(2).max(80)).min(2).max(8),
    memory: z.string().min(10).max(500),
    dataAccess: z.array(z.string().min(2).max(80)).min(1).max(8),
    pipelineName: z.string().min(2).max(160),
    pipelineSteps: z.array(z.string().min(2).max(80)).min(3).max(8),
    automationName: z.string().min(2).max(160),
    automationDescription: z.string().min(8).max(500),
    automationTrigger: z.string().min(2).max(240),
  })).min(1).max(4),
});

function onboardingFallback(input: z.infer<typeof onboardingInterview>): z.infer<typeof onboardingPlan> {
  const areas = input.priorities.slice(0, 4).map((priority, index) => ({
    name: `Tim ${priority}`,
    businessArea: priority,
    description: `Membantu ${input.businessName} mengelola ${priority.toLowerCase()} dengan langkah yang sederhana dan terukur.`,
    agentName: ["Raka", "Sari", "Kiki", "Gilang"][index] || "Nara",
    roleTitle: `${priority} Lead`,
    skills: ["Prioritas", "Koordinasi", "Pelaporan"],
    memory: `Kebutuhan utama ${input.businessName}: ${input.biggestChallenge}. Utamakan update singkat dan langkah berikutnya yang jelas.`,
    dataAccess: ["Dokumen", "Percakapan", priority],
    pipelineName: `Alur ${priority}`,
    pipelineSteps: ["Masuk", "Cek kebutuhan", "Kerjakan", "Review", "Selesai"],
    automationName: `Update ${priority}`,
    automationDescription: `Memberi ringkasan saat ada perubahan pekerjaan di tim ${priority}.`,
    automationTrigger: "Saat ada perubahan pekerjaan",
  }));
  return { teams: areas.length ? areas : [{ name: "Tim Operasional", businessArea: "operasional", description: "Menjaga pekerjaan harian tetap rapi.", agentName: "Nara", roleTitle: "Operations Lead", skills: ["Prioritas", "Koordinasi"], memory: input.biggestChallenge, dataAccess: ["Dokumen"], pipelineName: "Alur kerja harian", pipelineSteps: ["Masuk", "Kerjakan", "Review", "Selesai"], automationName: "Ringkasan harian", automationDescription: "Merangkum pekerjaan yang berubah hari ini.", automationTrigger: "Setiap sore" }] };
}

const createDivisionArgs = z.object({
  name: z.string().min(2).max(120),
  businessArea: z.string().min(2).max(80),
  description: z.string().min(8).max(500),
});
const updateDivisionArgs = z.object({ id: z.number().int().positive(), name: z.string().min(2).max(120).optional(), businessArea: z.string().min(2).max(80).optional(), description: z.string().min(8).max(500).optional() });
const deleteDivisionArgs = z.object({ id: z.number().int().positive() });

const createAutomationArgs = z.object({
  name: z.string().min(2).max(160),
  description: z.string().min(8).max(500),
  trigger: z.string().min(2).max(240),
});

const exportFinanceReportArgs = z.object({
  templateId: z.enum(["receivables", "bank_mutations", "workspace_summary"]),
});

const recordFinanceTransactionArgs = z.object({
  vendor: z.string().trim().min(1).max(240),
  date: z.string().trim().min(1).max(40),
  total: z.number().int().positive().max(2_000_000_000),
  direction: z.enum(["expense", "income"]).default("expense"),
  category: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

const generateContentPackageArgs = z.object({
  topic: z.string().trim().min(4).max(1000),
  platform: z.enum(["instagram", "twitter", "general"]),
  tone: z.string().trim().max(120).optional(),
});

type ContentPackagePlatform = z.infer<typeof generateContentPackageArgs>["platform"];
type ContentPackageDependencies = { invoke: typeof invokeLLM; image: typeof generateImage };

const BUILT_IN_CHANNELS = new Set(["assistant", "sales", "marketing", "finance", "operations"]);

async function assertWorkspaceChannel(ownerOpenId: string, channelId: string) {
  if (BUILT_IN_CHANNELS.has(channelId)) return;
  const divisions = await listSakuDivisions(ownerOpenId);
  if (!divisions.some((division) => division.channelId === channelId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Tim tidak ditemukan atau tidak aktif di workspace ini." });
  }
}

function parseCaptionResponse(content: Message["content"]): string {
  const text = extractTextContent(content).trim();
  try {
    const parsed = JSON.parse(text) as { caption?: unknown };
    if (typeof parsed.caption === "string" && parsed.caption.trim()) return parsed.caption.trim();
  } catch {
    // Keep plain text when a model ignores JSON mode.
  }
  return text;
}

function enforceTwitterLimit(caption: string): string {
  if (caption.length <= 280) return caption;
  return `${caption.slice(0, 277).trimEnd()}...`;
}

export async function generateContentPackage(
  input: z.infer<typeof generateContentPackageArgs>,
  dependencies: ContentPackageDependencies = { invoke: invokeLLM, image: generateImage },
) {
  const platformGuidance: Record<ContentPackagePlatform, string> = {
    instagram: "Instagram: caption lebih panjang, hangat, mudah dipindai, dengan hashtag yang benar-benar relevan.",
    twitter: "Twitter/X: caption ringkas dan kuat, wajib maksimal 280 karakter termasuk hashtag relevan.",
    general: "Umum: caption jelas dan fleksibel untuk kanal sosial bisnis.",
  };
  const toneGuidance = input.tone ? `Gunakan tone: ${input.tone}.` : "Gunakan tone profesional, hangat, dan natural.";
  const response = await dependencies.invoke({
    messages: [{ role: "user", content: `Buat caption media sosial dalam Bahasa Indonesia untuk topik: ${input.topic}\nPlatform: ${input.platform}. ${platformGuidance[input.platform]} ${toneGuidance}\nJangan membuat hashtag generik; setiap hashtag harus relevan langsung dengan topik. Kembalikan JSON dengan satu field caption saja.` }],
    response_format: { type: "json_schema", json_schema: { name: "content_caption", strict: true, schema: { type: "object", properties: { caption: { type: "string" } }, required: ["caption"], additionalProperties: false } } },
    max_tokens: input.platform === "twitter" ? 180 : 500,
  });
  const parsedCaption = parseCaptionResponse(response.choices?.[0]?.message?.content || "");
  const caption = input.platform === "twitter" ? enforceTwitterLimit(parsedCaption) : parsedCaption;
  let imageUrl: string | undefined;
  try {
    const image = await dependencies.image({ prompt: `Visual pendukung untuk ${input.platform}: ${input.topic}. Komposisi profesional untuk bisnis Indonesia, tanpa teks acak atau watermark.`, quality: "medium", storagePathPrefix: "saku-ai/content-packages" });
    imageUrl = image.url || undefined;
  } catch (error) {
    console.warn("[SAKU AI] Content package image generation failed; returning caption only:", error);
  }
  return { caption, imageUrl, platform: input.platform };
}

const workspaceTools: Tool[] = [
  {
    type: "function",
    function: {
      name: "record_finance_transaction",
      description: "Menyimpan transaksi ke Jurnal Finance SAKU agar ikut muncul di laporan Neraca, Laba Rugi, dan Arus Kas. Hanya gunakan jika pemilik secara jelas meminta transaksi dicatat, disimpan, atau dimasukkan ke jurnal; jangan gunakan hanya karena percakapan menyebut angka.",
      parameters: {
        type: "object",
        properties: {
          vendor: { type: "string", description: "Nama vendor, toko, pelanggan, atau sumber transaksi" },
          date: { type: "string", description: "Tanggal transaksi dalam format YYYY-MM-DD" },
          total: { type: "number", description: "Total transaksi dalam rupiah tanpa pemisah" },
          direction: { type: "string", enum: ["expense", "income"], description: "expense untuk pengeluaran, income untuk pemasukan" },
          category: { type: "string", description: "Kategori transaksi jika diketahui" },
          note: { type: "string", description: "Catatan singkat atau konteks transaksi" },
        },
        required: ["vendor", "date", "total"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_division",
      description: "Membuat grup tim divisi baru di workspace ketika pemilik meminta dibuatkan tim/divisi baru.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama tampilan divisi, misalnya Tim Procurement" },
          businessArea: { type: "string", description: "Area bisnis seperti procurement, customer_service, atau inventory" },
          description: { type: "string", description: "Deskripsi singkat tanggung jawab divisi" },
        },
        required: ["name", "businessArea", "description"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_division",
      description: "Mengubah nama, area bisnis, atau tanggung jawab tim yang sudah ada ketika pemilik meminta revisi.",
      parameters: { type: "object", properties: { id: { type: "number", description: "ID divisi dari daftar tim" }, name: { type: "string" }, businessArea: { type: "string" }, description: { type: "string" } }, required: ["id"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_division",
      description: "Menghapus tim hanya jika pemilik secara eksplisit meminta tim tertentu dihapus. Sebelum menjalankan, sebutkan nama tim dan minta konfirmasi bila permintaan masih ambigu.",
      parameters: { type: "object", properties: { id: { type: "number", description: "ID divisi dari daftar tim" } }, required: ["id"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_team_structure",
      description: "Membaca tim yang ada dan menyiapkan data agar Dita dapat menyarankan tim yang perlu ditambah, digabung, diubah, atau dihentikan.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "create_automation",
      description: "Membuat automasi bisnis baru ketika pemilik meminta pekerjaan rutin dijalankan otomatis.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nama automasi" },
          description: { type: "string", description: "Apa yang dilakukan automasi" },
          trigger: { type: "string", description: "Kapan automasi dijalankan" },
        },
        required: ["name", "description", "trigger"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_divisions",
      description: "Melihat daftar divisi yang sudah aktif di workspace ketika pemilik meminta daftar tim.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "advance_pipeline",
      description: "Memajukan satu langkah pipeline aktif dan mencatat progres kerja ketika pemilik meminta pekerjaan dilanjutkan.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Membuat gambar atau visual konten yang diminta pemilik dan mengembalikan lampiran gambar.",
      parameters: {
        type: "object",
        properties: { prompt: { type: "string", description: "Deskripsi visual yang harus dibuat" } },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_content_package",
      description: "Khusus channel marketing: membuat paket caption Bahasa Indonesia dan visual pendukung untuk direview lalu diposting manual oleh owner.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Deskripsi produk, promo, atau topik konten" },
          platform: { type: "string", enum: ["instagram", "twitter", "general"], description: "Platform tujuan konten" },
          tone: { type: "string", description: "Tone opsional seperti edukatif, santai, atau premium" },
        },
        required: ["topic", "platform"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_video",
      description: "Membuat video pendek dari brief pemilik untuk semua tim dan mengembalikan lampiran yang bisa diputar serta diunduh.",
      parameters: {
        type: "object",
        properties: { prompt: { type: "string", description: "Brief visual, gerakan, suasana, dan audio video" }, portrait: { type: "boolean", description: "Gunakan format portrait untuk mobile/social" } },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_voice_note",
      description: "Membuat voice note Bahasa Indonesia dari naskah untuk semua tim dan mengembalikan audio yang bisa diputar serta diunduh.",
      parameters: {
        type: "object",
        properties: { script: { type: "string", description: "Teks yang akan dibacakan" }, tone: { type: "string", description: "Gaya bicara seperti hangat, tegas, ringkas, atau profesional" } },
        required: ["script"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_automations",
      description: "Melihat automasi yang sudah aktif di workspace.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "export_finance_report",
      description: "Khusus tim finance: membuat atau memperbarui laporan finance di Google Sheets ketika pemilik meminta dibuatkan laporan ke spreadsheet.",
      parameters: {
        type: "object",
        properties: {
          templateId: { type: "string", enum: ["receivables", "bank_mutations", "workspace_summary"], description: "Jenis laporan: receivables untuk piutang, bank_mutations untuk mutasi bank, workspace_summary untuk ringkasan workspace" },
        },
        required: ["templateId"],
        additionalProperties: false,
      },
    },
  },
];

function parseToolArguments(argumentsText: string): unknown {
  try {
    return JSON.parse(argumentsText);
  } catch {
    return null;
  }
}

export type WorkspaceToolResult = {
  toolName: string;
  success: boolean;
  [key: string]: unknown;
};

export async function executeWorkspaceToolCalls(
  toolCalls: ToolCall[],
  executeToolCall: (toolCall: ToolCall) => Promise<WorkspaceToolResult>,
) {
  const toolResults: WorkspaceToolResult[] = [];
  const toolMessages: Message[] = [];

  for (const toolCall of toolCalls) {
    try {
      const result = await executeToolCall(toolCall);
      toolResults.push(result);
      toolMessages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
    } catch (error) {
      const result: WorkspaceToolResult = {
        toolName: toolCall.function?.name || "unknown",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      toolResults.push(result);
      toolMessages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
    }
  }

  return { toolResults, toolMessages };
}

export async function completeWorkspaceToolTurn(params: {
  systemPrompt: string;
  history: Message[];
  modelMessage: { content?: Message["content"]; tool_calls?: ToolCall[] };
  executeToolCall: (toolCall: ToolCall) => Promise<WorkspaceToolResult>;
  invokeFinal: (messages: Message[]) => Promise<{ choices?: Array<{ message?: { content?: Message["content"] } }> }>;
  fallbackContent: string | ((toolResults: WorkspaceToolResult[]) => string);
}) {
  const toolCalls = params.modelMessage.tool_calls || [];
  const execution = await executeWorkspaceToolCalls(toolCalls, params.executeToolCall);
  const assistantMessage: Message = {
    role: "assistant",
    content: params.modelMessage.content || "",
    tool_calls: toolCalls,
  };

  try {
    const finalResponse = await params.invokeFinal([
      { role: "system", content: params.systemPrompt },
      ...params.history,
      assistantMessage,
      ...execution.toolMessages,
    ]);
    const content = extractTextContent(finalResponse.choices?.[0]?.message?.content).trim();
    const fallbackContent = typeof params.fallbackContent === "function" ? params.fallbackContent(execution.toolResults) : params.fallbackContent;
    return { content: content || fallbackContent, toolResults: execution.toolResults };
  } catch (error) {
    console.warn("[SAKU AI] Final tool-result LLM turn failed, using fallback:", error);
    const fallbackContent = typeof params.fallbackContent === "function" ? params.fallbackContent(execution.toolResults) : params.fallbackContent;
    return { content: fallbackContent, toolResults: execution.toolResults };
  }
}

export function fallbackToolReply(channel: string, toolResults: WorkspaceToolResult[]): string {
  const result = toolResults.find((item) => item.success) || toolResults[0];
  if (!result) return fallbackWorkspaceReply(channel);
  if (result.toolName === "create_division") {
    const division = result.division as { name?: string } | undefined;
    return `Sudah aku buatkan ${division?.name || "divisi baru"}. Timnya langsung muncul di daftar divisi ya, Kak. Nanti kita bisa tambah anggota atau atur kebiasaan kerjanya lewat chat ini.`;
  }
  if (result.toolName === "create_automation") {
    const automation = result.automation as { name?: string; trigger?: string } | undefined;
    return `Sudah aktif, Kak. Automasi “${automation?.name || "baru"}” dibuat dan akan berjalan ${automation?.trigger || "sesuai jadwalnya"}.`;
  }
  if (result.toolName === "advance_pipeline") {
    const pipeline = result.pipeline as { name?: string; currentStep?: number; status?: string } | undefined;
    return pipeline ? `Progress bergerak, Kak. Pipeline “${pipeline.name}” sekarang di langkah ${pipeline.currentStep}: ${pipeline.status || "aktif"}.` : "Belum ada pipeline aktif di tim ini.";
  }
  if (result.toolName === "generate_image") return "Visualnya sudah jadi, Kak. Aku lampirkan di bawah supaya bisa langsung direview atau dipakai tim.";
  if (result.toolName === "generate_content_package") return result.imageUrl ? "Paket kontennya sudah siap: caption dan visual sudah bisa direview sebelum diposting manual." : "Caption paket kontennya sudah siap. Visual belum berhasil dibuat, jadi caption tetap bisa direview dan dipakai dulu.";
  if (result.toolName === "list_divisions") return `Saat ini tim yang sudah tersimpan: ${((result.divisions as Array<{ name?: string }> | undefined) || []).map((division) => division.name).filter(Boolean).join(", ") || "belum ada divisi tambahan"}.`;
  if (result.toolName === "list_automations") return `Automasi yang tersimpan: ${((result.automations as Array<{ name?: string }> | undefined) || []).map((automation) => automation.name).filter(Boolean).join(", ") || "belum ada automasi"}.`;
  if (result.toolName === "export_finance_report") return result.success ? `Laporan sudah diperbarui di Google Sheets: ${String(result.url || "tautan tersedia di hasil ekspor")}.` : `Laporan belum bisa diekspor ke Google Sheets: ${String(result.error || "periksa koneksi Google Sheets")}.`;
  return fallbackWorkspaceReply(channel);
}

function boundHistoryForLLM(history: Array<{ role: "user" | "assistant"; content: string }>) {
  const bounded = history.slice(-12).map((message) => ({ ...message, content: truncateForLLM(message.content, MAX_HISTORY_MESSAGE_CHARS) }));
  let total = 0;
  return bounded.filter((message) => {
    if (total + message.content.length > MAX_HISTORY_TOTAL_CHARS) return false;
    total += message.content.length;
    return true;
  });
}

export function isTransientLLMError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : undefined;
  if (status !== undefined && Number.isInteger(status)) return status >= 500 && status <= 599;
  return /(?:timeout|timed out|network|fetch failed|econn(?:reset|refused|aborted)|socket hang up|502|503|504)/i.test(message) && !/\b4\d\d\b/.test(message);
}

export async function invokeLLMWithTransientRetry<T>(operation: () => Promise<T>, sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientLLMError(error)) throw error;
    console.warn("[SAKU AI] Transient LLM error; retrying once in 500ms:", error);
    await sleep(500);
    return operation();
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      if (!opts.ctx.user) return null;
      const { passwordHash: _passwordHash, ...safeUser } = opts.ctx.user;
      return { ...safeUser, hasPassword: Boolean(_passwordHash) };
    }),
    register: publicProcedure.input(z.object({ name: z.string().trim().min(2).max(120), email: z.string().email().max(320), password: z.string().min(8).max(128) })).mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      if (await getUserByEmail(email)) throw new TRPCError({ code: "CONFLICT", message: "Email sudah terdaftar. Silakan masuk atau gunakan email lain." });
      let user;
      try { user = await createEmailUser({ name: input.name.trim(), email, passwordHash: await hashPassword(input.password) }); } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Akun belum bisa dibuat." }); }
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Akun belum bisa dibuat." });
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || input.name, expiresInMs: ONE_YEAR_MS });
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return { success: true } as const;
    }),
    login: publicProcedure.input(z.object({ email: z.string().email().max(320), password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const user = await getUserByEmail(normalizeEmail(input.email));
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Akun dengan email ini belum ditemukan. Silakan buat akun terlebih dahulu." });
      if (!user.passwordHash) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Akun ini dibuat dengan Google, Facebook, atau Instagram. Gunakan tombol provider tersebut untuk masuk, atau tambahkan password dari pengaturan akun." });
      if (!(await verifyPassword(input.password, user.passwordHash))) throw new TRPCError({ code: "UNAUTHORIZED", message: "Password salah. Coba lagi atau gunakan Lupa password." });
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || user.email || "User", expiresInMs: ONE_YEAR_MS });
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return { success: true } as const;
    }),
    requestPasswordReset: publicProcedure.input(z.object({ email: z.string().email().max(320) })).mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      const user = await getUserByEmail(email);
      // Keep this response generic so the endpoint cannot be used to enumerate accounts.
      if (!user?.email) return { success: true } as const;
      const token = createPasswordResetTokenValue();
      const tokenHash = hashPasswordResetToken(token);
      const origin = getPublicOrigin(ctx.req);
      if (!origin) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Link reset password belum bisa dibuat untuk alamat website ini." });
      await savePasswordResetToken(user.openId, tokenHash, new Date(Date.now() + 30 * 60 * 1000));
      try {
        const delivery = await sendPasswordResetEmail({ to: user.email, resetUrl: `${origin}/?reset=${encodeURIComponent(token)}` });
        if (!delivery.sent) throw new Error("RESEND_API_KEY atau RESEND_FROM_EMAIL belum dikonfigurasi");
      } catch (error) {
        console.error("[Password reset] Email delivery failed:", error);
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Reset password belum aktif karena layanan email belum dikonfigurasi. Hubungi admin aplikasi." });
      }
      return { success: true } as const;
    }),
    resetPassword: publicProcedure.input(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), newPassword: z.string().min(8).max(128) })).mutation(async ({ input }) => {
      const tokenHash = hashPasswordResetToken(input.token);
      const resetToken = await getPasswordResetToken(tokenHash);
      if (!resetToken || resetToken.expiresAt.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Link reset password tidak valid atau sudah kedaluwarsa. Minta link baru." });
      await updateUserPassword(resetToken.userOpenId, await hashPassword(input.newPassword));
      await consumePasswordResetToken(tokenHash);
      return { success: true } as const;
    }),
    changePassword: protectedProcedure.input(z.object({ currentPassword: z.string().max(128).optional(), newPassword: z.string().min(8).max(128) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.passwordHash && !(await verifyPassword(input.currentPassword || "", ctx.user.passwordHash))) throw new TRPCError({ code: "UNAUTHORIZED", message: "Password saat ini salah." });
      try { await updateUserPassword(ctx.user.openId, await hashPassword(input.newPassword)); } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Password belum bisa diubah." }); }
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  sakuAi: router({
    reply: workspaceProcedure
      .input(z.object({
        channel: z.string().max(64),
        teamName: z.string().max(120),
        businessName: z.string().max(120),
        persona: z.string().max(1000).optional(),
        agentName: z.string().max(80),
        agentRole: z.string().max(80).default("rekan kerja"),
        skills: z.array(z.string().max(80)).max(12).optional(),
        memory: z.array(z.string().max(500)).max(12).optional(),
        dataAccess: z.array(z.string().max(80)).max(12).optional(),
        // These fields carry the configured steps/labels from the UI. The persisted
        // database configuration remains the source of truth; these are only a
        // bounded fallback for a first message or a newly created team.
        pipeline: z.string().max(2000).optional(),
        automation: z.string().max(800).optional(),
        history: z.array(historyMessage).max(12),
      }))
      .mutation(async ({ ctx, input }) => {
        const rate = await consumeRateLimit(`sakuAi.reply:${ctx.workspaceOwnerOpenId!}`, 30, 60_000);
        if (!rate.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Terlalu banyak pesan dalam waktu singkat. Coba lagi dalam ${rate.retryAfterSeconds} detik ya.` });
        await assertWorkspaceChannel(ctx.workspaceOwnerOpenId!, input.channel);
        const teamConfig = await getSakuTeamConfiguration(ctx.workspaceOwnerOpenId!, input.channel, input.teamName, input.agentRole, [...input.history].reverse().find((message) => message.role === "user")?.content || "", ctx.user!.name || undefined, input.businessName);
        const teamStandards = teamConfig.standards;
        const teamPolicy = resolveTeamPolicy(input.channel, teamConfig.division?.businessArea);
        const persistedAgent = await getSakuAgentByChannel(ctx.workspaceOwnerOpenId!, input.channel);
        const latestContextQuery = [...input.history].reverse().find((message) => message.role === "user")?.content || "";
        const storedMemory = teamConfig.memories;
        const storedPipelines = teamConfig.pipelines;
        const workspaceSnapshot = await getSakuWorkspaceSnapshot(ctx.workspaceOwnerOpenId!);
        const storedAutomations = teamConfig.automations;
        const storedFiles = (await getSakuFiles(ctx.workspaceOwnerOpenId!, input.channel)) || [];
        const documentContext = truncateForLLM(storedFiles.filter((file) => file.extractionStatus === "complete" && (file.extractedText || file.structuredPreview)).slice(0, 5).map((file) => `${file.fileName}: ${(file.extractedText || file.structuredPreview || "").slice(0, 4000)}`).join("\\n"), 6000);
        const parseList = (value: string | undefined, fallback: string[]) => { try { const parsed = JSON.parse(value || ""); return Array.isArray(parsed) ? parsed.map(String) : fallback; } catch { return fallback; } };
        const contextInput = { ...input, ownerName: ctx.user!.name || undefined, teamName: teamConfig.division?.name || input.teamName, teamDescription: teamConfig.division?.description, businessArea: teamConfig.division?.businessArea, agentName: persistedAgent?.name || input.agentName, agentRole: persistedAgent?.roleTitle || input.agentRole, agentPersonality: persistedAgent?.personality, skills: persistedAgent ? parseList(persistedAgent.skillsText, input.skills || []) : input.skills, memory: storedMemory.map((item) => item.memory), memoryStatus: storedMemory.length ? "found" as const : "empty" as const, dataAccess: [...scopedDataAccess(teamPolicy), `Workspace: ${workspaceSnapshot.divisions} divisi · ${workspaceSnapshot.files} dokumen · ${workspaceSnapshot.automations} automasi · ${workspaceSnapshot.pipelines} pipeline`], pipeline: storedPipelines[0]?.stepsText ? parseList(storedPipelines[0].stepsText, [input.pipeline || "Brief", "Kerjakan", "Update"]).join(" → ") : input.pipeline, pipelineDetails: storedPipelines[0] ? `${storedPipelines[0].name}; status ${storedPipelines[0].status}; langkah aktif ${storedPipelines[0].currentStep}` : "belum ada", automation: storedAutomations[0]?.name || input.automation, automationDetails: storedAutomations[0] ? `${storedAutomations[0].description}; pemicu ${storedAutomations[0].trigger}; status ${storedAutomations[0].status}` : "belum ada", documentContext, teamStandards };
        const systemPrompt = `${buildWorkspaceSystemPrompt(contextInput)}\n\nKEBIJAKAN SEGREGATION OF DUTIES:\nKamu hanya boleh menjalankan kewenangan tim ini: ${capabilityDescription(teamPolicy)}. Jangan mengaku bisa menjalankan pekerjaan milik tim lain. Jika diminta lintas fungsi, jelaskan bahwa permintaan harus diteruskan ke tim yang tepat dan jangan gunakan tool lintas fungsi.`;
        const historyForLLM = boundHistoryForLLM(input.history);
        try {
          const response = await invokeLLMWithTransientRetry(() => invokeLLM({
              messages: [
                { role: "system", content: systemPrompt },
                ...historyForLLM,
              ],
              tools: workspaceTools.filter((tool) => isToolAllowed(teamPolicy, tool.function.name)),
              tool_choice: "auto",
            }));
          const modelMessage = response.choices?.[0]?.message;
          const toolCalls = modelMessage?.tool_calls || [];
          if (toolCalls.length > 0 && modelMessage) {
            const completed = await completeWorkspaceToolTurn({
              systemPrompt,
              history: historyForLLM,
              modelMessage,
              executeToolCall: async (toolCall) => {
                assertToolAllowed(teamPolicy, toolCall.function.name);
                if (toolCall.function.name === "create_division") {
                  const args = createDivisionArgs.parse(parseToolArguments(toolCall.function.arguments));
                  const businessSlug = args.businessArea.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "division";
                  const channelId = `custom-${Date.now()}-${businessSlug}`;
                  const division = await createSakuDivision({ ownerOpenId: ctx.workspaceOwnerOpenId!, channelId, name: args.name, businessArea: args.businessArea, description: args.description, avatarClass: "bg-[#e5e9f6] text-[#5e6a9e]" });
                  const employee = await upsertSakuAgent({ ownerOpenId: ctx.workspaceOwnerOpenId!, channelId, name: "Nara", roleTitle: `Senior ${args.name.replace(/^Tim\\s+/i, "")}`, status: "online", personality: "Hangat, terstruktur, proaktif, dan selalu memberi update yang bisa ditindaklanjuti.", skillsText: JSON.stringify(["Koordinasi", "Eksekusi", "Pelaporan"]), dataAccessText: JSON.stringify([`Data ${args.businessArea}`, "Dokumen", "Percakapan"]) });
                  if (employee?.id) {
                    await createSakuMemory({ ownerOpenId: ctx.workspaceOwnerOpenId!, agentId: employee.id, memory: `${args.name} selalu merangkum progres, risiko, dan next step sebelum update.`, importance: "high" });
                    const template = getSakuPipelineTemplate(args.businessArea);
                    await createSakuPipeline({ ownerOpenId: ctx.workspaceOwnerOpenId!, channelId, name: template.name, status: "active", currentStep: 1, stepsText: JSON.stringify(template.steps) });
                    const pipelineAutomation = await createSakuAutomation({ ownerOpenId: ctx.workspaceOwnerOpenId!, channelId, name: `Update progres ${args.name}`, description: `Memberi kabar saat ada perubahan di pipeline ${args.name}.`, trigger: "Saat ada perubahan pipeline", status: "active" });
                    if (pipelineAutomation) await scheduleSakuAutomation(pipelineAutomation, getAutomationSessionToken(ctx.req));
                    await ensureSakuTeamStandards(ctx.workspaceOwnerOpenId!, channelId, args.name, employee.roleTitle);
                  }
                  return { toolName: "create_division", success: true, division };
                }
                if (toolCall.function.name === "update_division") {
                  const args = updateDivisionArgs.parse(parseToolArguments(toolCall.function.arguments));
                  const division = await updateSakuDivision(ctx.workspaceOwnerOpenId!, args.id, { name: args.name, businessArea: args.businessArea, description: args.description });
                  return { toolName: "update_division", success: Boolean(division), division };
                }
                if (toolCall.function.name === "delete_division") {
                  const args = deleteDivisionArgs.parse(parseToolArguments(toolCall.function.arguments));
                  await deleteSakuDivision(ctx.workspaceOwnerOpenId!, args.id);
                  return { toolName: "delete_division", success: true, id: args.id };
                }
                if (toolCall.function.name === "recommend_team_structure") {
                  const divisions = await listSakuDivisions(ctx.workspaceOwnerOpenId!);
                  return { toolName: "recommend_team_structure", success: true, divisions };
                }
                if (toolCall.function.name === "record_finance_transaction") {
                  const args = recordFinanceTransactionArgs.parse(parseToolArguments(toolCall.function.arguments));
                  const transactionDate = new Date(`${args.date}T12:00:00`);
                  if (Number.isNaN(transactionDate.getTime())) throw new Error("Tanggal transaksi tidak valid. Gunakan format YYYY-MM-DD.");
                  const itemsText = JSON.stringify([{ name: args.note || "Dicatat dari percakapan SAKU", quantity: 1, unitPrice: args.total, total: args.total }]);
                  const duplicates = await findSakuJournalDuplicates(ctx.workspaceOwnerOpenId!, { vendor: args.vendor, transactionDate, total: args.total, itemsText });
                  if (duplicates.length) {
                    return { toolName: "record_finance_transaction", success: false, duplicate: true, message: `Transaksi serupa sudah ada di jurnal: ${duplicates[0]?.vendor} · ${duplicates[0]?.total}. Tidak dibuat ulang.`, entryId: duplicates[0]?.id };
                  }
                  const entry = await createSakuJournalEntry(ctx.workspaceOwnerOpenId!, { vendor: args.vendor, transactionDate, total: args.total, itemsText, category: args.category, sourceType: "chat", entryType: args.direction });
                  return { toolName: "record_finance_transaction", success: true, recorded: true, entryId: entry?.id, vendor: args.vendor, total: args.total, direction: args.direction, date: args.date };
                }
                if (toolCall.function.name === "list_divisions") {
                  return { toolName: "list_divisions", success: true, divisions: await listSakuDivisions(ctx.workspaceOwnerOpenId!) };
                }
                if (toolCall.function.name === "create_automation") {
                  const args = createAutomationArgs.parse(parseToolArguments(toolCall.function.arguments));
                  const createdAutomation = await createSakuAutomation({ ownerOpenId: ctx.workspaceOwnerOpenId!, channelId: input.channel, name: args.name, description: args.description, trigger: args.trigger, status: "active" });
                  const automation = createdAutomation ? await scheduleSakuAutomation(createdAutomation, getAutomationSessionToken(ctx.req)) : createdAutomation;
                  const run = automation?.id ? await createSakuAutomationRun({ ownerOpenId: ctx.workspaceOwnerOpenId!, automationId: automation.id, channelId: input.channel, status: "success", output: `Automasi ${automation.name || args.name} berhasil dibuat dan diaktifkan.` }) : undefined;
                  return { toolName: "create_automation", success: true, automation, run };
                }
                if (toolCall.function.name === "advance_pipeline") {
                  const pipeline = await advanceSakuPipeline(ctx.workspaceOwnerOpenId!, input.channel);
                  const automation = (await listSakuAutomations(ctx.workspaceOwnerOpenId!)).find((item) => item.channelId === input.channel);
                  const steps = pipeline?.stepsText ? parseList(pipeline.stepsText, ["Brief", "Kerjakan", "Update"]) : [];
                  const current = pipeline ? steps[Math.max(0, pipeline.currentStep - 1)] || "selesai" : "belum tersedia";
                  const run = pipeline && automation?.id ? await createSakuAutomationRun({ ownerOpenId: ctx.workspaceOwnerOpenId!, automationId: automation.id, channelId: input.channel, status: "success", output: `Pipeline ${pipeline.name} maju ke langkah ${pipeline.currentStep}: ${current}.` }) : undefined;
                  return { toolName: "advance_pipeline", success: Boolean(pipeline), status: pipeline?.status, currentStep: pipeline?.currentStep, pipeline, run };
                }
                if (toolCall.function.name === "generate_image") {
                  const args = z.object({ prompt: z.string().min(4).max(1000) }).parse(parseToolArguments(toolCall.function.arguments));
                  const image = await generateImage({ prompt: `${args.prompt}. Gaya profesional untuk UMKM Indonesia, pencahayaan natural, tanpa teks acak.`, quality: "medium", storagePathPrefix: `saku-ai/${ctx.workspaceOwnerOpenId!}/generated` });
                  return { toolName: "generate_image", success: Boolean(image.url), attachment: image.url ? { url: image.url, name: "Visual SAKU AI.png", mimeType: "image/png", type: "image" } : undefined };
                }
                if (toolCall.function.name === "generate_video") {
                  const args = z.object({ prompt: z.string().min(4).max(3000), portrait: z.boolean().optional() }).parse(parseToolArguments(toolCall.function.arguments));
                  const video = await generateVideo({ prompt: `${args.prompt}. Gaya profesional untuk bisnis Indonesia, gerakan natural, tanpa watermark.`, portrait: args.portrait, storagePathPrefix: `saku-ai/${ctx.workspaceOwnerOpenId!}/generated-videos` });
                  return { toolName: "generate_video", success: Boolean(video.url), attachment: video.url ? { url: video.url, name: "Video SAKU AI.mp4", mimeType: video.mimeType, type: "video" } : undefined };
                }
                if (toolCall.function.name === "generate_voice_note") {
                  const args = z.object({ script: z.string().trim().min(4).max(6000), tone: z.string().trim().max(160).optional() }).parse(parseToolArguments(toolCall.function.arguments));
                  const speech = await generateSpeech({ prompt: `Speak Indonesian with a ${args.tone || "warm, clear, professional"} tone and natural pacing: ${args.script}`, storagePathPrefix: `saku-ai/${ctx.workspaceOwnerOpenId!}/voice-notes` });
                  return { toolName: "generate_voice_note", success: Boolean(speech.url), attachment: speech.url ? { url: speech.url, name: "Voice note SAKU AI.wav", mimeType: speech.mimeType, type: "audio" } : undefined };
                }
                if (toolCall.function.name === "generate_content_package") {
                  if (input.channel !== "marketing") throw new Error("Paket konten hanya tersedia untuk tim marketing.");
                  const args = generateContentPackageArgs.parse(parseToolArguments(toolCall.function.arguments));
                  const contentPackage = await generateContentPackage(args, { invoke: invokeLLM, image: (imageInput) => generateImage({ ...imageInput, storagePathPrefix: `saku-ai/${ctx.workspaceOwnerOpenId!}/content-packages` }) });
                  return { toolName: "generate_content_package", success: Boolean(contentPackage.caption), ...contentPackage };
                }
                if (toolCall.function.name === "list_automations") {
                  const automations = await listSakuAutomations(ctx.workspaceOwnerOpenId!);
                  return { toolName: "list_automations", success: true, automations: automations.filter((automation) => automation.channelId === input.channel) };
                }
                if (toolCall.function.name === "export_finance_report") {
                  if (input.channel !== "finance") throw new Error("Laporan Google Sheets hanya tersedia untuk tim finance.");
                  const args = exportFinanceReportArgs.parse(parseToolArguments(toolCall.function.arguments));
                  const exported = await exportReportToSheet(ctx.workspaceOwnerOpenId!, args.templateId);
                  return { toolName: "export_finance_report", success: true, ...exported };
                }
                throw new Error(`Unknown workspace tool: ${toolCall.function.name}`);
              },
              invokeFinal: (messages) => invokeLLMWithTransientRetry(() => invokeLLM({ messages })),
              fallbackContent: (toolResults) => fallbackToolReply(input.channel, toolResults),
            });
            return { content: normalizeAssistantReply(completed.content), senderName: contextInput.agentName, senderRole: contextInput.agentRole, toolResults: completed.toolResults };
          }
          const content = extractTextContent(modelMessage?.content).trim();
          return { content: normalizeAssistantReply(content || fallbackWorkspaceReply(input.channel)), senderName: contextInput.agentName, senderRole: contextInput.agentRole, toolResults: [] };
        } catch (error) {
          console.warn("[SAKU AI] LLM/tool execution failed, using fallback:", error);
          return {
            content: normalizeAssistantReply(fallbackWorkspaceReply(input.channel)),
            senderName: contextInput.agentName,
            senderRole: contextInput.agentRole,
            toolResults: [],
          };
        }
      }),
  }),
  workspace: router({
    invitations: router({
      pending: protectedProcedure.query(({ ctx }) => {
        if (!ctx.user.email) return [];
        return listSakuPendingWorkspaceInvitations(ctx.user.email);
      }),
      accept: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        if (!ctx.user.email) throw new TRPCError({ code: "FORBIDDEN", message: "Akun ini belum memiliki email yang bisa diverifikasi." });
        const invitations = await listSakuPendingWorkspaceInvitations(ctx.user.email);
        const invitation = invitations.find((item) => item.id === input.id);
        if (!invitation) throw new TRPCError({ code: "NOT_FOUND", message: "Undangan tidak ditemukan atau sudah tidak aktif." });
        const accepted = await acceptSakuWorkspaceInvitation({ id: invitation.id, email: ctx.user.email, memberOpenId: ctx.user.openId, name: ctx.user.name });
        if (!accepted || accepted.status !== "active") throw new TRPCError({ code: "CONFLICT", message: "Undangan sedang diproses atau sudah digunakan." });
        return { success: true, workspaceOwnerOpenId: accepted.ownerOpenId, role: accepted.role, businessName: invitation.businessName } as const;
      }),
    }),
    profile: router({
      get: workspaceProcedure.query(async ({ ctx }) => (await getSakuWorkspace(ctx.workspaceOwnerOpenId!)) ?? null),
      update: workspaceAdminProcedure.input(z.object({ businessName: z.string().trim().min(2).max(120), persona: z.string().trim().max(1000).optional() })).mutation(({ ctx, input }) => upsertSakuWorkspace({ ownerOpenId: ctx.workspaceOwnerOpenId!, businessName: input.businessName, persona: input.persona || null })),
    }),
    businessTypes: router({
      list: workspaceProcedure.query(({ ctx }) => listSakuWorkspaceBusinessTypes(ctx.workspaceOwnerOpenId!)),
      replace: workspaceAdminProcedure.input(z.object({ types: z.array(z.enum(["service", "retail", "manufacturing", "food_beverage"])).min(1).max(4) })).mutation(({ ctx, input }) => replaceSakuWorkspaceBusinessTypes(ctx.workspaceOwnerOpenId!, input.types)),
    }),
    standards: router({
      get: workspaceProcedure.input(z.object({ channelId: z.string().trim().min(1).max(64) })).query(({ ctx, input }) => getSakuTeamStandards(ctx.workspaceOwnerOpenId!, input.channelId)),
      upsert: workspaceAdminProcedure.input(z.object({ channelId: z.string().trim().min(1).max(64), purpose: z.string().trim().min(10).max(6000), principles: z.string().trim().min(10).max(6000), responseStyle: z.string().trim().min(10).max(6000), outputFormat: z.string().trim().min(10).max(6000), guardrails: z.string().trim().min(10).max(6000), checklist: z.string().trim().min(10).max(6000) })).mutation(({ ctx, input }) => upsertSakuTeamStandards({ ownerOpenId: ctx.workspaceOwnerOpenId!, ...input })),
    }),
    integrations: router({
      connectMoota: workspaceAdminProcedure.input(z.object({ apiKey: z.string().trim().min(8).max(500), webhookSecret: z.string().trim().min(8).max(500) })).mutation(({ ctx, input }) => upsertMootaIntegration(ctx.workspaceOwnerOpenId!, encryptMootaCredentials(input.apiKey, input.webhookSecret))),
      googleSheetsStatus: workspaceProcedure.query(({ ctx }) => getGoogleSheetsStatus(ctx.workspaceOwnerOpenId!)),
      exportReport: workspaceAdminProcedure.input(z.object({ templateId: z.enum(["receivables", "bank_mutations", "workspace_summary"]) })).mutation(async ({ ctx, input }) => {
        try {
          return await exportReportToSheet(ctx.workspaceOwnerOpenId!, input.templateId);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Laporan belum bisa diekspor ke Google Sheets." });
        }
      }),
    }),
    reconciliationRules: router({
      list: workspaceProcedure.query(({ ctx }) => listSakuReconciliationRules(ctx.workspaceOwnerOpenId!)),
      create: workspaceAdminProcedure.input(z.object({ pattern: z.string().trim().min(2).max(160), targetCategory: z.string().trim().min(2).max(120), autoConfirm: z.boolean().default(false) })).mutation(({ ctx, input }) => createSakuReconciliationRule(ctx.workspaceOwnerOpenId!, input)),
      remove: workspaceAdminProcedure.input(z.object({ ruleId: z.number().int().positive() })).mutation(({ ctx, input }) => deleteSakuReconciliationRule(ctx.workspaceOwnerOpenId!, input.ruleId)),
    }),
    finance: router({
      createReceivable: workspaceProcedure.input(z.object({ channelId: z.string().trim().min(1).max(64), customerReference: z.string().trim().min(2).max(240), amount: z.number().int().positive() })).mutation(({ ctx, input }) => createSakuFinanceReceivable(ctx.workspaceOwnerOpenId!, input)),
      review: workspaceProcedure.query(({ ctx }) => getSakuFinanceReview(ctx.workspaceOwnerOpenId!)),
      latestJournal: workspaceProcedure.input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional()).query(({ ctx, input }) => listSakuJournalEntries(ctx.workspaceOwnerOpenId!, input?.limit ?? 20)),
      statements: workspaceProcedure.input(z.object({ from: z.coerce.date(), to: z.coerce.date() }).refine(({ from, to }) => from <= to, "Periode laporan tidak valid.")).query(({ ctx, input }) => getSakuFinanceStatements(ctx.workspaceOwnerOpenId!, input.from, input.to)),
      importCsv: workspaceProcedure.input(z.object({ csvText: z.string().min(5).max(2_000_000) })).mutation(({ ctx, input }) => importBankCsv(ctx.workspaceOwnerOpenId!, input.csvText)),
      extractReceipt: workspaceProcedure.input(z.object({ imageUrl: z.string().url().max(4000), sourceType: z.enum(["image", "pdf"]).default("image") })).mutation(async ({ input }) => {
        try {
          return await extractReceiptDrafts(input.imageUrl, input.sourceType);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Struk belum bisa dibaca. Coba unggah foto yang lebih jelas." });
        }
      }),
      saveReceiptJournal: workspaceProcedure.input(z.object({ vendor: z.string().trim().min(1).max(240), date: z.string().trim().min(1).max(40), total: z.number().int().nonnegative(), items: z.array(z.object({ name: z.string().trim().min(1).max(240), quantity: z.number().positive(), unitPrice: z.number().int().nonnegative(), total: z.number().int().nonnegative() })).max(100), category: z.string().trim().max(120).optional(), sourceUrl: z.string().url().max(4000).optional(), force: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
        const transactionDate = new Date(input.date);
        if (Number.isNaN(transactionDate.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: "Tanggal transaksi belum valid. Periksa tanggal pada draft struk." });
        const itemsText = JSON.stringify(input.items);
        const duplicates = await findSakuJournalDuplicates(ctx.workspaceOwnerOpenId!, { vendor: input.vendor, transactionDate, total: input.total, itemsText });
        if (duplicates.length && !input.force) return { saved: false, duplicate: true, duplicates: duplicates.map((entry) => ({ id: entry.id, vendor: entry.vendor, transactionDate: entry.transactionDate, total: entry.total, category: entry.category, createdAt: entry.createdAt })) } as const;
        const entry = await createSakuJournalEntry(ctx.workspaceOwnerOpenId!, { vendor: input.vendor, transactionDate, total: input.total, itemsText, category: input.category, sourceUrl: input.sourceUrl });
        return { saved: true, duplicate: false, entry } as const;
      }),
    }),
    onboarding: router({
      seed: workspaceAdminProcedure.input(z.object({ businessName: z.string().trim().min(2).max(120), priorities: z.array(z.string().min(2).max(80)).min(1).max(5) })).mutation(async ({ ctx, input }) => {
        await upsertSakuWorkspace({ ownerOpenId: ctx.workspaceOwnerOpenId!, businessName: input.businessName, persona: null });
        const seeded = await seedSakuOnboarding(ctx.workspaceOwnerOpenId!, input.priorities);
        return { success: true, businessName: input.businessName, ...seeded };
      }),
      prepare: workspaceAdminProcedure.input(onboardingInterview).mutation(async ({ ctx, input }) => {
        const persona = `Bisnis: ${input.businessDescription}. Pelanggan: ${input.customer}. Tantangan utama: ${input.biggestChallenge}.`;
        await upsertSakuWorkspace({ ownerOpenId: ctx.workspaceOwnerOpenId!, businessName: input.businessName, persona });
        let plan = onboardingFallback(input);
        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: "Kamu adalah konsultan onboarding SAKU AI untuk pemilik bisnis awam di Indonesia. Buat paket awal yang praktis, tidak terlalu rumit, dan langsung bisa dipakai. Gunakan Bahasa Indonesia. Hanya hasilkan JSON sesuai schema: 1-4 tim yang benar-benar relevan; tiap tim punya AI employee, memory, pipeline 3-8 langkah, dan satu automasi sederhana. Jangan membuat klaim tentang sistem yang belum ada." },
              { role: "user", content: JSON.stringify(input) },
            ],
            response_format: { type: "json_schema", json_schema: { name: "saku_onboarding_plan", strict: true, schema: { type: "object", properties: { teams: { type: "array", minItems: 1, maxItems: 4, items: { type: "object", properties: { name: { type: "string" }, businessArea: { type: "string" }, description: { type: "string" }, agentName: { type: "string" }, roleTitle: { type: "string" }, skills: { type: "array", items: { type: "string" } }, memory: { type: "string" }, dataAccess: { type: "array", items: { type: "string" } }, pipelineName: { type: "string" }, pipelineSteps: { type: "array", items: { type: "string" } }, automationName: { type: "string" }, automationDescription: { type: "string" }, automationTrigger: { type: "string" } }, required: ["name", "businessArea", "description", "agentName", "roleTitle", "skills", "memory", "dataAccess", "pipelineName", "pipelineSteps", "automationName", "automationDescription", "automationTrigger"], additionalProperties: false } } }, required: ["teams"], additionalProperties: false } } },
          });
          plan = onboardingPlan.parse(JSON.parse(extractTextContent(response.choices?.[0]?.message?.content)));
        } catch (error) {
          console.warn("[SAKU onboarding] AI plan failed, using safe fallback:", error);
        }

        const assistant = await ensureSakuEmployeeBundle(ctx.workspaceOwnerOpenId!, "assistant");
        await ensureSakuTeamStandards(ctx.workspaceOwnerOpenId!, "assistant", "Tim Utama", assistant?.roleTitle || "Asisten Pribadi");
        const existingDivisions = await listSakuDivisions(ctx.workspaceOwnerOpenId!);
        const seededChannels: string[] = ["assistant"];
        for (let index = 0; index < plan.teams.length; index += 1) {
          const team = plan.teams[index];
          const slug = team.businessArea.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || `team-${index + 1}`;
          const channelId = `onboarding-${index + 1}-${slug}`.slice(0, 64);
          if (!existingDivisions.some((division) => division.channelId === channelId)) await createSakuDivision({ ownerOpenId: ctx.workspaceOwnerOpenId!, channelId, name: team.name, businessArea: team.businessArea, description: team.description, avatarClass: index % 2 ? "bg-[#f5e6db] text-[#a76643]" : "bg-[#e5e9f6] text-[#5e6a9e]" });
          const existingAgent = await getSakuAgentByChannel(ctx.workspaceOwnerOpenId!, channelId);
          if (!existingAgent) {
            const agent = await upsertSakuAgent({ ownerOpenId: ctx.workspaceOwnerOpenId!, channelId, name: team.agentName, roleTitle: team.roleTitle, status: "online", personality: "Hangat, jelas, dan membantu pemilik bisnis mengambil langkah berikutnya.", skillsText: JSON.stringify(team.skills), dataAccessText: JSON.stringify(team.dataAccess) });
            if (agent?.id) {
              await createSakuMemory({ ownerOpenId: ctx.workspaceOwnerOpenId!, agentId: agent.id, memory: team.memory, importance: "high" });
              await createSakuPipeline({ ownerOpenId: ctx.workspaceOwnerOpenId!, channelId, name: team.pipelineName, status: "active", currentStep: 1, stepsText: JSON.stringify(team.pipelineSteps) });
              const teamAutomation = await createSakuAutomation({ ownerOpenId: ctx.workspaceOwnerOpenId!, channelId, name: team.automationName, description: team.automationDescription, trigger: team.automationTrigger, status: "active" });
              if (teamAutomation) await scheduleSakuAutomation(teamAutomation, getAutomationSessionToken(ctx.req));
              await ensureSakuTeamStandards(ctx.workspaceOwnerOpenId!, channelId, team.name, team.roleTitle);
            }
          }
          await ensureSakuTeamStandards(ctx.workspaceOwnerOpenId!, channelId, team.name, team.roleTitle);
          seededChannels.push(channelId);
        }
        return { success: true, businessName: input.businessName, persona, seededChannels, plan };
      }),
    }),
    messages: router({
      list: workspaceProcedure.input(z.object({ channelId: z.string().max(64), limit: z.number().int().min(1).max(100).optional(), cursor: z.number().int().positive().optional() })).query(async ({ ctx, input }) => { await assertWorkspaceChannel(ctx.workspaceOwnerOpenId!, input.channelId); return listSakuMessages(ctx.workspaceOwnerOpenId!, input.channelId, { limit: input.limit, cursor: input.cursor }); }),
      save: workspaceProcedure.input(z.object({ channelId: z.string().max(64), message: persistedMessage })).mutation(async ({ ctx, input }) => { await assertWorkspaceChannel(ctx.workspaceOwnerOpenId!, input.channelId); return insertSakuMessage({ ownerOpenId: ctx.workspaceOwnerOpenId!, channelId: input.channelId, ...input.message, content: input.message.content || null, senderName: input.message.senderName || null, senderRole: input.message.senderRole || null, attachmentJson: input.message.attachmentJson || null }); }),
    }),
    members: router({
      list: workspaceAdminProcedure.query(({ ctx }) => listSakuWorkspaceMembers(ctx.workspaceOwnerOpenId!)),
      invite: workspaceAdminProcedure.input(z.object({ email: z.string().trim().email().max(320), name: z.string().trim().min(2).max(120), role: z.enum(["admin", "member"]).default("member") })).mutation(({ ctx, input }) => inviteSakuWorkspaceMember({ ownerOpenId: ctx.workspaceOwnerOpenId!, email: input.email.toLowerCase(), name: input.name, role: input.role, status: "pending", memberOpenId: null })),
      update: workspaceAdminProcedure.input(z.object({ id: z.number().int().positive(), role: z.enum(["admin", "member"]).optional(), status: z.enum(["pending", "active", "removed"]).optional() })).mutation(({ ctx, input }) => updateSakuWorkspaceMember(ctx.workspaceOwnerOpenId!, input.id, { role: input.role, status: input.status })),
    }),
    support: router({
      list: workspaceProcedure.query(({ ctx }) => listSakuSupportRequests(ctx.workspaceOwnerOpenId!)),
      create: workspaceProcedure.input(z.object({ category: z.string().trim().min(2).max(64), subject: z.string().trim().min(3).max(160), message: z.string().trim().min(10).max(4000) })).mutation(({ ctx, input }) => createSakuSupportRequest({ ownerOpenId: ctx.workspaceOwnerOpenId!, category: input.category, subject: input.subject, message: input.message, status: "open" })),
    }),
    divisions: router({
      list: workspaceProcedure.query(({ ctx }) => listSakuDivisions(ctx.workspaceOwnerOpenId!)),
      create: workspaceProcedure.input(z.object({ name: z.string().trim().min(2).max(120), businessArea: z.string().trim().min(2).max(80), description: z.string().trim().min(8).max(500) })).mutation(async ({ ctx, input }) => {
        const slug = input.businessArea.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "division";
        const channelId = `custom-${Date.now()}-${slug}`;
        const division = await createSakuDivision({ ownerOpenId: ctx.workspaceOwnerOpenId!, channelId, name: input.name, businessArea: input.businessArea, description: input.description, avatarClass: "bg-[#e5e9f6] text-[#5e6a9e]" });
        await ensureSakuEmployeeBundle(ctx.workspaceOwnerOpenId!, channelId);
        return division;
      }),
      update: workspaceAdminProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(120).optional(), businessArea: z.string().trim().min(2).max(80).optional(), description: z.string().trim().min(8).max(500).optional() })).mutation(({ ctx, input }) => updateSakuDivision(ctx.workspaceOwnerOpenId!, input.id, { name: input.name, businessArea: input.businessArea, description: input.description })),
      remove: workspaceAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => deleteSakuDivision(ctx.workspaceOwnerOpenId!, input.id)),
    }),
    snapshot: workspaceProcedure.query(({ ctx }) => getSakuWorkspaceSnapshot(ctx.workspaceOwnerOpenId!)),
    pipelineTemplates: router({
      list: workspaceProcedure.query(() => listSakuPipelineTemplates()),
      applyTemplate: workspaceAdminProcedure.input(z.object({ templateId: z.string().min(1).max(40), channelId: z.string().min(1).max(120), pipelineName: z.string().trim().min(2).max(120) })).mutation(async ({ ctx, input }) => {
        const divisions = await listSakuDivisions(ctx.workspaceOwnerOpenId!);
        const builtInChannels = new Set(["sales", "finance", "marketing", "operations"]);
        if (!builtInChannels.has(input.channelId) && !divisions.some((division) => division.channelId === input.channelId)) throw new TRPCError({ code: "NOT_FOUND", message: "Divisi tujuan tidak ditemukan." });
        const template = getSakuPipelineTemplate(input.templateId);
        const pipeline = await createSakuPipeline({ ownerOpenId: ctx.workspaceOwnerOpenId!, channelId: input.channelId, name: input.pipelineName.trim(), status: "active", currentStep: 1, stepsText: JSON.stringify(template.steps) });
        return { success: true, pipeline, template };
      }),
    }),
    automations: router({
      list: workspaceProcedure.query(({ ctx }) => listSakuAutomations(ctx.workspaceOwnerOpenId!)),
    }),
    automationRuns: router({
      list: workspaceProcedure.input(z.object({ automationId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => listSakuAutomationRuns(ctx.workspaceOwnerOpenId!, input?.automationId)),
    }),
    inventory: router({
      list: workspaceProcedure.query(({ ctx }) => listSakuInventoryItems(ctx.workspaceOwnerOpenId!)),
      movements: workspaceProcedure.input(z.object({ itemId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => listSakuInventoryMovements(ctx.workspaceOwnerOpenId!, input?.itemId)),
      create: workspaceProcedure.input(z.object({ sku: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(160), category: z.string().trim().min(2).max(100).default("Umum"), unit: z.string().trim().min(1).max(32).default("pcs"), initialQuantity: z.number().nonnegative().max(1_000_000).default(0), minQuantity: z.number().nonnegative().max(1_000_000).default(0), costPrice: z.number().int().min(0).max(2_000_000_000).default(0), sellingPrice: z.number().int().min(0).max(2_000_000_000).default(0), itemType: z.enum(["service", "merchandise", "raw_material", "work_in_progress", "finished_good", "packaging", "consumable", "non_stock"]).default("merchandise"), trackStock: z.boolean().default(true), sellable: z.boolean().default(true), purchasable: z.boolean().default(true), producible: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
        const item = await createSakuInventoryItem({ ownerOpenId: ctx.workspaceOwnerOpenId!, sku: input.sku, name: input.name, category: input.category, unit: input.unit, quantity: 0, minQuantity: input.minQuantity, costPrice: input.costPrice, sellingPrice: input.sellingPrice, itemType: input.itemType, trackStock: input.trackStock ? 1 : 0, sellable: input.sellable ? 1 : 0, purchasable: input.purchasable ? 1 : 0, producible: input.producible ? 1 : 0, status: "active" });
        if (!item) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Produk inventory belum bisa disimpan." });
        const updated = input.initialQuantity > 0 ? await recordSakuInventoryMovement(ctx.workspaceOwnerOpenId!, { itemId: item.id, movementType: "in", quantity: input.initialQuantity, note: "Stok awal" }) : item;
        return updated;
      }),
      move: workspaceProcedure.input(z.object({ itemId: z.number().int().positive(), movementType: z.enum(["in", "out", "adjustment"]), quantity: z.number().positive().max(1_000_000), note: z.string().trim().max(240).optional() })).mutation(({ ctx, input }) => recordSakuInventoryMovement(ctx.workspaceOwnerOpenId!, input)),
      orders: router({
        list: workspaceProcedure.query(({ ctx }) => listSakuSalesOrders(ctx.workspaceOwnerOpenId!)),
        create: workspaceProcedure.input(z.object({ orderNumber: z.string().trim().min(1).max(80), channelId: z.string().trim().max(64).optional(), customerId: z.number().int().positive().optional(), lines: z.array(z.object({ itemId: z.number().int().positive(), quantity: z.number().int().positive().max(1_000_000), unitPrice: z.number().int().nonnegative().optional() })).min(1).max(100), discount: z.number().int().nonnegative().max(2_000_000_000).optional(), tax: z.number().int().nonnegative().max(2_000_000_000).optional(), paymentStatus: z.enum(["unpaid", "partial", "paid", "refunded"]).optional() })).mutation(({ ctx, input }) => createSakuSalesOrder(ctx.workspaceOwnerOpenId!, input)),
        confirm: workspaceProcedure.input(z.object({ orderId: z.number().int().positive() })).mutation(({ ctx, input }) => confirmSakuSalesOrder(ctx.workspaceOwnerOpenId!, input.orderId)),
      }),
      boms: router({
        list: workspaceProcedure.query(({ ctx }) => listSakuBoms(ctx.workspaceOwnerOpenId!)),
        create: workspaceProcedure.input(z.object({ name: z.string().trim().min(2).max(160), version: z.string().trim().min(1).max(40).default("v1"), outputItemId: z.number().int().positive(), outputQuantity: z.number().positive().max(1_000_000), unit: z.string().trim().min(1).max(32), lines: z.array(z.object({ inputItemId: z.number().int().positive(), quantity: z.number().positive().max(1_000_000), unit: z.string().trim().min(1).max(32), wastePercent: z.number().int().min(0).max(100).default(0) })).min(1).max(100) })).mutation(({ ctx, input }) => createSakuBom(ctx.workspaceOwnerOpenId!, input)),
      }),
      production: router({
        list: workspaceProcedure.query(({ ctx }) => listSakuProductionOrders(ctx.workspaceOwnerOpenId!)),
        create: workspaceProcedure.input(z.object({ bomId: z.number().int().positive(), orderNumber: z.string().trim().min(1).max(80), plannedQuantity: z.number().positive().max(1_000_000), notes: z.string().trim().max(4000).optional() })).mutation(({ ctx, input }) => createSakuProductionOrder(ctx.workspaceOwnerOpenId!, input)),
        complete: workspaceProcedure.input(z.object({ productionOrderId: z.number().int().positive(), actualQuantity: z.number().positive().max(1_000_000).optional() })).mutation(({ ctx, input }) => completeSakuProductionOrder(ctx.workspaceOwnerOpenId!, input.productionOrderId, input.actualQuantity)),
      }),
    }),
    crm: router({
      list: workspaceProcedure.input(z.object({ limit: z.number().int().min(1).max(100).optional(), cursor: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => listSakuCrmContacts(ctx.workspaceOwnerOpenId!, { limit: input?.limit, cursor: input?.cursor })),
      activities: workspaceProcedure.input(z.object({ contactId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).optional(), cursor: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => listSakuCrmActivities(ctx.workspaceOwnerOpenId!, input?.contactId, { limit: input?.limit, cursor: input?.cursor })),
      createContact: workspaceProcedure.input(z.object({ name: z.string().trim().min(2).max(160), company: z.string().trim().max(160).optional(), email: z.string().trim().email().max(320).optional(), phone: z.string().trim().max(48).optional(), source: z.string().trim().min(2).max(80).default("Manual"), stage: z.enum(["lead", "qualified", "proposal", "won", "lost"]).default("lead"), opportunityValue: z.number().int().min(0).max(2_000_000_000).default(0), nextFollowUp: z.coerce.date().nullable().optional(), notes: z.string().trim().max(4000).optional() })).mutation(async ({ ctx, input }) => createSakuCrmContact({ ownerOpenId: ctx.workspaceOwnerOpenId!, name: input.name, company: input.company || null, email: input.email || null, phone: input.phone || null, source: input.source, stage: input.stage, opportunityValue: input.opportunityValue, nextFollowUp: input.nextFollowUp ?? null, notes: input.notes || null, status: "active" })),
      updateContact: workspaceProcedure.input(z.object({ contactId: z.number().int().positive(), stage: z.enum(["lead", "qualified", "proposal", "won", "lost"]).optional(), opportunityValue: z.number().int().min(0).max(2_000_000_000).optional(), nextFollowUp: z.coerce.date().nullable().optional(), notes: z.string().trim().max(4000).optional() })).mutation(({ ctx, input }) => updateSakuCrmContact(ctx.workspaceOwnerOpenId!, input.contactId, { stage: input.stage, opportunityValue: input.opportunityValue, nextFollowUp: input.nextFollowUp, notes: input.notes })),
      addActivity: workspaceProcedure.input(z.object({ contactId: z.number().int().positive(), activityType: z.enum(["note", "call", "meeting", "email"]).default("note"), title: z.string().trim().min(2).max(160), detail: z.string().trim().max(4000).optional(), dueAt: z.coerce.date().nullable().optional() })).mutation(({ ctx, input }) => createSakuCrmActivity({ ownerOpenId: ctx.workspaceOwnerOpenId!, contactId: input.contactId, activityType: input.activityType, title: input.title, detail: input.detail || null, dueAt: input.dueAt ?? null, completed: 0 })),
    }),
    employeeContext: workspaceProcedure.input(z.object({ channelId: z.string().max(64) })).query(async ({ ctx, input }) => {
      await assertWorkspaceChannel(ctx.workspaceOwnerOpenId!, input.channelId);
      await ensureSakuEmployeeBundle(ctx.workspaceOwnerOpenId!, input.channelId);
      const agents = await listSakuAgents(ctx.workspaceOwnerOpenId!);
      const agent = agents.find((item) => item.channelId === input.channelId);
      if (!agent) return { agent: null, division: null, standards: null, memories: [], pipelines: [], automations: [] };
      const workspace = await getSakuWorkspace(ctx.workspaceOwnerOpenId!);
      const teamConfig = await getSakuTeamConfiguration(ctx.workspaceOwnerOpenId!, input.channelId, input.channelId, agent.roleTitle, undefined, ctx.user!.name || undefined, workspace?.businessName || undefined);
      return teamConfig;
    }),
  }),
  storage: router({
    upload: workspaceProcedure
      .input(z.object({
        channelId: z.string().max(64),
        fileName: z.string().min(1).max(160),
        mimeType: z.string().max(120),
        dataUrl: z.string().min(1).max(8_000_000),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertWorkspaceChannel(ctx.workspaceOwnerOpenId!, input.channelId);
        const match = input.dataUrl.match(/^data:[^;]+;base64,(.+)$/);
        if (!match?.[1]) throw new Error("Invalid data URL");
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
        const buffer = Buffer.from(match[1], "base64");
        if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("File too large");
        let mimeType: ReturnType<typeof validateUploadFile>;
        try {
          mimeType = validateUploadFile(input.mimeType, buffer);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "File tidak lolos validasi keamanan." });
        }
        const result = await storagePut(`saku-ai/${ctx.workspaceOwnerOpenId!}/attachments/${Date.now()}-${safeName}`, buffer, mimeType);
        let extracted = await extractFileIntelligence(input.fileName, mimeType, buffer);
        if (extracted.needsVision) {
          try {
            const vision = await invokeLLM({ messages: [{ role: "user", content: [{ type: "text", text: IMAGE_OCR_PROMPT }, { type: "image_url", image_url: { url: input.dataUrl, detail: "high" } }] }] });
            const ocrText = extractTextContent(vision.choices?.[0]?.message?.content).trim();
            extracted = { ...extracted, status: ocrText ? "complete" : "failed", text: ocrText || undefined, preview: ocrText ? ocrText.slice(0, 12000) : "OCR tidak menemukan teks yang bisa dibaca.", needsVision: false };
          } catch { extracted = { ...extracted, status: "failed", needsVision: false, preview: "OCR gambar gagal dijalankan. Coba unggah gambar yang lebih jelas." }; }
        }
        const understanding = await understandUploadedFile(input.fileName, mimeType, buffer.byteLength, extracted.text, extracted.preview);
        const structuredPreview = `${extracted.preview || "File berhasil disimpan."}\n\nPemahaman AI\n${understanding}`.slice(0, 12_000);
        const record = await insertSakuFile({
          ownerOpenId: ctx.workspaceOwnerOpenId!,
          channelId: input.channelId,
          fileName: input.fileName,
          mimeType,
          fileSize: buffer.byteLength,
          storageKey: result.key,
          storageUrl: result.url,
          detectedKind: extracted.kind,
          extractionStatus: extracted.needsVision ? "complete" : extracted.status,
          extractedText: extracted.text?.slice(0, 100_000),
          structuredPreview,
        });
        return { id: record?.id, key: result.key, url: result.url, fileName: input.fileName, detectedKind: extracted.kind, extractionStatus: extracted.needsVision ? "complete" : extracted.status, extractionPreview: structuredPreview, understanding, extractedText: extracted.text };
      }),
    list: workspaceProcedure
      .input(z.object({ channelId: z.string().max(64) }))
      .query(async ({ ctx, input }) => { await assertWorkspaceChannel(ctx.workspaceOwnerOpenId!, input.channelId); return getSakuFiles(ctx.workspaceOwnerOpenId!, input.channelId); }),
  }),
});

export type AppRouter = typeof appRouter;
