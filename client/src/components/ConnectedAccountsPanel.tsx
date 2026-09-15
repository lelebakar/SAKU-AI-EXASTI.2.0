import React from "react";
import { AtSign, CheckCircle2, ExternalLink, FileSpreadsheet, Instagram, Link2, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Account = { id: string; name: string; detail: string; icon: typeof Mail; tone: string; status: "ready" | "planned"; action?: string };

const plannedAccounts: Account[] = [
  { id: "instagram", name: "Instagram Business", detail: "Siapkan publikasi konten dan insight akun bisnis.", icon: Instagram, tone: "bg-[#fbe8ef] text-[#c44e78]", status: "planned", action: "Butuh Meta App" },
  { id: "facebook", name: "Facebook Page", detail: "Kelola konten halaman bisnis dari satu workspace.", icon: MessageCircle, tone: "bg-[#e6efff] text-[#4775c2]", status: "planned", action: "Butuh Meta App" },
  { id: "x", name: "X / Twitter", detail: "Siapkan draft dan publikasi untuk akun X.", icon: AtSign, tone: "bg-[#edf1f3] text-[#2f3a40]", status: "planned", action: "Butuh X Developer" },
];

export default function ConnectedAccountsPanel() {
  const sheets = trpc.workspace.integrations.googleSheetsStatus.useQuery();
  const connectSheets = () => window.location.assign("/api/integrations/google-sheets/start");
  const accounts: Account[] = [
    { id: "gmail", name: "Gmail", detail: "Baca konteks email bisnis sesuai izin yang kamu berikan.", icon: Mail, tone: "bg-[#fde9e7] text-[#c5544c]", status: "planned", action: "Segera tersedia" },
    { id: "sheets", name: "Google Sheets", detail: "Ekspor laporan dan sinkronkan data finance workspace.", icon: FileSpreadsheet, tone: "bg-[#e7f5eb] text-[#32805e]", status: sheets.data?.connected ? "ready" : "planned", action: sheets.data?.connected ? "Terhubung" : "Hubungkan" },
    ...plannedAccounts,
  ];

  return <section className="settings-card connected-accounts-card" data-testid="connected-accounts-panel" aria-labelledby="connected-accounts-title">
    <div className="settings-card-heading"><span className="settings-card-icon bg-[#e8eef8] text-[#5272a9]"><Link2 className="h-4 w-4" /></span><div><h2 id="connected-accounts-title">Akun & koneksi</h2><p>Kelola layanan yang boleh bekerja bersama SAKU.</p></div></div>
    <div className="connected-accounts-notice"><ShieldCheck className="h-4 w-4" /><span>Izin tetap berada di layanan asal. SAKU hanya memakai akses yang kamu setujui dan tidak menampilkan rahasia akun.</span></div>
    <div className="connected-accounts-grid">{accounts.map((account) => { const Icon = account.icon; const ready = account.id === "sheets" && sheets.data?.connected; return <article className="connected-account-row" key={account.id}><span className={`settings-card-icon ${account.tone}`}><Icon className="h-4 w-4" /></span><div className="connected-account-copy"><strong>{account.name}</strong><span>{account.detail}</span></div>{ready ? <span className="connected-status connected-status-ready"><CheckCircle2 className="h-3.5 w-3.5" /> Terhubung</span> : account.id === "sheets" ? <button type="button" className="secondary-button" onClick={connectSheets} disabled={sheets.isFetching}><Link2 className="h-3.5 w-3.5" /> Hubungkan</button> : <button type="button" className="connected-status connected-status-planned" onClick={() => toast.info(`${account.name} memerlukan konfigurasi developer sebelum bisa dihubungkan.`)}>{account.action} <ExternalLink className="h-3 w-3" /></button>}</article>; })}</div>
    <p className="connected-accounts-footnote">Gmail, Instagram, Facebook, dan X akan aktif setelah kredensial OAuth/API masing-masing dikonfigurasi. Tidak ada akun sosial yang dianggap terhubung sebelum proses izin selesai.</p>
  </section>;
}
