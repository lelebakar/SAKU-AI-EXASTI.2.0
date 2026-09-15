import React, { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export default function PasswordSettingsCard() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const mutation = trpc.auth.changePassword.useMutation({ onSuccess: () => { setCurrentPassword(""); setNewPassword(""); toast.success("Password berhasil diubah."); }, onError: (error) => toast.error(error.message || "Password belum bisa diubah.") });
  const hasPassword = Boolean(user?.hasPassword);
  return <section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon bg-[#e8eef8] text-[#5e75a7]"><KeyRound className="h-4 w-4" /></span><div><h2>Keamanan akun</h2><p>{hasPassword ? "Kelola password email dan akses akunmu" : "Tambahkan password untuk login tanpa akun sosial"}</p></div></div><div className="rounded-xl bg-[#f6faf8] p-3"><p className="flex items-start gap-2 text-[11px] leading-5 text-[#71837a]"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2b8b73]" /> Gunakan minimal 8 karakter dengan huruf besar, huruf kecil, dan angka.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{hasPassword && <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Password saat ini" className="soft-input" />}<input type="password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={hasPassword ? "Password baru" : "Buat password"} className="soft-input" /></div><button type="button" disabled={mutation.isPending || (hasPassword && !currentPassword) || newPassword.length < 8} onClick={() => mutation.mutate({ currentPassword: currentPassword || undefined, newPassword })} className="primary-button mt-3 justify-center text-[11px]">{mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…</> : hasPassword ? "Ubah password" : "Tambahkan password"}</button></div></section>;
}
