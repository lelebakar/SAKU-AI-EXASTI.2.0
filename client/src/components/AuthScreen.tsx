import React, { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, Chrome, Eye, EyeOff, Facebook, Instagram, KeyRound, Loader2, Mail, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type AuthMode = "login" | "register";
type Provider = "google" | "facebook" | "instagram" | null;
type AuthView = "auth" | "forgot" | "reset";

function PasswordField({ value, onChange, placeholder, label, show, onToggle, autoComplete, error }: { value: string; onChange: (value: string) => void; placeholder: string; label: string; show: boolean; onToggle: () => void; autoComplete: string; error?: boolean }) {
  return <label className="relative block">
    <span className="sr-only">{label}</span>
    <KeyRound className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${error ? "text-[#c96d58]" : "text-[#8da198]"}`} />
    <input required minLength={8} type={show ? "text" : "password"} value={value} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-invalid={error || undefined} className={`soft-input w-full pl-10 pr-10 ${error ? "border-[#e7b7aa] ring-2 ring-[#fff0eb]" : ""}`} />
    <button type="button" aria-label={show ? "Sembunyikan password" : "Tampilkan password"} onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[#8da198] transition hover:bg-[#edf7f1] hover:text-[#2b836b]">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
  </label>;
}

export default function AuthScreen({ onOAuthLogin, loading, error }: { onOAuthLogin: () => void; loading: boolean; error: unknown }) {
  const initialResetToken = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("reset") || "";
  const [view, setView] = useState<AuthView>(initialResetToken ? "reset" : "auth");
  const [resetToken] = useState(initialResetToken);
  const [authError, setAuthError] = useState("");
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<Provider>(null);
  const utils = trpc.useUtils();

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => { setAuthError(""); await utils.auth.me.invalidate(); toast.success("Akun berhasil dibuat. Selamat datang di SAKU."); },
    onError: (mutationError) => { setAuthError(mutationError.message || "Akun belum bisa dibuat."); toast.error(mutationError.message || "Akun belum bisa dibuat."); },
  });
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => { setAuthError(""); await utils.auth.me.invalidate(); toast.success("Berhasil masuk ke workspace SAKU."); },
    onError: (mutationError) => { setAuthError(mutationError.message || "Login belum berhasil."); toast.error(mutationError.message || "Login belum berhasil."); },
  });
  const forgotMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => { setAuthError(""); toast.success("Jika akun ditemukan, link reset password akan dikirim ke emailmu."); setView("auth"); },
    onError: (mutationError) => { setAuthError(mutationError.message || "Link reset password belum bisa dikirim."); toast.error(mutationError.message || "Link reset password belum bisa dikirim."); },
  });
  const resetMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => { setAuthError(""); if (typeof window !== "undefined") window.history.replaceState({}, "", window.location.pathname); setMode("login"); setPassword(""); setView("auth"); toast.success("Password berhasil direset. Silakan masuk dengan password baru."); },
    onError: (mutationError) => { setAuthError(mutationError.message || "Password belum bisa direset."); toast.error(mutationError.message || "Password belum bisa direset."); },
  });
  const pending = loading || registerMutation.isPending || loginMutation.isPending || forgotMutation.isPending || resetMutation.isPending || pendingProvider !== null;
  const passwordRules = useMemo(() => ({ length: password.length >= 8, mixed: /[a-z]/.test(password) && /[A-Z]/.test(password), number: /\d/.test(password) }), [password]);
  const passwordMismatch = mode === "register" && confirmPassword.length > 0 && password !== confirmPassword;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "register") {
      if (password !== confirmPassword) { toast.error("Konfirmasi password belum sama."); return; }
      registerMutation.mutate({ name: name.trim(), email: email.trim(), password });
    } else loginMutation.mutate({ email: email.trim(), password });
  };
  const startProvider = async (provider: Exclude<Provider, null>, url: string, label: string) => {
    setPendingProvider(provider);
    try {
      const response = await fetch(url, { credentials: "include", redirect: "manual" });
      if (response.status === 503) {
        toast.error(`${label} belum dikonfigurasi. Pilih provider lain atau email.`);
        setPendingProvider(null);
        return;
      }
    } catch {
      // A manual redirect can appear as an opaque response in some browsers.
    }
    window.location.href = url;
  };
  const useGoogle = () => startProvider("google", `/api/auth/google/start?origin=${encodeURIComponent(window.location.origin)}`, "Google");
  const useFacebook = () => startProvider("facebook", `/api/auth/meta/facebook/start?origin=${encodeURIComponent(window.location.origin)}`, "Facebook");
  const useInstagram = () => startProvider("instagram", `/api/auth/meta/instagram/start?origin=${encodeURIComponent(window.location.origin)}`, "Instagram");
  const switchMode = (nextMode: AuthMode) => { setMode(nextMode); setPassword(""); setConfirmPassword(""); };
  const submitForgot = (event: FormEvent) => { event.preventDefault(); setAuthError(""); forgotMutation.mutate({ email: email.trim() }); };
  const submitReset = (event: FormEvent) => { event.preventDefault(); setAuthError(""); resetMutation.mutate({ token: resetToken, newPassword: password }); };

  if (view === "forgot") return <main className="saku-page flex items-center justify-center p-4 sm:p-8"><section className="w-full max-w-[480px] rounded-[30px] border border-[#dcebe3] bg-white/95 p-7 shadow-[0_28px_90px_rgba(48,107,86,0.14)] sm:p-10"><div className="flex items-center gap-3"><span className="brand-mark">S</span><div><strong className="block text-[13px] tracking-[0.24em] text-[#345249]">SAKU</strong><small className="block text-[10px] uppercase tracking-[0.16em] text-[#83a096]">AI workspace</small></div></div><div className="mt-10"><p className="eyebrow">Pulihkan akses</p><h1 className="mt-3 font-display text-[34px] font-bold tracking-[-0.06em] text-[#2b3d37]">Lupa password?</h1><p className="mt-3 text-[13px] leading-6 text-[#7a8983]">Masukkan email akunmu. Kami akan mengirim link untuk membuat password baru. Link berlaku selama 30 menit.</p><form onSubmit={submitForgot} className="mt-7 space-y-3"><label className="relative block"><span className="sr-only">Email akun</span><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8da198]" /><input required type="email" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" className="soft-input w-full pl-10" /></label><button type="submit" disabled={pending} className="primary-button w-full justify-center">{forgotMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Mengirim link…</> : <>Kirim link reset <ArrowRight className="h-4 w-4" /></>}</button></form>{authError && <p role="alert" className="mt-4 rounded-xl bg-[#fff5f0] px-3 py-2 text-[11px] leading-5 text-[#a45f45]">{authError}</p>}<button type="button" onClick={() => { setAuthError(""); setView("auth"); }} className="mt-5 text-[11px] font-bold text-[#2b836b] hover:underline">← Kembali ke login</button></div></section></main>;

  if (view === "reset") return <main className="saku-page flex items-center justify-center p-4 sm:p-8"><section className="w-full max-w-[480px] rounded-[30px] border border-[#dcebe3] bg-white/95 p-7 shadow-[0_28px_90px_rgba(48,107,86,0.14)] sm:p-10"><div className="flex items-center gap-3"><span className="brand-mark">S</span><div><strong className="block text-[13px] tracking-[0.24em] text-[#345249]">SAKU</strong><small className="block text-[10px] uppercase tracking-[0.16em] text-[#83a096]">AI workspace</small></div></div><div className="mt-10"><p className="eyebrow">Password baru</p><h1 className="mt-3 font-display text-[34px] font-bold tracking-[-0.06em] text-[#2b3d37]">Buat password baru.</h1><p className="mt-3 text-[13px] leading-6 text-[#7a8983]">Gunakan minimal 8 karakter, dengan huruf besar, huruf kecil, dan angka. Link reset hanya bisa digunakan satu kali.</p><form onSubmit={submitReset} className="mt-7 space-y-3"><PasswordField value={password} onChange={setPassword} placeholder="Password baru" label="Password baru" show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="new-password" /><PasswordField value={confirmPassword} onChange={setConfirmPassword} placeholder="Ulangi password baru" label="Konfirmasi password baru" show={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} autoComplete="new-password" error={confirmPassword.length > 0 && password !== confirmPassword} />{confirmPassword.length > 0 && password !== confirmPassword && <p role="alert" className="text-[10px] text-[#b56651]">Konfirmasi password belum sama.</p>}<button type="submit" disabled={pending || password.length < 8 || password !== confirmPassword} className="primary-button w-full justify-center">{resetMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…</> : <>Simpan password baru <ArrowRight className="h-4 w-4" /></>}</button></form>{authError && <p role="alert" className="mt-4 rounded-xl bg-[#fff5f0] px-3 py-2 text-[11px] leading-5 text-[#a45f45]">{authError}</p>}</div></section></main>;

  return <main className="saku-page flex items-center justify-center p-4 sm:p-8">
    <section className="w-full max-w-6xl overflow-hidden rounded-[34px] border border-[#dcebe3] bg-white/95 shadow-[0_28px_90px_rgba(48,107,86,0.14)]">
      <div className="grid min-h-[680px] lg:grid-cols-[1.02fr_0.98fr]">
        <div className="relative overflow-hidden bg-[#eef8f2] px-7 py-9 sm:px-12 sm:py-14">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#cdebdc]/70 blur-2xl" />
          <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[#f5dfc9]/55 blur-3xl" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-3"><span className="brand-mark">S</span><span><strong className="block text-[13px] tracking-[0.24em] text-[#345249]">SAKU</strong><small className="block text-[10px] uppercase tracking-[0.16em] text-[#83a096]">AI workspace</small></span></div>
            <div className="mt-auto max-w-xl pb-3 pt-20 lg:pt-24"><p className="eyebrow">Ruang kerja untuk melihat pekerjaan dengan lebih jelas</p><h1 className="mt-4 font-display text-[42px] font-bold leading-[0.98] tracking-[-0.07em] text-[#273b34] sm:text-[60px]">Pekerjaan lebih jelas, satu ruang untuk mengaturnya.</h1><p className="mt-6 max-w-lg text-[15px] leading-7 text-[#6c8177]">Satu tempat untuk menyimpan konteks bisnis, pekerjaan tim, dokumen, dan percakapan—tetap privat.</p><div className="mt-9 grid gap-3 text-[11px] font-semibold text-[#55766a] sm:grid-cols-2"><span className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2.5"><Check className="h-4 w-4 text-[#2b8b73]" /> Workspace privat</span><span className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2.5"><Check className="h-4 w-4 text-[#2b8b73]" /> Google, Facebook, Instagram</span><span className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2.5"><Check className="h-4 w-4 text-[#2b8b73]" /> Email & password custom</span><span className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2.5"><Check className="h-4 w-4 text-[#2b8b73]" /> Dibuat untuk bisnis yang sedang tumbuh</span></div></div>
          </div>
        </div>
        <div className="flex flex-col justify-center px-6 py-9 sm:px-12 sm:py-12"><div className="mx-auto w-full max-w-[410px]">
          <div className="mb-5 flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d8efe6] text-[#1c806b]"><Sparkles className="h-6 w-6" /></span><div><p className="eyebrow">Akses workspace</p><p className="mt-1 text-[11px] font-medium text-[#8c9a94]">Masuk dengan akun yang kamu pilih</p></div></div>
          <div className="mb-6"><div className="flex gap-1 rounded-2xl bg-[#f1f7f3] p-1" role="tablist" aria-label="Jenis akses"><button type="button" role="tab" aria-selected={mode === "login"} onClick={() => switchMode("login")} className={`flex-1 rounded-xl px-3 py-2.5 text-[11px] font-bold transition ${mode === "login" ? "bg-white text-[#2b836b] shadow-sm" : "text-[#7b9187] hover:text-[#2b836b]"}`}>Masuk</button><button type="button" role="tab" aria-selected={mode === "register"} onClick={() => switchMode("register")} className={`flex-1 rounded-xl px-3 py-2.5 text-[11px] font-bold transition ${mode === "register" ? "bg-white text-[#2b836b] shadow-sm" : "text-[#7b9187] hover:text-[#2b836b]"}`}>Buat akun</button></div></div>
          <h2 className="font-display text-[31px] font-bold leading-tight tracking-[-0.06em] text-[#2b3d37]">{mode === "login" ? "Masuk ke workspace." : "Buat akun."}</h2><p className="mt-3 text-[13px] leading-6 text-[#7a8983]">{mode === "login" ? "Pilih Google, Facebook, Instagram, atau email dan password." : "Buat akun dengan metode yang kamu pilih. Kamu bisa menambahkan password nanti dari pengaturan."}</p>
          <div className="mt-6 grid gap-2 sm:grid-cols-3"><button type="button" onClick={useGoogle} disabled={pending} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#d9e7df] bg-white px-2 text-[11px] font-bold text-[#38564b] transition hover:bg-[#f2faf5] disabled:opacity-60"><Chrome className="h-4 w-4 text-[#d9684d]" />{pendingProvider === "google" ? "Menyiapkan…" : "Google"}</button><button type="button" onClick={useFacebook} disabled={pending} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#d9e7df] bg-white px-2 text-[11px] font-bold text-[#38564b] transition hover:bg-[#f2faf5] disabled:opacity-60"><Facebook className="h-4 w-4 text-[#4267b2]" />{pendingProvider === "facebook" ? "Menyiapkan…" : "Facebook"}</button><button type="button" onClick={useInstagram} disabled={pending} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#d9e7df] bg-white px-2 text-[11px] font-bold text-[#38564b] transition hover:bg-[#f2faf5] disabled:opacity-60"><Instagram className="h-4 w-4 text-[#c13584]" />{pendingProvider === "instagram" ? "Menyiapkan…" : "Instagram"}</button></div>
          <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a0aaa5]"><span className="h-px flex-1 bg-[#e5eee8]" /> atau email <span className="h-px flex-1 bg-[#e5eee8]" /></div>
          <form onSubmit={submit} className="space-y-3" noValidate>{mode === "register" && <label className="relative block"><span className="sr-only">Nama lengkap</span><UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8da198]" /><input required value={name} autoComplete="name" onChange={(event) => setName(event.target.value)} placeholder="Nama lengkap" className="soft-input w-full pl-10" /></label>}<label className="relative block"><span className="sr-only">Email</span><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8da198]" /><input required type="email" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" className="soft-input w-full pl-10" /></label><PasswordField value={password} onChange={setPassword} placeholder={mode === "register" ? "Password min. 8 karakter" : "Password"} label="Password" show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete={mode === "register" ? "new-password" : "current-password"} error={passwordMismatch} />{mode === "register" && <><PasswordField value={confirmPassword} onChange={setConfirmPassword} placeholder="Ulangi password" label="Konfirmasi password" show={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} autoComplete="new-password" error={passwordMismatch} /><div className="rounded-xl bg-[#f6faf8] px-3 py-2.5 text-[10px] text-[#75877e]"><div className="mb-2 font-semibold text-[#55766a]">Password aman punya:</div><div className="grid grid-cols-3 gap-2">{[[passwordRules.length, "8+ karakter"], [passwordRules.mixed, "Huruf besar/kecil"], [passwordRules.number, "Angka"]].map(([valid, label]) => <span key={String(label)} className={`flex items-center gap-1 ${valid ? "text-[#2b8b73]" : "text-[#9aa8a1]"}`}><span className={`flex h-4 w-4 items-center justify-center rounded-full ${valid ? "bg-[#d8efe6]" : "bg-[#e7eee9]"}`}>{valid ? "✓" : "·"}</span>{label}</span>)}</div></div></>}{passwordMismatch && <p role="alert" className="text-[10px] text-[#b56651]">Konfirmasi password belum sama.</p>}<button type="submit" disabled={pending} className="primary-button mt-2 w-full justify-center">{registerMutation.isPending || loginMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Memproses…</> : <>{mode === "login" ? "Masuk dengan email" : "Buat akun email"}<ArrowRight className="h-4 w-4" /></>}</button></form>
          {mode === "login" && <button type="button" onClick={() => { setAuthError(""); setView("forgot"); }} className="mt-3 w-full text-center text-[11px] font-bold text-[#2b836b] hover:underline">Lupa password?</button>}
          {authError && <p role="alert" className="mt-4 rounded-xl bg-[#fff5f0] px-3 py-2 text-[11px] leading-5 text-[#a45f45]">{authError}</p>}
          {Boolean(error) && <p role="alert" className="mt-4 rounded-xl bg-[#fff5f0] px-3 py-2 text-[11px] leading-5 text-[#a45f45]">Sesi belum ditemukan. Pilih metode masuk di atas untuk melanjutkan.</p>}
          <p className="mt-5 flex items-start gap-2 text-[11px] leading-5 text-[#91a09a]"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3b9a7d]" /> Akun Google, Facebook, Instagram, dan email dengan alamat yang sama akan disatukan ke workspace yang sama. Password disimpan dalam bentuk hash.</p>
        </div></div>
      </div>
    </section>
  </main>;
}
