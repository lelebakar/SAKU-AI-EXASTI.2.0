import { Building2, Check, Loader2, LogOut, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type PendingInvitation = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "member";
  businessName: string | null;
  createdAt: Date;
};

export function PendingInvitationScreen({ invitations }: { invitations: PendingInvitation[] }) {
  const { logout } = useAuth();
  const utils = trpc.useUtils();
  const acceptMutation = trpc.workspace.invitations.accept.useMutation({
    onSuccess: async (result) => {
      await utils.workspace.invitations.pending.invalidate();
      await utils.auth.me.invalidate();
      toast.success(`Kamu bergabung ke ${result.businessName || "workspace"}.`);
      window.location.reload();
    },
    onError: (error) => toast.error(error.message || "Undangan belum bisa diterima."),
  });

  return <main className="min-h-screen bg-[#f5faf7] px-4 py-10 text-[#2b3d37]">
    <section className="mx-auto max-w-xl rounded-[28px] border border-[#dfede6] bg-white p-6 shadow-[0_18px_60px_rgba(47,91,72,0.10)] sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#dff4eb] text-[#2b8b73]"><Mail className="h-5 w-5" /></span>
        <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6b9a89]">Undangan workspace</p><h1 className="mt-1 font-display text-2xl font-bold tracking-[-0.04em]">Kamu diundang ke tim.</h1><p className="mt-2 text-sm leading-6 text-[#71847a]">Masuk dengan akun <strong>{invitations[0]?.email}</strong>, lalu pilih workspace yang ingin kamu gunakan.</p></div>
      </div>
      <div className="mt-6 grid gap-3">
        {invitations.map((invitation) => <article key={invitation.id} className="rounded-2xl border border-[#e2eee8] bg-[#fbfefc] p-4">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eaf2fb] text-[#5276a2]"><Building2 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-bold text-[#34433e]">{invitation.businessName || "Workspace bisnis"}</h2><p className="mt-1 text-xs text-[#809089]">Diundang sebagai <strong>{invitation.role === "admin" ? "Admin" : "Member"}</strong> · untuk {invitation.name}</p></div></div>
          <button type="button" onClick={() => acceptMutation.mutate({ id: invitation.id })} disabled={acceptMutation.isPending} className="primary-button mt-4 w-full justify-center">{acceptMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Mengaktifkan akses…</> : <><Check className="h-4 w-4" /> Terima dan masuk workspace</>}</button>
        </article>)}
      </div>
      <div className="mt-5 flex items-start gap-2 rounded-xl bg-[#f4faf6] px-3 py-2.5 text-[11px] leading-5 text-[#668078]"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2b8b73]" /><p>Akses hanya bisa diklaim oleh akun dengan alamat email yang sama dengan undangan.</p></div>
      <button type="button" onClick={() => void logout()} className="mt-5 flex w-full items-center justify-center gap-2 text-xs font-semibold text-[#8a9891] hover:text-[#2b8b73]"><LogOut className="h-3.5 w-3.5" /> Keluar dan gunakan akun lain</button>
    </section>
  </main>;
}
