import React from "react";
import { ExternalLink, FileSpreadsheet, Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const templates = [
  { id: "receivables" as const, label: "Laporan piutang" },
  { id: "bank_mutations" as const, label: "Laporan mutasi bank" },
  { id: "workspace_summary" as const, label: "Ringkasan workspace" },
];

export default function GoogleSheetsIntegrationCard() {
  const status = trpc.workspace.integrations.googleSheetsStatus.useQuery();
  const exportMutation = trpc.workspace.integrations.exportReport.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.title} berhasil diperbarui di Google Sheets.`);
      window.open(result.url, "_blank", "noopener,noreferrer");
      void status.refetch();
    },
    onError: (error) => toast.error(error.message || "Laporan belum bisa diekspor ke Google Sheets."),
  });

  const connect = () => {
    window.location.assign("/api/integrations/google-sheets/start");
  };

  return <section className="settings-card" data-testid="google-sheets-integration-card">
    <div className="settings-card-heading">
      <span className="settings-card-icon bg-[#e9e5f8] text-[#6b5aa5]"><FileSpreadsheet className="h-4 w-4" /></span>
      <div><h2>Google Sheets</h2><p>Ekspor laporan finance tanpa menumpuk data lama</p></div>
    </div>
    <div className="rounded-xl border border-[#e1dff0] bg-[#fbfaff] p-3">
      <p className="text-[11px] leading-5 text-[#6d6686]">SAKU membuat satu spreadsheet per jenis laporan, lalu memperbarui isinya setiap kali kamu ekspor.</p>
      {!status.data?.connected ? <button type="button" onClick={connect} className="primary-button mt-3 w-full justify-center text-[11px]"><Link2 className="h-4 w-4" /> Hubungkan Google Sheets</button> : <>
        <p role="status" className="mt-3 rounded-lg bg-[#f0faf5] px-3 py-2 text-[10px] font-semibold text-[#2b836b]">Google Sheets terhubung dan siap menerima laporan.</p>
        <div className="mt-3 grid gap-2">
          {templates.map((template) => {
            const spreadsheetId = status.data?.spreadsheetIds?.[template.id];
            return <div key={template.id} className="flex items-center gap-2 rounded-lg border border-[#e5e1f0] bg-white px-2.5 py-2">
              <span className="min-w-0 flex-1 text-[10px] font-semibold text-[#554d70]">{template.label}</span>
              {spreadsheetId && <a href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`} target="_blank" rel="noreferrer" aria-label={`Buka ${template.label}`} className="text-[#6b5aa5]"><ExternalLink className="h-3.5 w-3.5" /></a>}
              <button type="button" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate({ templateId: template.id })} className="rounded-lg bg-[#6b5aa5] px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">
                {exportMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Ekspor"}
              </button>
            </div>;
          })}
        </div>
      </>}
    </div>
  </section>;
}
