import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type SecretFieldProps = {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  autoComplete: string;
};

function SecretField({ label, hint, value, placeholder, onChange, autoComplete }: SecretFieldProps) {
  const [visible, setVisible] = useState(false);
  return <label className="settings-field block w-full">
    <span>{label}</span>
    <div className="soft-input-row">
      <KeyRound className="h-4 w-4 shrink-0 text-[#8ba39a]" />
      <input aria-label={label} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} className="min-w-0 flex-1 bg-transparent text-[12px] font-semibold text-[#40564d] outline-none placeholder:text-[#a4afaa]" />
      <button type="button" aria-label={visible ? `Sembunyikan ${label}` : `Tampilkan ${label}`} onClick={() => setVisible((current) => !current)} className="rounded-md p-1 text-[#8fa19a] transition hover:bg-[#edf5f0] hover:text-[#2d856d]">
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
    <small className="mt-1.5 block text-[10px] leading-4 text-[#8b9992]">{hint}</small>
  </label>;
}

export default function MootaIntegrationCard() {
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const connectMutation = trpc.workspace.integrations.connectMoota.useMutation({
    onSuccess: () => {
      setApiKey("");
      setWebhookSecret("");
      setSaved(true);
      toast.success("Credential Moota berhasil disimpan dengan aman.");
    },
    onError: (error) => {
      setSaved(false);
      toast.error(error.message || "Credential Moota belum bisa disimpan.");
    },
  });
  const canSave = apiKey.trim().length >= 8 && webhookSecret.trim().length >= 8;
  return <section className="settings-card" data-testid="moota-integration-card">
    <div className="settings-card-heading">
      <span className="settings-card-icon bg-[#e1f2ec] text-[#2a876f]"><ShieldCheck className="h-4 w-4" /></span>
      <div><h2>Hubungkan Moota</h2><p>Tarik mutasi bank atau e-wallet untuk rekonsiliasi otomatis</p></div>
    </div>
    <div className="rounded-xl border border-[#dfece5] bg-[#fbfefc] p-3">
      <div className="flex items-start gap-2.5 rounded-lg bg-[#f0faf5] px-3 py-2.5 text-[10px] leading-4 text-[#5f8175]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#2d856d]" />
        <p>Credential dikirim langsung ke server dan disimpan dalam bentuk terenkripsi. SAKU tidak terhubung langsung ke bank.</p>
      </div>
      <div className="mt-3 grid gap-3">
        <SecretField label="Moota API key / access token" hint="Ambil dari aplikasi atau API settings di Moota." value={apiKey} placeholder="Masukkan credential Moota" onChange={setApiKey} autoComplete="off" />
        <SecretField label="Webhook secret atau token" hint="Gunakan secret/token yang dipakai Moota untuk header Signature webhook." value={webhookSecret} placeholder="Masukkan secret webhook" onChange={setWebhookSecret} autoComplete="off" />
      </div>
      <button type="button" disabled={!canSave || connectMutation.isPending} onClick={() => connectMutation.mutate({ apiKey: apiKey.trim(), webhookSecret: webhookSecret.trim() })} className="primary-button mt-3 w-full justify-center text-[11px] disabled:cursor-not-allowed disabled:opacity-50">
        {connectMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan dengan aman…</> : <><KeyRound className="h-4 w-4" /> Simpan dan aktifkan Moota</>}
      </button>
      {saved && <p role="status" className="mt-2 rounded-lg bg-[#f0faf5] px-3 py-2 text-[10px] font-semibold text-[#2b836b]">Moota aktif. Credential tidak ditampilkan kembali demi keamanan.</p>}
    </div>
  </section>;
}
