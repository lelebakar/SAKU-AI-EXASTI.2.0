import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { extractFileIntelligence } from "./file-intelligence";
import { completeWorkspaceToolTurn, executeWorkspaceToolCalls, fallbackToolReply, generateContentPackage, IMAGE_OCR_PROMPT, invokeLLMWithTransientRetry } from "./routers";
import { buildWorkspaceSystemPrompt, extractReceiptDraft, extractReceiptDrafts, extractTextContent, fallbackWorkspaceReply, MAX_WORKSPACE_PROMPT_CHARS, normalizeAssistantReply, truncateForLLM } from "./saku-ai";
import { buildDefaultSakuTeamStandards } from "./db";
import * as XLSX from "xlsx";

const fixture = (name: string) => fs.readFileSync(path.resolve(import.meta.dirname, "fixtures", name));

describe("Saku AI helpers", () => {
  it("keeps image OCR instructions consistently in Indonesian", () => {
    expect(IMAGE_OCR_PROMPT).toContain("Baca gambar ini dengan OCR");
    expect(IMAGE_OCR_PROMPT).toContain("Ekstrak semua teks");
    expect(IMAGE_OCR_PROMPT).toContain("Bahasa Indonesia");
    expect(IMAGE_OCR_PROMPT).not.toContain("Lees deze afbeelding");
    expect(IMAGE_OCR_PROMPT).not.toContain("Extraheer");
  });

  it("builds a grounded workspace prompt", () => {
    const prompt = buildWorkspaceSystemPrompt({
      channel: "sales",
      teamName: "Tim Sales",
      businessName: "Toko Rona",
      ownerName: "Adistia Dwi Saputra",
      agentName: "Raka",
      agentRole: "Senior Sales",
      skills: ["Follow-up"],
      memory: ["Lead hangat maksimal 24 jam"],
      dataAccess: ["CRM"],
      pipeline: "Lead → Closing",
    });
    expect(prompt).toContain("Toko Rona");
    expect(prompt).toContain("Lead hangat maksimal 24 jam");
    expect(prompt).toContain("Lead → Closing");
    expect(prompt).toContain("Nama pemilik workspace: Adistia Dwi Saputra");
    expect(prompt).not.toContain("Kak Rani");
  });

  it("keeps finance journal writes explicit and duplicate-safe", () => {
    const prompt = buildWorkspaceSystemPrompt({ channel: "finance", teamName: "Tim Finance", businessName: "Toko Rona", agentName: "Raka", agentRole: "Finance Lead" });
    expect(prompt).toContain("jangan menyimpan apa pun");
    expect(prompt).toContain("pemasukan atau pengeluaran");
    expect(prompt).toContain("jangan membuat duplikat");
  });

  it("normalizes text and array response content", () => {
    expect(extractTextContent([{ type: "text", text: "Halo" }, { type: "image_url", image_url: { url: "x" } }])).toBe("Halo");
    expect(fallbackWorkspaceReply("finance")).toContain("cashflow");
  });

  it("keeps assistant replies readable without markdown decoration", () => {
    expect(normalizeAssistantReply("# Ringkasan\n\n**Fokus:** *stok*\n- Cek barang\n- Hubungi vendor")).toBe("Ringkasan\n\nFokus: stok\n• Cek barang\n• Hubungi vendor");
  });

  it("explicitly discloses when no relevant memory was found", () => {
    const prompt = buildWorkspaceSystemPrompt({ channel: "sales", teamName: "Tim Sales", businessName: "Toko Rona", agentName: "Raka", agentRole: "Senior Sales", memory: [], memoryStatus: "empty" });
    expect(prompt).toContain("belum ketemu memory relevan");
  });

  it("injects team standards as mandatory operating rules", () => {
    const prompt = buildWorkspaceSystemPrompt({
      channel: "sales",
      teamName: "Tim Sales",
      businessName: "Toko Rona",
      agentName: "Raka",
      agentRole: "Senior Sales",
      teamStandards: {
        purpose: "Menaikkan konversi lead hangat.",
        principles: "Selalu kualifikasi sebelum memberi penawaran.",
        responseStyle: "Ringkas dan persuasif.",
        outputFormat: "Kesimpulan lalu next step.",
        guardrails: "Jangan mengarang harga atau diskon.",
        checklist: "Cek kebutuhan dan status lead.",
      },
    });
    expect(prompt).toContain("STANDAR TIM WAJIB");
    expect(prompt).toContain("Selalu kualifikasi sebelum memberi penawaran.");
    expect(prompt).toContain("Jangan mengarang harga atau diskon.");
    expect(prompt).toContain("Jika permintaan bertentangan dengan standar tim");
  });

  it("creates focused baseline standards for a team instead of leaving the AI unguided", () => {
    const standards = buildDefaultSakuTeamStandards("finance", "Tim Keuangan", "Finance Controller");
    expect(standards.purpose).toContain("keputusan keuangan tetap akurat");
    expect(standards.guardrails).toContain("Jangan mengarang data");
    expect(standards.checklist).toContain("periksa guardrail");
  });

  it("carries division, personality, pipeline, and automation configuration into the prompt", () => {
    const prompt = buildWorkspaceSystemPrompt({
      channel: "operations",
      teamName: "Tim Operasional",
      businessName: "Toko Rona",
      teamDescription: "Menjaga order sampai terkirim.",
      businessArea: "Operasional",
      agentName: "Gilang",
      agentRole: "Ops Lead",
      agentPersonality: "Tegas, teliti, dan tidak melewati quality check.",
      pipeline: "Order → Packing → Pickup",
      pipelineDetails: "Order sampai Terkirim; status active; langkah aktif 3",
      automation: "Alert stok menipis",
      automationDetails: "Memberi peringatan; pemicu stok di bawah minimum; status active",
    });
    expect(prompt).toContain("Menjaga order sampai terkirim.");
    expect(prompt).toContain("Tegas, teliti");
    expect(prompt).toContain("langkah aktif 3");
    expect(prompt).toContain("stok di bawah minimum");
    expect(prompt).toContain("Semua konfigurasi di atas adalah sumber kebenaran kerja");
  });

  it("truncates oversized LLM context explicitly", () => {
    const truncated = truncateForLLM("x".repeat(MAX_WORKSPACE_PROMPT_CHARS + 500), MAX_WORKSPACE_PROMPT_CHARS);
    expect(truncated.length).toBeLessThanOrEqual(MAX_WORKSPACE_PROMPT_CHARS);
    expect(truncated).toContain("[dipotong]");
  });

  it("extracts a receipt into an editable journal draft", async () => {
    const draft = await extractReceiptDraft("https://storage.example/nota.jpg", "image", async () => ({ choices: [{ message: { content: JSON.stringify({ receipts: [{ vendor: "Toko Bahan", date: "14/09/2026", total: 125000, items: [{ name: "Tepung", quantity: 2, unitPrice: 50000, total: 100000 }], categorySuggestion: "Bahan baku", confidence: 0.92 }] }) } }] }) as never);
    expect(draft).toMatchObject({ vendor: "Toko Bahan", date: "14/09/2026", total: 125000, categorySuggestion: "Bahan baku", confidence: 0.92 });
    expect(draft.items[0]).toMatchObject({ name: "Tepung", quantity: 2, total: 100000 });
  });

  it("sends PDF receipts to the vision model as a PDF file", async () => {
    let request: any;
    await extractReceiptDraft("https://storage.example/nota.pdf", "pdf", async (params) => {
      request = params;
      return { choices: [{ message: { content: JSON.stringify({ receipts: [{ vendor: "Toko", date: "2026-09-14", total: 1000, items: [], categorySuggestion: "Operasional", confidence: 0.8 }] }) } }] } as never;
    });
    expect(request.messages[1].content[1]).toMatchObject({ type: "file_url", file_url: { url: "https://storage.example/nota.pdf", mime_type: "application/pdf" } });
  });

  it("separates multiple receipts returned from one PDF", async () => {
    const drafts = await extractReceiptDrafts("https://storage.example/bundle.pdf", "pdf", async () => ({ choices: [{ message: { content: JSON.stringify({ receipts: [{ vendor: "Toko A", date: "2026-09-14", total: 1000, items: [], categorySuggestion: "Operasional", confidence: 0.9 }, { vendor: "Toko B", date: "2026-09-14", total: 2000, items: [], categorySuggestion: "Bahan baku", confidence: 0.85 }] }) } }] }) as never);
    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.vendor)).toEqual(["Toko A", "Toko B"]);
  });
});

