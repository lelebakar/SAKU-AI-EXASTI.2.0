// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authUser: { name: "Rani", openId: "owner-saku-test" } as { name: string; openId: string } | null,
  replyMutate: vi.fn(),
  uploadMutateAsync: vi.fn(),
  onboardingPrepareMutate: vi.fn(),
  workspaceProfile: { businessName: "Toko Rona", persona: "" } as { businessName: string; persona: string } | undefined,
  applyTemplateMutate: vi.fn(),
  employeeContext: null as unknown,
  employeeContextCalls: 0,
  employeeContextArgs: [] as unknown[],
  automationRuns: [] as unknown[],
  persistedMessages: [] as unknown[],
  messagesUnavailable: false,
  saveMessageMutate: vi.fn(),
  pipelineTemplates: [
    { id: "sales", department: "Sales", name: "Lead sampai Closing", description: "Mengubah lead masuk menjadi pelanggan yang terlayani dan terukur.", steps: ["Lead masuk", "Kualifikasi kebutuhan", "Closing"] },
    { id: "finance", department: "Finance", name: "Kontrol Arus Kas", description: "Menjaga transaksi tercatat.", steps: ["Catat transaksi", "Rekonsiliasi"] },
    { id: "marketing", department: "Marketing", name: "Campaign sampai Publish", description: "Membawa ide sampai publish.", steps: ["Brief kampanye", "Publish"] },
    { id: "operations", department: "Operations", name: "Order sampai Terkirim", description: "Memastikan order tepat waktu.", steps: ["Order masuk", "Packing", "Terkirim"] },
  ],
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: mocks.authUser, loading: false, isAuthenticated: Boolean(mocks.authUser), error: null }),
}));
vi.mock("@/const", () => ({ startLogin: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ workspace: { snapshot: { invalidate: vi.fn() }, employeeContext: { invalidate: vi.fn() }, divisions: { list: { invalidate: vi.fn() } }, automations: { list: { invalidate: vi.fn() } }, automationRuns: { list: { invalidate: vi.fn() } }, reconciliationRules: { list: { invalidate: vi.fn() } }, standards: { get: { invalidate: vi.fn() } } } }),
    auth: { register: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) }, login: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) }, requestPasswordReset: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) }, resetPassword: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) }, changePassword: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } },
    sakuAi: { reply: { useMutation: () => ({ isPending: false, mutate: mocks.replyMutate }) } },
    workspace: { finance: { review: { useQuery: () => ({ data: { mutations: [], receivables: [] }, isLoading: false, isFetching: false, refetch: vi.fn() }) } }, integrations: { googleSheetsStatus: { useQuery: () => ({ data: { connected: false }, isLoading: false }) }, exportReport: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) }, connectMoota: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } }, profile: { get: { useQuery: () => ({ data: mocks.workspaceProfile, isLoading: false }) }, update: { useMutation: () => ({ mutate: vi.fn() }) } }, standards: { get: { useQuery: () => ({ data: undefined, isLoading: false }) }, upsert: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } }, messages: { list: { useQuery: () => ({ data: mocks.messagesUnavailable ? undefined : mocks.persistedMessages, isLoading: false }) }, save: { useMutation: () => ({ mutate: mocks.saveMessageMutate }) } }, members: { list: { useQuery: () => ({ data: [] }) }, invite: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } , update: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } }, support: { list: { useQuery: () => ({ data: [] }) }, create: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } }, onboarding: { prepare: { useMutation: (options: { onSuccess: (result: any) => void }) => ({ isPending: false, mutate: (input: unknown) => { mocks.onboardingPrepareMutate(input); options.onSuccess({ businessName: "Toko Rona", persona: "Profil bisnis siap.", seededChannels: ["assistant", "sales"], plan: { teams: [{ name: "Tim Sales" }] } }); } }) } }, divisions: { list: { useQuery: () => ({ data: [] }) } }, automations: { list: { useQuery: () => ({ data: [] }) } }, reconciliationRules: { list: { useQuery: () => ({ data: [], isLoading: false }) }, create: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) }, remove: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } }, snapshot: { useQuery: () => ({ data: { divisions: 5, files: 8, automations: 6, pipelines: 5 } }) }, pipelineTemplates: { list: { useQuery: () => ({ data: mocks.pipelineTemplates }) }, applyTemplate: { useMutation: () => ({ isPending: false, mutate: mocks.applyTemplateMutate }) } }, automationRuns: { list: { useQuery: () => ({ data: mocks.automationRuns }) } }, employeeContext: { useQuery: (input: unknown) => { mocks.employeeContextCalls += 1; mocks.employeeContextArgs.push(input); return { data: mocks.employeeContext }; } } },
    storage: {
      list: { useQuery: () => ({ data: [] }) },
      upload: { useMutation: () => ({ isPending: false, mutateAsync: mocks.uploadMutateAsync }) },
    },
  },
}));

