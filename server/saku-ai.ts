import { invokeLLM, type MessageContent } from "./_core/llm";

type WorkspaceContext = {
  channel: string;
  teamName: string;
  businessName: string;
  ownerName?: string;
  persona?: string;
  teamDescription?: string;
  businessArea?: string;
  agentName: string;
  agentRole: string;
  agentPersonality?: string;
  skills?: string[];
  memory?: string[];
  memoryStatus?: "found" | "empty";
  dataAccess?: string[];
  pipeline?: string;
  automation?: string;
  automationDetails?: string;
  pipelineDetails?: string;
  documentContext?: string;
  teamStandards?: {
    purpose: string;
    principles: string;
    responseStyle: string;
    outputFormat: string;
    guardrails: string;
    checklist: string;
  };
};

export const MAX_WORKSPACE_PROMPT_CHARS = 14000;
export const MAX_HISTORY_MESSAGE_CHARS = 1200;
export const MAX_HISTORY_TOTAL_CHARS = 10000;

export function truncateForLLM(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 32)).trimEnd()} … [dipotong]`;
}

/** Keep generated replies readable in the compact chat surface. */
export function normalizeAssistantReply(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-zA-Z0-9_-]*\n?/g, "").replace(/```/g, "").trim())
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+[.)]\s+/gm, (match) => `${match.trim().replace(/[.)]$/, ".")} `)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/(?<!\w)\*(.*?)\*(?!\w)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildWorkspaceSystemPrompt(context: WorkspaceContext): string {
  const list = (items?: string[]) => items?.length ? items.join(", ") : "belum ada";
  const prompt = [
    `Kamu adalah ${context.agentName}, ${context.agentRole}, rekan kerja AI di SAKU AI.`,
    `Bantu pemilik bisnis${context.businessName ? ` ${context.businessName}` : ""} dengan jawaban yang relevan, hangat, dan konkret. Sesuaikan panjang, struktur, dan tingkat detail dengan kebutuhan pertanyaan; tidak semua jawaban membutuhkan daftar atau next step.`,
    context.ownerName ? `Nama pemilik workspace: ${context.ownerName}. Sapa pemilik dengan nama ini bila sapaan personal memang diperlukan; jangan gunakan nama lain atau nama contoh.` : "",
    `Tim aktif: ${context.teamName} (${context.channel}).`,
    context.businessArea ? `Bidang tim: ${context.businessArea}.` : "",
    context.teamDescription ? `Deskripsi dan ruang lingkup tim: ${context.teamDescription}` : "",
    context.persona ? `Gaya kerja tambahan: ${context.persona}` : "",
    context.agentPersonality ? `Kepribadian agent: ${context.agentPersonality}` : "",
    `Keahlian: ${list(context.skills)}.`,
    context.memoryStatus === "empty"
      ? "Memory kerja: belum ketemu memory relevan untuk pertanyaan ini. Katakan secara eksplisit kepada pemilik bahwa belum ketemu memory relevan; jangan mengarang atau berpura-pura mengingat."
      : `Memory kerja yang perlu dihormati: ${list(context.memory)}.`,
    `Data yang bisa dibaca: ${list(context.dataAccess)}.`,
    `Pipeline aktif: ${context.pipeline || "belum ada"}.`,
    context.pipelineDetails ? `Konfigurasi pipeline lengkap: ${context.pipelineDetails}.` : "",
    `Automasi aktif: ${context.automation || "belum ada"}.`,
    context.automationDetails ? `Konfigurasi automasi lengkap: ${context.automationDetails}.` : "",
    context.teamStandards
      ? [
          "STANDAR TIM WAJIB — jadikan aturan ini prioritas dalam setiap jawaban dan tindakan:",
          `Tujuan tim: ${context.teamStandards.purpose}`,
          `Prinsip kerja: ${context.teamStandards.principles}`,
          `Gaya jawaban: ${context.teamStandards.responseStyle}`,
          `Format output: ${context.teamStandards.outputFormat}`,
          `Batasan dan guardrail: ${context.teamStandards.guardrails}`,
          `Checklist sebelum menjawab: ${context.teamStandards.checklist}`,
          "Jika permintaan bertentangan dengan standar tim, jelaskan konflik tersebut dan minta arahan pemilik sebelum menyimpang.",
        ].join("\n")
      : "Standar Tim: belum diatur. Tetap fokus pada peran tim, gunakan data yang tersedia, dan jangan mengarang.",
    context.documentContext ? `Konteks dokumen terbaru:\n${context.documentContext}` : "Belum ada konteks dokumen terbaru.",
    "Semua konfigurasi di atas adalah konteks kerja, bukan template jawaban. Gunakan yang relevan dengan pertanyaan dan abaikan detail yang tidak diperlukan; jangan menjejalkan semua konteks ke setiap balasan.",
    "Jangan menjalankan pekerjaan di luar bidang tim aktif. Pembuatan visual, video, voice note, dan paket konten hanya untuk Tim Marketing / Design; pencatatan transaksi dan laporan keuangan hanya untuk Tim Finance; pengelolaan stok dan proses operasional hanya untuk Tim Operasional; CRM dan pipeline penjualan hanya untuk Tim Sales.",
    context.channel === "finance" ? "Aturan Finance: jika pemilik hanya bertanya atau membahas angka, jangan menyimpan apa pun. Gunakan record_finance_transaction hanya saat pemilik secara jelas meminta transaksi dicatat/disimpan/dimasukkan ke jurnal. Tanyakan apakah itu pemasukan atau pengeluaran bila belum jelas. Setelah berhasil, jelaskan bahwa transaksi masuk ke Jurnal Finance dan akan ikut memperbarui laporan periode terkait. Jika transaksi serupa sudah ada, jangan membuat duplikat." : "",
    context.channel === "assistant"
      ? "Dita adalah asisten pribadi pemilik dan memiliki kewenangan workspace untuk mengelola seluruh tim: boleh membuat, memperbarui, menghapus, dan merekomendasikan struktur tim. Untuk penghapusan, gunakan tool delete_division agar sistem meminta konfirmasi kedua; jangan menolak dan jangan mengarahkan pemilik ke pengaturan jika tool tersedia. Untuk membuat atau mengubah tim, gunakan tool yang tersedia setelah kebutuhan cukup jelas."
      : "AI employee di tim divisi tidak boleh membuat atau menghapus tim lain. Jika diminta mengelola struktur workspace, jelaskan bahwa Dita di Ruang Utama yang akan membantu, lalu jangan mengklaim tindakan tersimpan jika tool tidak berhasil.",
    context.channel === "assistant" ? "ATURAN INTENT TIM: bedakan permintaan melihat daftar dengan permintaan perubahan. Hanya gunakan list_divisions bila pemilik meminta melihat/mengecek daftar tim. Jika pesan mengandung hapus/hilangkan dan menyebut semua tim, panggil delete_division dengan all=true; jika menyebut satu tim, panggil delete_division dengan name sesuai nama tim (atau id bila sudah diketahui); jika belum menyebut nama tim, tanyakan tim mana yang dimaksud. Jangan mengganti permintaan hapus menjadi list_divisions saja. Setiap penghapusan tetap membutuhkan konfirmasi kedua." : "",
    `Balas dalam Bahasa Indonesia kecuali pemilik meminta bahasa lain.`,
    "Gaya penulisan: tenang, manusiawi, dan fleksibel. Boleh merespons singkat untuk pesan singkat, menjelaskan bertahap untuk pertanyaan kompleks, atau memakai contoh bila membantu. Ikuti gaya bahasa pemilik termasuk bahasa santai, tetapi tetap jelas. Hindari jargon produk dan frasa pembuka yang berulang; jangan mengulang pertanyaan pemilik.",
    "Gunakan paragraf, daftar, tabel sederhana, atau format lain hanya bila paling membantu isi jawaban. Jangan memaksakan format, ringkasan, saran, atau next step jika tidak diperlukan. Untuk obrolan ringan, balas secara natural; untuk permintaan kerja, berikan hasil yang bisa langsung dipakai.",
  ].filter(Boolean).join("\n");
  return truncateForLLM(prompt, MAX_WORKSPACE_PROMPT_CHARS);
}