describe("file intelligence", () => {
  it("extracts text and a compact CSV preview", async () => {
    const result = await extractFileIntelligence("produk.csv", "text/csv", Buffer.from("produk,harga\nKopi,25000"));
    expect(result).toMatchObject({ kind: "csv", status: "complete", needsVision: false });
    expect(result.text).toContain("Kopi");
    expect(result.preview).toContain("Kopi · 25000");
  });

  it("routes images to the vision path and accepts legacy office files with metadata", async () => {
    expect(await extractFileIntelligence("nota.png", "image/png", Buffer.from("image"))).toMatchObject({ kind: "image", status: "pending", needsVision: true });
    expect(await extractFileIntelligence("brief.doc", "application/msword", Buffer.from("doc"))).toMatchObject({ kind: "unknown", status: "complete", needsVision: false });
  });

  it("extracts common text and code files", async () => {
    const result = await extractFileIntelligence("resep.json", "application/json", Buffer.from('{"produk":"Kopi","harga":25000}'));
    expect(result).toMatchObject({ kind: "text", status: "complete", needsVision: false });
    expect(result.text).toContain("Kopi");
  });

  it("keeps arbitrary binary files attachable with honest metadata", async () => {
    const result = await extractFileIntelligence("backup.bin", "application/octet-stream", Buffer.from([1, 2, 3]));
    expect(result).toMatchObject({ kind: "unknown", status: "complete", needsVision: false });
    expect(result.preview).toContain("Metadata tersedia");
  });

  it("reads XLSX sheets into labeled text for the AI", async () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([["Vendor", "Total", "Category"], ["Toko Kopi", 125000, "Bahan baku"]]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Jurnal");
    const data = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const result = await extractFileIntelligence("jurnal.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data);
    expect(result).toMatchObject({ kind: "spreadsheet", status: "complete", needsVision: false });
    expect(result.text).toContain("Sheet: Jurnal");
    expect(result.text).toContain("Vendor: Toko Kopi");
    expect(result.text).toContain("Total: 125000");
  });

  it("returns an actionable failure for malformed XLSX data", async () => {
    const result = await extractFileIntelligence("jurnal.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from("not an xlsx"));
    expect(result).toMatchObject({ kind: "spreadsheet", status: "failed", needsVision: false });
    expect(result.preview).toContain("File Excel tidak bisa dibaca");
  });

  it("extracts text and page context from a PDF", async () => {
    const result = await extractFileIntelligence("brief.pdf", "application/pdf", fixture("sample.pdf"));
    expect(result).toMatchObject({ kind: "pdf", status: "complete", needsVision: false });
    expect(result.text).toContain("PDF Saku Test");
    expect(result.preview).toContain("Halaman 1");
  });

  it("extracts paragraphs and document metadata from DOCX", async () => {
    const result = await extractFileIntelligence("brief.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fixture("sample.docx"));
    expect(result).toMatchObject({ kind: "word", status: "complete", needsVision: false });
    expect(result.text).toContain("Dokumen Word Saku Test");
    expect(result.text).toContain("Harga kopi: 25000");
    expect(result.preview).toContain("Word ·");
  });

  it("returns a useful failure for malformed PDFs instead of throwing", async () => {
    const result = await extractFileIntelligence("broken.pdf", "application/pdf", Buffer.from("not a pdf"));
    expect(result).toMatchObject({ kind: "pdf", status: "failed", needsVision: false });
    expect(result.preview).toContain("PDF gagal diekstrak");
  });
});

describe("workspace multi-tool turns", () => {
  const toolCall = (id: string, name: string, args = "{}"): any => ({ id, type: "function", function: { name, arguments: args } });

  it("executes every tool call in order and returns a tool message for each", async () => {
    const order: string[] = [];
    const result = await executeWorkspaceToolCalls(
      [toolCall("call-1", "create_division"), toolCall("call-2", "create_automation")],
      async (call) => {
        order.push(call.id);
        return { toolName: call.function.name, success: true };
      },
    );

    expect(order).toEqual(["call-1", "call-2"]);
    expect(result.toolResults).toHaveLength(2);
    expect(result.toolMessages.map((message) => message.tool_call_id)).toEqual(["call-1", "call-2"]);
  });

  it("continues with later tools when an earlier tool fails", async () => {
    const executed: string[] = [];
    const result = await executeWorkspaceToolCalls(
      [toolCall("call-1", "broken"), toolCall("call-2", "works")],
      async (call) => {
        executed.push(call.id);
        if (call.id === "call-1") throw new Error("invalid arguments");
        return { toolName: call.function.name, success: true };
      },
    );

    expect(executed).toEqual(["call-1", "call-2"]);
    expect(result.toolResults[0]).toMatchObject({ success: false, error: "invalid arguments" });
    expect(result.toolResults[1]).toMatchObject({ success: true, toolName: "works" });
  });

  it("uses the manual fallback when the second LLM turn fails", async () => {
    const result = await completeWorkspaceToolTurn({
      systemPrompt: "system",
      history: [],
      modelMessage: { content: "", tool_calls: [toolCall("call-1", "create_division")] },
      executeToolCall: async () => ({ toolName: "create_division", success: true, division: { name: "Tim Sales" } }),
      invokeFinal: async () => { throw new Error("network down"); },
      fallbackContent: (toolResults) => fallbackToolReply("sales", toolResults),
    });

    expect(result.content).toContain("Tim Sales");
    expect(result.toolResults).toHaveLength(1);
  });
});

describe("LLM transient retry", () => {
  it("retries one time after a transient failure", async () => {
    let attempts = 0;
    const delays: number[] = [];
    await expect(invokeLLMWithTransientRetry(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("fetch failed");
      return "ok";
    }, async (ms) => { delays.push(ms); })).resolves.toBe("ok");
    expect(attempts).toBe(2);
    expect(delays).toEqual([500]);
  });

  it("does not retry a validation or 4xx failure", async () => {
    let attempts = 0;
    await expect(invokeLLMWithTransientRetry(async () => {
      attempts += 1;
      throw new Error("LLM invoke failed: 400 Bad Request");
    }, async () => undefined)).rejects.toThrow("400 Bad Request");
    expect(attempts).toBe(1);
  });
});

describe("content package generation", () => {
  it("keeps Twitter captions within 280 characters and passes platform guidance", async () => {
    let request = "";
    const result = await generateContentPackage({ topic: "Promo kopi susu gula aren", platform: "twitter", tone: "santai" }, {
      invoke: async (input) => {
        request = String(input.messages[0]?.content);
        return { choices: [{ message: { content: JSON.stringify({ caption: `${"Promo kopi susu gula aren! ".repeat(20)} #kopigulaaren` }) } }] } as any;
      },
      image: async () => ({ url: "https://example.com/kopi.png" } as any),
    });

    expect(request).toContain("Twitter/X");
    expect(request).toContain("Promo kopi susu gula aren");
    expect(result.platform).toBe("twitter");
    expect(result.caption.length).toBeLessThanOrEqual(280);
    expect(result.imageUrl).toBe("https://example.com/kopi.png");
  });

  it("returns the caption package when image generation fails", async () => {
    const result = await generateContentPackage({ topic: "Peluncuran menu sarapan baru", platform: "instagram" }, {
      invoke: async () => ({ choices: [{ message: { content: JSON.stringify({ caption: "Sarapan baru untuk memulai hari dengan lebih hangat. #MenuSarapan" }) } }] } as any),
      image: async () => { throw new Error("image service unavailable"); },
    });

    expect(result).toMatchObject({ platform: "instagram", caption: "Sarapan baru untuk memulai hari dengan lebih hangat. #MenuSarapan", imageUrl: undefined });
  });
});