import Home, { WorkspaceLoadingSkeleton } from "./Home";

describe("SAKU AI rendered create-division flow", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    mocks.authUser = { name: "Rani", openId: "owner-saku-test" };
    mocks.workspaceProfile = { businessName: "Toko Rona", persona: "" };
    mocks.replyMutate.mockReset();
    mocks.uploadMutateAsync.mockReset();
    mocks.onboardingPrepareMutate.mockReset();
    mocks.uploadMutateAsync.mockResolvedValue({ url: "/manus-storage/test-file", extractionStatus: "complete", extractionPreview: "Nama produk, harga, dan stok terbaca.", detectedKind: "csv" });
    mocks.applyTemplateMutate.mockReset();
    mocks.employeeContext = null;
    mocks.employeeContextCalls = 0;
    mocks.employeeContextArgs = [];
    mocks.automationRuns = [];
    mocks.persistedMessages = [];
    mocks.messagesUnavailable = false;
    mocks.saveMessageMutate.mockReset();
  });

  it("shows a public welcome screen before login instead of a private workspace shell", () => {
    mocks.authUser = null;
    render(<Home />);
    expect(screen.getByText("Masuk ke workspace.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Google" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Facebook" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Instagram" })).toBeTruthy();
    expect(screen.getByPlaceholderText("nama@email.com")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Tulis pesan ke Dita…")).toBeNull();
  });

  it("automatically opens the AI interview for a first-time workspace", async () => {
    mocks.workspaceProfile = undefined;
    render(<Home />);
    await waitFor(() => expect(screen.getByText("Wawancara ringan bersama Dita")).toBeTruthy());
  });

  it("does not loop while persisted messages are unavailable", () => {
    mocks.messagesUnavailable = true;
    expect(() => render(<Home />)).not.toThrow();
    expect(screen.getByText("Belum ada pesan di sini")).toBeTruthy();
  });

  it("restores persisted messages after the workspace is mounted", () => {
    mocks.persistedMessages = [{ messageKey: "saved-owner-1", sender: "owner", senderName: "Rani", senderRole: null, content: "Tolong rangkum penjualan minggu ini.", attachmentJson: null, createdAt: new Date("2026-09-13T10:00:00Z") }, { messageKey: "saved-assistant-1", sender: "assistant", senderName: "Dita", senderRole: "Asisten Pribadi", content: "Siap, aku rangkumkan sekarang.", attachmentJson: null, createdAt: new Date("2026-09-13T10:01:00Z") }];
    render(<Home />);
    expect(screen.getByText("Tolong rangkum penjualan minggu ini.")).toBeTruthy();
    expect(screen.getByText("Siap, aku rangkumkan sekarang.")).toBeTruthy();
  });

  it("renders the AI employee profile, memory, database, pipeline, and automation context", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Buka info percakapan" }));
    expect(document.body.textContent).toContain("Memory kerja");
    expect(document.body.textContent).toContain("Database yang bisa dibaca");
    expect(document.body.textContent).toContain("Pipeline aktif");
    expect(document.body.textContent).toContain("Belum ada alur aktif");
    expect(document.body.textContent).toContain("Belum ada automasi");
  });

  it("renders ready-to-use Sales, Finance, Marketing, and Operations pipeline templates in settings", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Buka info percakapan" }));
    fireEvent.click(screen.getByRole("button", { name: "Tutup detail" }));
    fireEvent.click(screen.getByRole("button", { name: "Pengaturan akun" }));
    expect(await screen.findByText("Template pipeline bisnis")).toBeTruthy();
    expect(screen.getByTestId("team-standards-panel")).toBeTruthy();
    expect(screen.getByTestId("pipeline-template-sales")).toBeTruthy();
    expect(screen.getByTestId("pipeline-template-finance")).toBeTruthy();
    expect(screen.getByTestId("pipeline-template-marketing")).toBeTruthy();
    expect(screen.getByTestId("pipeline-template-operations")).toBeTruthy();
    expect(screen.getByTestId("pipeline-template-sales").textContent).toContain("Lead sampai Closing");
    expect(screen.getByTestId("pipeline-template-finance").textContent).toContain("Kontrol Arus Kas");
    expect((screen.getByTestId("apply-template-sales") as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.applyTemplateMutate).not.toHaveBeenCalled();
  });

  it("renders real member management and help center controls in settings", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Pengaturan akun" }));
    expect(await screen.findByText("Kelola anggota workspace")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Catat undangan" })).toBeTruthy();
    expect(screen.getByText("Pusat bantuan SAKU AI")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kirim ke pusat bantuan" })).toBeTruthy();
  });

  it("re-fetches persisted employee context after remount", () => {
    mocks.employeeContext = { agent: { id: 99, name: "Naya", roleTitle: "Lead Procurement", skillsText: JSON.stringify(["Vendor"]), dataAccessText: JSON.stringify(["Vendor"]), status: "online" }, memories: [{ memory: "Lead time vendor penting." }], pipelines: [{ stepsText: JSON.stringify(["Brief", "Cari vendor", "PO"]) }], automations: [{ name: "Alert harga vendor" }] };
    const first = render(<Home />);
    expect(document.body.textContent).toContain("Naya · Lead Procurement");
    const callsAfterFirstMount = mocks.employeeContextCalls;
    first.unmount();
    render(<Home />);
    expect(mocks.employeeContextCalls).toBeGreaterThan(callsAfterFirstMount);
    expect(document.body.textContent).toContain("Naya · Lead Procurement");
    expect(document.body.textContent).toContain("Memory tersimpan");
  });

  it("shows a created automation as an executed action and in settings", async () => {
    mocks.automationRuns = [{ id: 44, automationId: 4, channelId: "assistant", status: "success", output: "Laporan penjualan berhasil dibuat.", createdAt: new Date() }];
    mocks.replyMutate.mockImplementation((_input: unknown, options: { onSuccess: (response: unknown) => void }) => {
      options.onSuccess({
        content: "Sudah aktif, Kak. Automasi Laporan penjualan dibuat dan akan berjalan setiap pagi.",
        senderName: "Dita",
        senderRole: "Asisten Pribadi",
        toolResults: [{ toolName: "create_automation", success: true, automation: { id: 44, name: "Laporan penjualan", description: "Mengirim ringkasan penjualan.", trigger: "Setiap pagi", status: "active" } }],
      });
    });

    render(<Home />);
    fireEvent.change(screen.getByPlaceholderText("Tulis pesan ke Dita…"), { target: { value: "Tolong buatkan automasi laporan penjualan." } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim pesan" }));

    expect(await screen.findByText("Automasi dibuat dan diaktifkan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pengaturan akun" }));
    expect(await screen.findByText("Automasi aktif")).toBeTruthy();
    expect(screen.getByText("Laporan penjualan")).toBeTruthy();
    expect(screen.getByText("Run #44")).toBeTruthy();
    expect(screen.getByText("Laporan penjualan berhasil dibuat.")).toBeTruthy();
  });

  it("sends configured pipelines longer than the old 160-character limit", () => {
    const longPipeline = Array.from({ length: 24 }, (_, index) => `Langkah konfigurasi kerja ${index + 1} dengan detail operasional`).join(" → ");
    mocks.employeeContext = { agent: { id: 99, name: "Naya", roleTitle: "Lead Procurement", skillsText: JSON.stringify(["Vendor"]), dataAccessText: JSON.stringify(["Vendor"]), status: "online" }, memories: [{ memory: "Lead time vendor penting." }], pipelines: [{ stepsText: JSON.stringify(longPipeline.split(" → ")) }], automations: [{ name: "Alert harga vendor" }] };
    render(<Home />);
    fireEvent.change(screen.getByPlaceholderText("Tulis pesan ke Dita…"), { target: { value: "Apa langkah kerja tim?" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim pesan" }));
    expect(mocks.replyMutate).toHaveBeenCalledWith(expect.objectContaining({ pipeline: longPipeline }), expect.any(Object));
    expect(longPipeline.length).toBeGreaterThan(160);
  });

  it("activates in-chat search and conversation actions", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Cari dalam chat" }));
    const searchInput = screen.getByPlaceholderText("Cari pesan di percakapan ini");
    fireEvent.change(searchInput, { target: { value: "Penjualan" } });
    expect(screen.getByText("Tidak ada pesan yang cocok")).toBeTruthy();
    expect(screen.queryByText(/Selamat pagi, Kak Rani/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Menu percakapan" }));
    expect(screen.getByRole("button", { name: "Tandai sudah dibaca" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tandai sudah dibaca" }));
    expect(screen.queryByRole("button", { name: "Tandai sudah dibaca" })).toBeNull();
  });

  it("offers useful starter prompts and explains empty search results", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Ringkas pekerjaan minggu ini" }));
    expect((screen.getByPlaceholderText("Tulis pesan ke Dita…") as HTMLInputElement).value).toBe("Ringkas pekerjaan minggu ini");
    fireEvent.click(screen.getByRole("button", { name: "Cari dalam chat" }));
    fireEvent.change(screen.getByPlaceholderText("Cari pesan di percakapan ini"), { target: { value: "kata yang tidak ada" } });
    expect(screen.getByText("Tidak ada pesan yang cocok")).toBeTruthy();
    expect(screen.getByText("Coba kata kunci lain atau bersihkan pencarian.")).toBeTruthy();
  });

  it("explains the first three steps and the empty team state", () => {
    render(<Home />);
    expect(screen.getByRole("region", { name: "Panduan singkat SAKU AI" })).toBeTruthy();
    expect(screen.getByText("Profil bisnis")).toBeTruthy();
    expect(screen.getByText("Pekerjaan utama")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Cari tim atau percakapan" }), { target: { value: "tim yang tidak ada" } });
    expect(screen.getByText("Tim tidak ditemukan")).toBeTruthy();
    expect(screen.getByText("Coba kata kunci lain.")).toBeTruthy();
  });

  it("gives important icons concise accessible tooltip labels", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: "Cari dalam chat" }).getAttribute("title")).toBe("Cari dalam chat");
    expect(screen.getByRole("button", { name: "Buka info percakapan" }).getAttribute("title")).toBe("Buka info percakapan");
    expect(screen.getByRole("button", { name: "Menu percakapan" }).getAttribute("title")).toBe("Menu percakapan");
    expect(screen.getByRole("button", { name: "Pengaturan akun" }).getAttribute("title")).toBe("Pengaturan akun");
  });

  it("shows an informative animated loading state for workspace data", () => {
    render(<WorkspaceLoadingSkeleton />);
    expect(screen.getByRole("status", { name: "Memuat data workspace" })).toBeTruthy();
    expect(screen.getByText("Menyiapkan workspace…")).toBeTruthy();
    expect(screen.getByText("Mengambil percakapan, tim, dan konteks AI")).toBeTruthy();
    expect(document.querySelector(".loading-orbit")).toBeTruthy();
    expect(document.querySelector(".loading-shimmer")).toBeTruthy();
  });

  it("shows completed, active, and pending loading stages in order", () => {
    render(<WorkspaceLoadingSkeleton stages={[{ label: "Tim", state: "done" }, { label: "Dokumen", state: "active" }, { label: "Konteks AI", state: "pending" }]} />);
    expect(screen.getByText("Tim").className).toContain("loading-stage-done");
    expect(screen.getByText("Dokumen").className).toContain("loading-stage-active");
    expect(screen.getByText("Konteks AI").className).toContain("loading-stage-pending");
    expect(screen.getByText("✓")).toBeTruthy();
  });

  it("opens the sequential icon tour from the workspace menu", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Buka menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Pelajari ikon penting" }));
    expect(screen.getByRole("dialog", { name: "Cari percakapan" })).toBeTruthy();
    expect(screen.getByLabelText("Langkah 1 dari 6")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(screen.getByRole("dialog", { name: "Mulai chat baru" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lewati tur ikon" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders extraction status and preview after an uploaded document is processed", async () => {
    const rendered = render(<Home />);
    const input = rendered.container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["produk,harga\\nKopi,25000"], "produk.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("Konten terbaca")).toBeTruthy();
    expect(screen.getByText("Nama produk, harga, dan stok terbaca.")).toBeTruthy();
    expect(mocks.uploadMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ fileName: "produk.csv", mimeType: "text/csv" }));
  });

  it("renders a generated image attachment and executed action status", async () => {
    mocks.replyMutate.mockImplementation((_input: unknown, options: { onSuccess: (response: unknown) => void }) => {
      options.onSuccess({
        content: "Visual produknya sudah jadi, Kak.",
        senderName: "Dita",
        senderRole: "Asisten Pribadi",
        toolResults: [{ toolName: "generate_image", success: true, attachment: { url: "/manus-storage/generated-product.png", name: "Visual Produk.png", type: "image" } }],
      });
    });

    render(<Home />);
    fireEvent.change(screen.getByPlaceholderText("Tulis pesan ke Dita…"), { target: { value: "Buatkan gambar produk kopi untuk katalog." } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim pesan" }));

    expect(await screen.findByText("Visual produknya sudah jadi, Kak.")).toBeTruthy();
    expect(screen.getByText("Visual dibuat dan dilampirkan")).toBeTruthy();
    expect(screen.getByText("Visual Produk.png")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Visual Produk.png" })).toBeTruthy();
  });

  it("renders generated video and voice note attachments with playback and download", async () => {
    mocks.replyMutate.mockImplementation((_input: unknown, options: { onSuccess: (response: unknown) => void }) => {
      options.onSuccess({ content: "Media sudah siap.", senderName: "Dita", senderRole: "Asisten Pribadi", toolResults: [{ toolName: "generate_video", success: true, attachment: { url: "/manus-storage/video.mp4", name: "Video SAKU AI.mp4", type: "video" } }] });
    });
    render(<Home />);
    fireEvent.change(screen.getByPlaceholderText("Tulis pesan ke Dita…"), { target: { value: "Buat video singkat." } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim pesan" }));
    expect(await screen.findByText("Video dibuat dan dilampirkan")).toBeTruthy();
    expect(document.querySelector("video[src='/manus-storage/video.mp4']")).toBeTruthy();
    expect(screen.getByText("Video SAKU AI.mp4").closest("a")?.getAttribute("download")).toBe("Video SAKU AI.mp4");
  });

  it("shows the created division in the sidebar and opens its chat", async () => {
    mocks.employeeContext = { agent: { id: 99, name: "Naya", roleTitle: "Lead Procurement", skillsText: JSON.stringify(["Vendor", "Negosiasi"]), dataAccessText: JSON.stringify(["Vendor", "Purchase order"]), status: "online" }, memories: [{ memory: "Lead time vendor penting." }], pipelines: [{ stepsText: JSON.stringify(["Brief", "Cari vendor", "PO"]) }], automations: [{ name: "Alert harga vendor" }] };
    mocks.replyMutate.mockImplementation((_input: unknown, options: { onSuccess: (response: unknown) => void }) => {
      options.onSuccess({
        content: "Sudah aku buatkan Tim Procurement. Timnya langsung muncul di daftar divisi ya, Kak.",
        senderName: "Dita",
        senderRole: "Asisten Pribadi",
        toolResults: [{
          toolName: "create_division",
          success: true,
          division: {
            id: 31,
            channelId: "custom-31-procurement",
            name: "Tim Procurement",
            businessArea: "procurement",
            description: "Mengurus pembelian dan hubungan supplier.",
            avatarClass: "bg-[#e5e9f6] text-[#5e6a9e]",
          },
        }],
      });
    });

    render(<Home />);
    fireEvent.change(screen.getByPlaceholderText("Tulis pesan ke Dita…"), { target: { value: "Tolong buatkan tim Procurement." } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim pesan" }));

    expect(await screen.findByText("Tim Procurement")).toBeTruthy();
    const newDivisionButton = screen.getByRole("button", { name: /Tim Procurement/ });
    fireEvent.click(newDivisionButton);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Naya · Lead Procurement" })).toBeTruthy());
    const strip = screen.getByTestId("agent-context-strip");
    expect(strip.textContent).toContain("Naya · Lead Procurement");
    expect(strip.textContent).toContain("AI employee aktif · Brief → Cari vendor → PO");
    expect(strip.textContent).toContain("Negosiasi");
    expect(screen.getByText(/Belum ada pesan di sini/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Buka info percakapan" }));
    expect(document.body.textContent).toContain("Memory kerja");
    expect(document.body.textContent).toContain("Vendor");
    expect(document.body.textContent).toContain("Cari vendor");
    expect(document.body.textContent).toContain("PO");
    expect(document.body.textContent).toContain("Alert harga vendor");
    expect(document.body.textContent).toContain("Workspace: 5 divisi · 8 dokumen · 6 automasi · 5 pipeline");
    const callsBeforeReselect = mocks.employeeContextCalls;
    fireEvent.click(screen.getByRole("button", { name: /Ruang kerja/ }));
    fireEvent.click(screen.getByRole("button", { name: /Tim Procurement/ }));
    await waitFor(() => expect(screen.getByTestId("agent-context-strip").textContent).toContain("Naya · Lead Procurement"));
    expect(mocks.employeeContextCalls).toBeGreaterThan(callsBeforeReselect);
    expect(mocks.employeeContextArgs.some((input) => (input as { channelId?: string }).channelId === "custom-31-procurement")).toBe(true);
  });

  it("prepares an AI starter workspace from the onboarding interview", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Buka menu" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Mulai onboarding" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Mulai wawancara" }));
    fireEvent.change(screen.getByPlaceholderText("Contoh: Toko Rona"), { target: { value: "Toko Rona" } });
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    fireEvent.change(screen.getByPlaceholderText(/Kami menjual skincare/), { target: { value: "Kami menjual skincare lokal lewat Instagram dan marketplace." } });
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    fireEvent.change(screen.getByPlaceholderText(/Perempuan usia/), { target: { value: "Perempuan usia 25 sampai 40 tahun." } });
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    fireEvent.click(screen.getByRole("button", { name: "Marketing" }));
    fireEvent.change(screen.getByPlaceholderText(/Saya sering lupa follow-up/), { target: { value: "Saya sering lupa follow-up calon pelanggan." } });
    fireEvent.click(screen.getByRole("button", { name: "Siapkan workspace-ku" }));

    await waitFor(() => expect(mocks.onboardingPrepareMutate).toHaveBeenCalledWith({ businessName: "Toko Rona", businessDescription: "Kami menjual skincare lokal lewat Instagram dan marketplace.", customer: "Perempuan usia 25 sampai 40 tahun.", biggestChallenge: "Saya sering lupa follow-up calon pelanggan.", priorities: ["Penjualan", "Marketing"] }));
    expect(screen.queryByText("Wawancara ringan bersama Dita")).toBeNull();
  });
});
