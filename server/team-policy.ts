export type TeamCapability =
  | "workspace_read"
  | "pipeline_write"
  | "automation_write"
  | "finance_write"
  | "finance_report"
  | "design_generate"
  | "crm_write"
  | "inventory_write";

export type TeamPolicy = {
  channelId: string;
  teamKey: string;
  label: string;
  capabilities: readonly TeamCapability[];
  allowedToolNames: readonly string[];
};

const READ_ONLY_TOOLS = ["list_divisions", "list_automations"] as const;

const POLICY_BY_TEAM: Record<string, Omit<TeamPolicy, "channelId">> = {
  assistant: {
    teamKey: "assistant",
    label: "Tim Utama",
    capabilities: ["workspace_read"],
    allowedToolNames: READ_ONLY_TOOLS,
  },
  sales: {
    teamKey: "sales",
    label: "Tim Sales",
    capabilities: ["workspace_read", "pipeline_write", "automation_write", "crm_write"],
    allowedToolNames: ["list_automations", "advance_pipeline", "create_automation"],
  },
  marketing: {
    teamKey: "marketing",
    label: "Tim Marketing / Design",
    capabilities: ["workspace_read", "pipeline_write", "automation_write", "design_generate"],
    allowedToolNames: ["list_automations", "advance_pipeline", "create_automation", "generate_image", "generate_video", "generate_voice_note", "generate_content_package"],
  },
  finance: {
    teamKey: "finance",
    label: "Tim Finance",
    capabilities: ["workspace_read", "pipeline_write", "automation_write", "finance_write", "finance_report"],
    allowedToolNames: ["list_automations", "advance_pipeline", "create_automation", "record_finance_transaction", "export_finance_report"],
  },
  operations: {
    teamKey: "operations",
    label: "Tim Operasional",
    capabilities: ["workspace_read", "pipeline_write", "automation_write", "inventory_write"],
    allowedToolNames: ["list_automations", "advance_pipeline", "create_automation"],
  },
};

function normalizeTeamKey(value: string | undefined): string {
  const normalized = (value || "").trim().toLowerCase();
  if (POLICY_BY_TEAM[normalized]) return normalized;
  if (/(finance|keuangan|accounting|akuntansi|pembukuan)/.test(normalized)) return "finance";
  if (/(marketing|design|desain|creative|konten|content)/.test(normalized)) return "marketing";
  if (/(sales|penjualan|commercial|crm)/.test(normalized)) return "sales";
  if (/(operation|operasional|inventory|stok|procurement|produksi)/.test(normalized)) return "operations";
  return "assistant";
}

export function resolveTeamPolicy(channelId: string, businessArea?: string): TeamPolicy {
  const teamKey = normalizeTeamKey(channelId === "assistant" ? "assistant" : businessArea || channelId);
  const policy = POLICY_BY_TEAM[teamKey] || POLICY_BY_TEAM.assistant;
  return { channelId, ...policy };
}

export function isToolAllowed(policy: TeamPolicy, toolName: string): boolean {
  return policy.allowedToolNames.includes(toolName);
}

export function assertToolAllowed(policy: TeamPolicy, toolName: string): void {
  if (!isToolAllowed(policy, toolName)) {
    throw new Error(`${policy.label} tidak memiliki kewenangan untuk menjalankan ${toolName}. Minta pemilik meneruskan pekerjaan ini ke tim yang tepat.`);
  }
}

export function capabilityDescription(policy: TeamPolicy): string {
  const descriptions: Record<TeamCapability, string> = {
    workspace_read: "membaca konteks workspace yang diperlukan",
    pipeline_write: "memajukan pipeline pekerjaannya sendiri",
    automation_write: "membuat automasi untuk pekerjaannya sendiri",
    finance_write: "mencatat transaksi finance",
    finance_report: "membuat atau mengekspor laporan finance",
    design_generate: "membuat aset visual dan konten marketing",
    crm_write: "mengelola aktivitas CRM",
    inventory_write: "mengelola stok dan operasional inventory",
  };
  return policy.capabilities.map((capability) => descriptions[capability]).join(", ");
}

export function scopedDataAccess(policy: TeamPolicy): string[] {
  const accessByTeam: Record<string, string[]> = {
    assistant: ["Ringkasan workspace", "Daftar tim dan status umum"],
    sales: ["CRM", "Pipeline sales", "Dokumen penjualan"],
    marketing: ["Brief marketing", "Aset design", "Konten dan campaign"],
    finance: ["Jurnal finance", "Laporan finance", "Mutasi dan piutang"],
    operations: ["Inventory", "Order dan produksi", "SOP operasional"],
  };
  return accessByTeam[policy.teamKey] || accessByTeam.assistant;
}