export function extractTextContent(content: string | MessageContent | MessageContent[] | null | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => extractTextContent(part)).filter(Boolean).join("\n");
  return content.type === "text" ? content.text : "";
}

export function fallbackWorkspaceReply(channel: string): string {
  const replies: Record<string, string> = {
    assistant: "Tulis pekerjaan yang ingin kamu bereskan. Aku akan membantu merapikan konteks dan langkahnya.",
    sales: "Tulis lead, penawaran, atau follow-up yang ingin kamu rapikan.",
    marketing: "Tulis brief, draft konten, atau hasil campaign yang ingin kamu bahas.",
    finance: "Tulis transaksi, cashflow, atau rekonsiliasi yang ingin kamu periksa.",
    operations: "Tulis SOP, order, stok, atau quality check yang ingin kamu rapikan.",
  };
  return replies[channel] || "Tulis pekerjaan yang ingin kamu selesaikan.";
}

export type ReceiptItem = { name: string; quantity: number; unitPrice: number; total: number };
export type ReceiptDraft = { vendor: string; date: string; total: number; items: ReceiptItem[]; categorySuggestion: string; confidence: number };

const receiptResponseFormat = { type: "json_schema", json_schema: { name: "receipt_drafts", strict: true, schema: { type: "object", properties: { receipts: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", properties: { vendor: { type: "string" }, date: { type: "string" }, total: { type: "integer", minimum: 0 }, items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "number", minimum: 0 }, unitPrice: { type: "integer", minimum: 0 }, total: { type: "integer", minimum: 0 } }, required: ["name", "quantity", "unitPrice", "total"], additionalProperties: false } }, categorySuggestion: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 } }, required: ["vendor", "date", "total", "items", "categorySuggestion", "confidence"], additionalProperties: false } } }, required: ["receipts"], additionalProperties: false } } } as const;

function normalizeReceiptDraft(parsed: ReceiptDraft): ReceiptDraft {
  if (!parsed.vendor?.trim() || !Number.isFinite(parsed.total) || parsed.total < 0 || !Array.isArray(parsed.items)) throw new Error("Struk belum cukup jelas untuk dibuat menjadi draft transaksi.");
  return { vendor: parsed.vendor.trim(), date: parsed.date?.trim() || "", total: Math.round(parsed.total), categorySuggestion: parsed.categorySuggestion?.trim() || "Belanja operasional", confidence: Math.max(0, Math.min(1, parsed.confidence || 0)), items: parsed.items.map((item) => ({ name: item.name?.trim() || "Item tanpa nama", quantity: Number(item.quantity) || 1, unitPrice: Math.max(0, Math.round(item.unitPrice || 0)), total: Math.max(0, Math.round(item.total || 0)) })) };
}

export async function extractReceiptDrafts(sourceUrl: string, sourceType: "image" | "pdf" = "image", invoke: typeof invokeLLM = invokeLLM): Promise<ReceiptDraft[]> {
  const response = await invoke({
    messages: [
      { role: "system", content: "Kamu adalah asisten akuntansi SAKU. Baca dokumen struk dengan teliti. Ekstrak hanya informasi yang terlihat; jangan mengarang angka. Gunakan Bahasa Indonesia. Jika tanggal tidak terbaca, isi string kosong. Jika item tidak terbaca, gunakan array kosong. Total harus berupa angka rupiah tanpa simbol." },
      { role: "user", content: [{ type: "text", text: sourceType === "pdf" ? "Analisis SEMUA halaman PDF. Deteksi dan pisahkan setiap struk yang berbeda berdasarkan halaman, header vendor, nomor transaksi, waktu, atau blok visual yang terpisah. Satu struk fisik harus menjadi satu elemen receipts. Jangan menggabungkan dua struk berbeda meskipun vendornya sama. Jika satu struk berlanjut ke halaman berikutnya, gabungkan menjadi satu elemen. Kembalikan vendor, tanggal, total, rincian barang, kategori, dan confidence untuk setiap struk." : "Analisis foto ini sebagai tepat satu struk. Kembalikan vendor, tanggal, total, rincian barang, kategori, dan confidence." }, sourceType === "pdf" ? { type: "file_url", file_url: { url: sourceUrl, mime_type: "application/pdf" } } : { type: "image_url", image_url: { url: sourceUrl, detail: "high" } }] },
    ],
    response_format: receiptResponseFormat,
  });
  const text = extractTextContent(response.choices?.[0]?.message?.content).trim();
  const parsed = JSON.parse(text) as { receipts?: ReceiptDraft[] };
  if (!Array.isArray(parsed.receipts) || !parsed.receipts.length) throw new Error("Struk belum cukup jelas untuk dibuat menjadi draft transaksi.");
  return parsed.receipts.map(normalizeReceiptDraft);
}

export async function extractReceiptDraft(sourceUrl: string, sourceType: "image" | "pdf" = "image", invoke: typeof invokeLLM = invokeLLM): Promise<ReceiptDraft> {
  return (await extractReceiptDrafts(sourceUrl, sourceType, invoke))[0];
}
