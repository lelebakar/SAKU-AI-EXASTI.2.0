import { describe, expect, it, vi } from "vitest";
import { buildSakuPipelineTemplateRecord, ensureSakuEmployeeBundle, formatAutomationRunNotification, getSakuPipelineTemplate, SAKU_PIPELINE_TEMPLATES, seedSakuOnboarding, selectRelevantMemories } from "./db";

describe("selectRelevantMemories", () => {
  it("prefers memories matching the latest work context", () => {
    const result = selectRelevantMemories([
      { memory: "Lead vendor harus di-follow-up.", importance: "medium" },
      { memory: "Brand tetap hangat dan jujur.", importance: "low" },
    ], "vendor follow-up");
    expect(result[0]?.memory).toContain("vendor");
    expect(result).toHaveLength(1);
  });

  it("keeps high-importance memories as safe context", () => {
    const result = selectRelevantMemories([
      { memory: "Pisahkan uang operasional dan uang pribadi.", importance: "high" },
      { memory: "Catatan yang tidak relevan.", importance: "low" },
    ], "stok");
    expect(result[0]?.importance).toBe("high");
  });

  it("ranks stored embeddings semantically before falling back to keywords", () => {
    const result = selectRelevantMemories([
      { memory: "Pelanggan menunggu jawaban penawaran.", importance: "medium", embeddingJson: JSON.stringify([0.98, 0.02]) },
      { memory: "Checklist packing harus selesai.", importance: "low", embeddingJson: JSON.stringify([0.05, 0.95]) },
    ], "follow up calon pembeli", [1, 0]);
    expect(result[0]?.memory).toContain("penawaran");
  });

  it("uses keyword matching when embeddings are unavailable", () => {
    const result = selectRelevantMemories([
      { memory: "Follow-up vendor penting.", importance: "medium" },
      { memory: "Catatan lain.", importance: "low" },
    ], "vendor");
    expect(result[0]?.memory).toContain("vendor");
  });
});

describe("business pipeline templates", () => {
  it("maps Sales, Finance, Marketing, and Operations to reusable templates", () => {
    expect(getSakuPipelineTemplate("sales").name).toBe("Lead sampai Closing");
    expect(getSakuPipelineTemplate("finance").steps).toContain("Rekonsiliasi");
    expect(getSakuPipelineTemplate("marketing").steps).toContain("Publish");
    expect(getSakuPipelineTemplate("operations").steps).toContain("Quality check");
    expect(SAKU_PIPELINE_TEMPLATES).toHaveLength(4);
  });

  it("builds persisted seeded records with the matching department steps", () => {
    const sales = buildSakuPipelineTemplateRecord("owner-saku-test", "sales");
    const finance = buildSakuPipelineTemplateRecord("owner-saku-test", "finance");
    expect(sales).toMatchObject({ channelId: "sales", name: "Lead sampai Closing", status: "active", currentStep: 1 });
    expect(JSON.parse(sales.stepsText)).toEqual(expect.arrayContaining(["Lead masuk", "Closing"]));
    expect(finance).toMatchObject({ channelId: "finance", name: "Kontrol Arus Kas", status: "active", currentStep: 1 });
    expect(JSON.parse(finance.stepsText)).toEqual(expect.arrayContaining(["Rekonsiliasi", "Laporan mingguan"]));
  });

  it("executes seeded Sales bundle creation with the reusable pipeline", async () => {
    const createPipeline = vi.fn().mockResolvedValue({ id: 4 });
    await ensureSakuEmployeeBundle("owner-saku-test", "sales", {
      getAgent: vi.fn().mockResolvedValue(undefined),
      upsertAgent: vi.fn().mockResolvedValue({ id: 9 }),
      createMemory: vi.fn().mockResolvedValue({ id: 1 }),
      createPipeline,
      createAutomation: vi.fn().mockResolvedValue({ id: 2 }),
    });
    expect(createPipeline).toHaveBeenCalledWith(expect.objectContaining({ name: "Lead sampai Closing", status: "active", currentStep: 1, stepsText: JSON.stringify(["Lead masuk", "Kualifikasi kebutuhan", "Follow-up", "Kirim penawaran", "Negosiasi", "Closing", "After-sales"]) }));
  });

  it("activates a saved custom division with an employee and custom workflow", async () => {
    const createPipeline = vi.fn().mockResolvedValue({ id: 14 });
    const upsertAgent = vi.fn().mockResolvedValue({ id: 19 });
    await ensureSakuEmployeeBundle("owner-custom-division-test", "custom-31-procurement", {
      getAgent: vi.fn().mockResolvedValue(undefined),
      getDivision: vi.fn().mockResolvedValue({ name: "Tim Procurement", businessArea: "procurement", description: "Mengurus pembelian dan hubungan supplier." }),
      upsertAgent,
      createMemory: vi.fn().mockResolvedValue({ id: 11 }),
      createPipeline,
      createAutomation: vi.fn().mockResolvedValue({ id: 12 }),
    });
    expect(upsertAgent).toHaveBeenCalledWith(expect.objectContaining({ channelId: "custom-31-procurement", status: "online", roleTitle: "Lead Procurement" }));
    expect(createPipeline).toHaveBeenCalledWith(expect.objectContaining({ channelId: "custom-31-procurement", status: "active", stepsText: JSON.stringify(["Brief", "Kerjakan", "Update"]) }));
  });

  it("seeds Dita and the selected starter teams while ignoring unsupported priorities", async () => {
    const requestedChannels: string[] = [];
    await seedSakuOnboarding("owner-saku-test", ["Penjualan", "Marketing", "Customer Service"], {
      getAgent: vi.fn().mockImplementation(async (_owner, channelId) => { requestedChannels.push(channelId); return undefined; }),
      upsertAgent: vi.fn().mockResolvedValue({ id: 9 }),
      createMemory: vi.fn().mockResolvedValue({ id: 1 }),
      createPipeline: vi.fn().mockResolvedValue({ id: 4 }),
      createAutomation: vi.fn().mockResolvedValue({ id: 2 }),
    });
    expect(requestedChannels).toEqual(["assistant", "sales", "marketing"]);
  });
});

describe("automation run notifications", () => {
  it("formats clear Indonesian success and failure messages", () => {
    expect(formatAutomationRunNotification("Ringkasan Pagi", "success", "3 tugas selesai.")).toBe("Automasi “Ringkasan Pagi” berhasil. 3 tugas selesai.");
    expect(formatAutomationRunNotification("Sinkronisasi Stok", "failed", "Koneksi ke sumber data gagal.")).toBe("Automasi “Sinkronisasi Stok” gagal. Koneksi ke sumber data gagal.");
  });
});
