import React from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowLeft,
  Archive,
  Activity,
  Bell,
  BellOff,
  Banknote,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Download,
  FileText,
  FolderOpen,
  Grid2X2,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  Link2,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Package,
  PenLine,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import MootaIntegrationCard from "@/components/MootaIntegrationCard";
import GoogleSheetsIntegrationCard from "@/components/GoogleSheetsIntegrationCard";
import ConnectedAccountsPanel from "@/components/ConnectedAccountsPanel";
import AuthScreen from "@/components/AuthScreen";
import PasswordSettingsCard from "@/components/PasswordSettingsCard";
import FinanceReviewPage from "@/components/FinanceReviewPage";
import InventoryPage from "@/pages/InventoryPage";
import CrmPage from "@/pages/CrmPage";
import { PendingInvitationScreen } from "@/components/PendingInvitationScreen";

type ChannelId = string;
type MessageSender = "owner" | "agent" | "assistant";

type Attachment = {
  name: string;
  type: "pdf" | "image" | "video" | "audio" | "excel" | "word" | "other";
  size?: string;
  url?: string;
  extractionStatus?: "pending" | "complete" | "unsupported" | "failed";
  extractionPreview?: string;
  extractedText?: string;
  detectedKind?: string;
  understanding?: string;
};

type ChatMessage = {
  id: string;
  sender: MessageSender;
  senderName?: string;
  senderRole?: string;
  text?: string;
  time: string;
  attachment?: Attachment;
  contentPackage?: { caption: string; imageUrl?: string; platform: "instagram" | "twitter" | "general" };
  reactions?: string[];
  actionLabel?: string;
};

type AgentContext = { name: string; role: string; skills: string[]; memory: string[]; dataAccess: string[]; pipeline: string; automation: string; avatarClass?: string; currentStep?: number };

function WorkspaceGuide({ onStart, onOpenSettings, hasBusinessName }: { onStart: () => void; onOpenSettings: () => void; hasBusinessName: boolean }) {
  return <section className="workspace-guide" aria-label="Panduan singkat SAKU AI">
    <div className="workspace-guide-icon"><Sparkles className="h-4 w-4" /></div>
    <div className="min-w-0 flex-1"><strong>{hasBusinessName ? "Atur ruang kerja" : "Kenalkan bisnismu"}</strong><p>{hasBusinessName ? "Pilih tim dan tulis pekerjaan yang ingin dirapikan." : "Isi beberapa hal dasar. Setelah itu, kamu bisa langsung mulai dari chat."}</p><div className="guide-steps"><span className={hasBusinessName ? "guide-step-done" : "guide-step-active"}><b>1</b> Profil bisnis</span><span className={!hasBusinessName ? "" : "guide-step-active"}><b>2</b> Pekerjaan utama</span><span><b>3</b> Cek hasil</span></div></div>
    <button type="button" className="guide-action" onClick={hasBusinessName ? onOpenSettings : onStart}>{hasBusinessName ? "Buka pengaturan" : "Isi profil"}<ChevronRight className="h-4 w-4" /></button>
  </section>;
}

const AGENT_CONTEXT: Record<string, AgentContext> = {
  assistant: { name: "Dita", role: "Asisten Pribadi", skills: ["Ringkas", "Koordinasi", "Cari konteks"], memory: [], dataAccess: [], pipeline: "Belum ada alur aktif", automation: "Belum ada automasi" },
  sales: { name: "Raka", role: "Senior Sales", skills: ["Follow-up", "Kualifikasi lead", "Penawaran"], memory: ["Lead hangat wajib di-follow-up maksimal 24 jam."], dataAccess: ["CRM", "Pesanan", "Riwayat pelanggan"], pipeline: "Lead → Follow-up → Closing", automation: "Alert lead hangat" },
  marketing: { name: "Sari", role: "Content Strategist", skills: ["Copywriting", "Campaign", "Analitik"], memory: ["Brand Toko Rona harus terasa hangat, jujur, dan tidak berlebihan."], dataAccess: ["Campaign", "Kalender konten", "Performa"], pipeline: "Brief → Draft → Review → Publish", automation: "Rangkuman performa" },
  finance: { name: "Kiki", role: "Finance Controller", skills: ["Cashflow", "Rekonsiliasi", "Laporan"], memory: ["Pisahkan uang operasional dan uang pribadi."], dataAccess: ["Transaksi", "Biaya", "Laporan"], pipeline: "Catat → Cek → Rekonsiliasi", automation: "Pengingat rekonsiliasi" },
  operations: { name: "Gilang", role: "Ops Lead", skills: ["SOP", "Stok", "Quality check"], memory: ["Checklist packing harus selesai sebelum pickup kurir."], dataAccess: ["Stok", "Pesanan", "SOP"], pipeline: "Order → Packing → Pickup", automation: "Alert stok menipis" },
};

function safeJsonArray(value: string | undefined, fallback: string[]): string[] {
  try { const parsed = JSON.parse(value || ""); return Array.isArray(parsed) ? parsed.map(String) : fallback; } catch { return fallback; }
}

function getAgentContext(channelId: string, teamName?: string): AgentContext {
  if (AGENT_CONTEXT[channelId]) return AGENT_CONTEXT[channelId];
  const label = (teamName || "Divisi Baru").replace(/^Tim\s+/i, "");
  const lower = label.toLowerCase();
  if (lower.includes("procurement") || lower.includes("pengadaan")) return { name: "Naya", role: `Lead ${label}`, skills: ["Vendor", "Negosiasi", "Purchase order"], memory: [`${label} fokus menjaga harga dan lead time vendor tetap sehat.`], dataAccess: ["Vendor", "Purchase order", "Stok"], pipeline: "Brief → Cari vendor → Bandingkan → PO", automation: "Alert harga vendor" };
  if (lower.includes("hr") || lower.includes("people") || lower.includes("human")) return { name: "Alya", role: `People Partner ${label}`, skills: ["Hiring", "Onboarding", "Feedback"], memory: [`${label} menjaga komunikasi tim tetap manusiawi dan terstruktur.`], dataAccess: ["Roster", "Onboarding", "Catatan 1:1"], pipeline: "Request → Screening → Interview → Onboarding", automation: "Pengingat check-in" };
  return { name: "Nara", role: `Senior ${label}`, skills: ["Koordinasi", "Eksekusi", "Pelaporan"], memory: [`${label} selalu merangkum progres, risiko, dan next step sebelum update.`], dataAccess: [`Data ${label}`, "Dokumen", "Percakapan"], pipeline: "Brief → Kerjakan → Review → Update", automation: `Update progres ${label}` };
}

type AutomationRunRecord = { id: number; automationId: number; channelId: string; status: string; output: string; createdAt: Date };

type AutomationRecord = {
  id: number;
  name: string;
  description: string;
  trigger: string;
  scheduleCron?: string | null;
  scheduleCronTaskUid?: string | null;
  status: "draft" | "active" | "paused";
};

export type ChatRecord = {
  id: ChannelId;
  title: string;
  subtitle: string;
  preview: string;
  time: string;
  unread?: number;
  typing?: boolean;
  initials: string;
  avatarClass: string;
  description: string;
  members: { name: string; role: string; initials: string; avatarClass: string; bio: string; online: boolean }[];
  messages: ChatMessage[];
  docs: Attachment[];
  media: string[];
};

const nowTime = () =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date());

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const seedChats = (): ChatRecord[] => [
  {
    id: "assistant",
    title: "Dita · Asisten Pribadi",
    subtitle: "online · siap membantu",
    preview: "Mulai percakapan baru dengan Dita",
    time: "",
    unread: 0,
    initials: "D",
    avatarClass: "bg-[#d8efe6] text-[#1c806b]",
    description: "Asisten pribadi untuk membantu mengatur pekerjaan workspace kamu.",
    members: [{ name: "Dita", role: "Asisten Pribadi", initials: "D", avatarClass: "bg-[#d8efe6] text-[#1c806b]", bio: "Siap membantu setelah kamu mengirim pesan pertama.", online: true }],
    docs: [],
    media: [],
    messages: [],
  },
];

export function mergeDivisionChatList(chats: ChatRecord[], division: { id: number; channelId: string; name: string; businessArea: string; description: string; avatarClass: string }) {
  if (chats.some((chat) => chat.id === division.channelId)) return chats;
  return [...chats, makeCustomChat(division)];
}

function makeCustomChat(division: { id: number; channelId: string; name: string; businessArea: string; description: string; avatarClass: string }): ChatRecord {
  const initials = division.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return {
    id: division.channelId,
    title: division.name,
    subtitle: "divisi tersimpan",
    preview: "Mulai percakapan dengan tim ini",
    time: "",
    unread: 0,
    initials,
    avatarClass: division.avatarClass,
    description: division.description,
    members: [],
    docs: [],
    media: [],
    messages: [],
  };
}

function Avatar({ initials, avatarClass, size = "md", online = false }: { initials: string; avatarClass: string; size?: "sm" | "md" | "lg"; online?: boolean }) {
  const sizes = { sm: "h-9 w-9 text-xs", md: "h-11 w-11 text-sm", lg: "h-16 w-16 text-xl" };
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center rounded-[17px] font-bold ${sizes[size]} ${avatarClass}`}>
      {initials}
      {online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#2fb07f]" />}
    </span>
  );
}

type LoadingStage = { label: string; state: "pending" | "active" | "done" };

export function WorkspaceLoadingSkeleton({ compact = false, stages }: { compact?: boolean; stages?: LoadingStage[] }) {
  const progressStages = stages || [
    { label: "Tim", state: "active" as const },
    { label: "Dokumen", state: "pending" as const },
    { label: "Konteks AI", state: "pending" as const },
  ];
  return <div className={compact ? "workspace-loading workspace-loading-compact" : "workspace-loading"} role="status" aria-label="Memuat data workspace">
    <span className="loading-orbit"><span /></span><div className="loading-copy"><strong>{compact ? "Memuat tim…" : "Menyiapkan workspace…"}</strong><span>{compact ? "Mengambil data terbaru" : "Mengambil percakapan, tim, dan konteks AI"}</span>{!compact && <div className="loading-stages" aria-label="Progres pemuatan workspace">{progressStages.map((stage, index) => <span key={stage.label} className={`loading-stage loading-stage-${stage.state}`}><b>{stage.state === "done" ? "✓" : index + 1}</b>{stage.label}</span>)}</div>}</div><span className="loading-shimmer" />
  </div>;
}

type IconTourStep = { id: string; title: string; description: string; action: string };

const ICON_TOUR_STEPS: IconTourStep[] = [
  { id: "tour-search", title: "Cari percakapan", description: "Temukan tim atau chat lama dengan cepat dari kolom pencarian ini.", action: "Cari tim" },
  { id: "tour-new-chat", title: "Mulai chat baru", description: "Gunakan ikon pena untuk kembali ke Dita dan memulai permintaan baru.", action: "Buat chat" },
  { id: "tour-info", title: "Lihat info percakapan", description: "Buka panel ini untuk melihat anggota, memory kerja, dokumen, dan alur tim.", action: "Lihat info" },
  { id: "tour-menu", title: "Menu percakapan", description: "Akses tindakan tambahan seperti menandai chat sudah dibaca atau membersihkan draft.", action: "Buka menu" },
  { id: "tour-attach", title: "Lampirkan dokumen", description: "Tambahkan PDF, spreadsheet, gambar, atau dokumen agar AI bisa membantu berdasarkan data nyata.", action: "Lampirkan" },
  { id: "tour-send", title: "Kirim pesan", description: "Setelah menulis kebutuhanmu, tekan tombol ini atau Enter untuk mengirim.", action: "Kirim" },
];

function IconTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = ICON_TOUR_STEPS[stepIndex];
  useEffect(() => {
    if (!open) return;
    document.querySelectorAll<HTMLElement>("[data-tour]").forEach((element) => element.classList.remove("tour-target-active"));
    const target = document.querySelector<HTMLElement>(`[data-tour="${step.id}"]`);
    target?.classList.add("tour-target-active");
    return () => { target?.classList.remove("tour-target-active"); };
  }, [open, step.id]);
  useEffect(() => { if (!open) setStepIndex(0); }, [open]);
  if (!open || !step) return null;
  const finish = () => { if (typeof window !== "undefined") window.localStorage.setItem("saku-ai-icon-tour-complete", "1"); onClose(); };
  return <div className="icon-tour-layer" role="dialog" aria-modal="true" aria-labelledby="icon-tour-title">
    <div className="icon-tour-scrim" aria-hidden="true" />
    <section className="icon-tour-card">
      <div className="flex items-start justify-between gap-4"><div><span className="icon-tour-kicker">Tur singkat · {stepIndex + 1} dari {ICON_TOUR_STEPS.length}</span><h2 id="icon-tour-title">{step.title}</h2></div><button type="button" className="icon-tour-close" aria-label="Lewati tur ikon" onClick={finish}>Lewati</button></div>
      <p>{step.description}</p>
      <div className="icon-tour-progress" aria-label={`Langkah ${stepIndex + 1} dari ${ICON_TOUR_STEPS.length}`}>{ICON_TOUR_STEPS.map((item, index) => <span key={item.id} className={index <= stepIndex ? "icon-tour-dot-active" : ""} />)}</div>
      <div className="flex items-center justify-between gap-3"><button type="button" className="icon-tour-back" onClick={() => setStepIndex((index) => Math.max(0, index - 1))} disabled={stepIndex === 0}>Kembali</button><button type="button" className="icon-tour-next" onClick={() => stepIndex === ICON_TOUR_STEPS.length - 1 ? finish() : setStepIndex((index) => index + 1)}>{stepIndex === ICON_TOUR_STEPS.length - 1 ? "Selesai" : "Lanjut"}<ChevronRight className="h-4 w-4" /></button></div>
    </section>
  </div>;
}

function IconButton({ label, onClick, children, active = false, tourId }: { label: string; onClick?: () => void; children: ReactNode; active?: boolean; tourId?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button aria-label={label} title={label} data-tour={tourId} onClick={onClick} className={`icon-button ${active ? "bg-[#e6f4ef] text-[#1b8069]" : "text-[#78807d]"}`}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={7}>{label}</TooltipContent>
    </Tooltip>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button type="button" aria-label={label} aria-pressed={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${checked ? "bg-[#27866f]" : "bg-[#d9dfdc]"}`}>
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function FileGlyph({ type }: { type: Attachment["type"] }) {
  if (type === "image") return <ImageIcon className="h-5 w-5 text-[#2b8c72]" />;
  if (type === "video") return <ImageIcon className="h-5 w-5 text-[#7c65b4]" />;
  if (type === "audio") return <MessageCircle className="h-5 w-5 text-[#c26b4d]" />;
  if (type === "excel") return <Grid2X2 className="h-5 w-5 text-[#398b61]" />;
  return <FileText className="h-5 w-5 text-[#d46d55]" />;
}

function ChatListItem({ chat, selected, onClick }: { chat: ChatRecord; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`chat-list-item w-full text-left ${selected ? "chat-list-item-selected" : ""}`}>
      <Avatar initials={chat.initials} avatarClass={chat.avatarClass} size="md" online={chat.id === "assistant" || chat.id === "marketing"} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[14px] font-semibold text-[#263432]">{chat.title}</span>
          <span className={`shrink-0 text-[14px] ${selected ? "text-[#337c6c]" : "text-[#9aa19e]"}`}>{chat.time}</span>
        </span>
        <span className="mt-1 flex items-center justify-between gap-2">
          <span className={`truncate text-[14px] ${chat.typing ? "font-medium text-[#258168]" : "text-[#7a8581]"}`}>
            {chat.typing ? "sedang mengetik…" : chat.preview}
          </span>
          {chat.unread ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2d977b] px-1.5 text-[14px] font-bold text-white">{chat.unread}</span> : null}
        </span>
      </span>
    </button>
  );
}

function AttachmentCard({ attachment, compact = false, onPreview }: { attachment: Attachment; compact?: boolean; onPreview?: () => void }) {
  const statusLabel = attachment.extractionStatus === "complete" ? "Konten terbaca" : attachment.extractionStatus === "failed" ? "Perlu dicek ulang" : attachment.extractionStatus === "unsupported" ? "Format tersimpan" : undefined;
  const content = (
    <span className={`flex items-center gap-3 ${compact ? "min-w-0" : ""}`}>
      <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${compact ? "h-9 w-9" : "h-11 w-11"} bg-white/80`}>{attachment.type === "image" && attachment.url ? <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" /> : <FileGlyph type={attachment.type} />}</span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-[14px] font-semibold">{attachment.name}</span>
        {attachment.size && <span className="mt-0.5 block text-[14px] opacity-65">{attachment.size}</span>}
        {statusLabel && <span data-testid="extraction-status" className="mt-1 block text-[14px] font-semibold text-[#2d856d]">{statusLabel}</span>}
        {attachment.extractionPreview && <span className="mt-1 block max-h-10 overflow-hidden text-[14px] leading-4 text-[#789086]">{attachment.extractionPreview}</span>}
        {compact && attachment.extractedText && <details className="mt-2 text-[14px] text-[#617c70]"><summary className="cursor-pointer font-semibold">Buka konten terbaca</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-[#f7fbf8] p-2 font-sans leading-4">{attachment.extractedText}</pre></details>}
      </span>
    </span>
  );
  const mediaPreview = attachment.url && attachment.type === "video" ? <video controls preload="metadata" className="mb-2 max-h-72 w-full rounded-lg" src={attachment.url} /> : attachment.url && attachment.type === "audio" ? <audio controls preload="metadata" className="mb-2 w-full" src={attachment.url} /> : null;
  const card = <div className={`attachment-card ${compact ? "max-w-full" : ""}`}>{mediaPreview}{content}{attachment.url && <Download className="ml-auto h-4 w-4 shrink-0 opacity-60" />}</div>;
  if (onPreview) return <button type="button" className="block w-full text-left" onClick={onPreview}>{card}</button>;
  return attachment.url ? <a href={attachment.url} target="_blank" rel="noreferrer" download={attachment.name}>{card}</a> : card;
}

function ContentPackageCard({ contentPackage }: { contentPackage: NonNullable<ChatMessage["contentPackage"]> }) {
  const [copied, setCopied] = useState(false);
  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(contentPackage.caption);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Caption belum bisa disalin. Coba lagi.");
    }
  };
  return <div className="mt-3 overflow-hidden rounded-xl border border-[#cfe8dc] bg-[#f7fcf9]">
    {contentPackage.imageUrl && <img src={contentPackage.imageUrl} alt={`Visual konten ${contentPackage.platform}`} className="max-h-64 w-full object-cover" />}
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[14px] font-bold uppercase tracking-[0.12em] text-[#39836f]">Paket konten · {contentPackage.platform}</span><span className="text-[14px] text-[#82918b]">Posting manual</span></div>
      <p className="whitespace-pre-wrap text-[14px] leading-5 text-[#3f514a]">{contentPackage.caption}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copyCaption} className="rounded-lg bg-[#2d8d73] px-3 py-2 text-[14px] font-bold text-white transition hover:bg-[#24765f]">{copied ? "Caption tersalin" : "Salin Caption"}</button>
        {contentPackage.imageUrl && <a href={contentPackage.imageUrl} download="saku-content-package.png" className="rounded-lg border border-[#b9d9ca] bg-white px-3 py-2 text-[14px] font-bold text-[#39735f] transition hover:bg-[#edf8f1]">Unduh Gambar</a>}
      </div>
    </div>
  </div>;
}

function normalizeAssistantText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-zA-Z0-9_-]*\n?/g, "").replace(/```/g, "").trim())
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+[.)]\s+/gm, (match) => `${match.trim().replace(/[.)]$/, ".")} `)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/(?<!\w)\*(.*?)\*(?!\w)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function MessageBubble({ message }: { message: ChatMessage }) {
  const isOwner = message.sender === "owner";
  const isAssistant = message.sender === "assistant";
  const displayText = message.text && isAssistant ? normalizeAssistantText(message.text) : message.text;
  return (
    <div className={`message-row ${isOwner ? "justify-end" : "justify-start"}`}>
      {!isOwner && <span className={`message-avatar ${isAssistant ? "bg-[#d8efe6] text-[#1c806b]" : "bg-[#f3dfcb] text-[#a7602d]"}`}>{isAssistant ? "D" : (message.senderName?.[0] ?? "A")}</span>}
      <div className={`message-stack ${isOwner ? "items-end" : "items-start"}`}>
        {!isOwner && <span className="mb-1 px-1 text-[14px] font-semibold text-[#4b8b7a]">{message.senderName} <span className="font-normal text-[#9aa29f]">· {message.senderRole}</span></span>}
        <div className={`message-bubble ${isOwner ? "message-bubble-owner" : "message-bubble-team"}`}>
          {displayText && <p className="whitespace-pre-wrap text-[14px] leading-[1.55]">{displayText}</p>}
          {message.actionLabel && <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#eff8f3] px-2 py-1.5 text-[14px] font-semibold text-[#2b8068]"><Check className="h-3 w-3" /> {message.actionLabel}</div>}
          {message.contentPackage && <ContentPackageCard contentPackage={message.contentPackage} />}
          {message.attachment && <AttachmentCard attachment={message.attachment} />}
          <div className={`mt-1.5 flex items-center justify-end gap-1.5 text-[14px] ${isOwner ? "text-[#6c9c8e]" : "text-[#9da7a3]"}`}>
            {message.reactions?.map((reaction) => <span key={reaction} className="mr-auto rounded-full bg-white/70 px-1.5 py-0.5 text-[14px]">{reaction}</span>)}
            <span>{message.time}</span>
            {isOwner && <span className="inline-flex items-center text-[#318f78]"><Check className="h-3 w-3" /><Check className="-ml-1.5 h-3 w-3" /></span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailsPanel({ chat, onClose, onManageMembers, uploadedFiles }: { chat: ChatRecord; onClose: () => void; onManageMembers: () => void; uploadedFiles: Attachment[] }) {
  const [tab, setTab] = useState<"about" | "media" | "docs">("about");
  const [muted, setMuted] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Attachment | null>(null);
  const [docFilter, setDocFilter] = useState("");
  const { data: persistedContext } = trpc.workspace.employeeContext.useQuery({ channelId: chat.id }, { enabled: true });
  const { data: workspaceSnapshot } = trpc.workspace.snapshot.useQuery(undefined, { enabled: true });
  const fallbackAgent = getAgentContext(chat.id, chat.title);
  const agent = persistedContext?.agent ? { ...fallbackAgent, name: persistedContext.agent.name, role: persistedContext.agent.roleTitle, avatarClass: persistedContext.agent.avatarClass, skills: safeJsonArray(persistedContext.agent.skillsText, fallbackAgent.skills), dataAccess: safeJsonArray(persistedContext.agent.dataAccessText, fallbackAgent.dataAccess), memory: persistedContext.memories?.length ? persistedContext.memories.map((item) => item.memory) : fallbackAgent.memory, pipeline: persistedContext.pipelines?.[0]?.stepsText ? safeJsonArray(persistedContext.pipelines[0].stepsText, fallbackAgent.pipeline.split(" → ")).join(" → ") : fallbackAgent.pipeline, currentStep: persistedContext.pipelines?.[0]?.currentStep || fallbackAgent.currentStep, automation: persistedContext.automations?.[0]?.name || fallbackAgent.automation } : fallbackAgent;
  const allDocs = [...chat.docs, ...uploadedFiles];
  const workspaceLabel = workspaceSnapshot ? `Workspace: ${workspaceSnapshot.divisions} divisi · ${workspaceSnapshot.files} dokumen · ${workspaceSnapshot.automations} automasi · ${workspaceSnapshot.pipelines} pipeline` : undefined;
  return (
    <aside className="details-panel">
      <div className="details-header">
        <IconButton label="Tutup detail" onClick={onClose}><X className="h-[18px] w-[18px]" /></IconButton>
        <span className="text-[14px] font-bold text-[#293633]">Info {chat.id === "assistant" ? "Asisten" : "Grup"}</span>
        <span className="w-8" />
      </div>
      <div className="details-scroll">
        <div className="flex flex-col items-center px-6 pb-5 pt-7 text-center">
          <Avatar initials={chat.initials} avatarClass={chat.avatarClass} size="lg" online={chat.id === "assistant"} />
          <h2 className="mt-4 font-display text-[20px] font-bold tracking-[-0.04em] text-[#263432]">{chat.title}</h2>
          <p className="mt-1 text-[14px] text-[#83908b]">{chat.subtitle}</p>
        </div>
        <div className="details-tabs">
          {[{ id: "about", label: "Tentang" }, { id: "media", label: "Media" }, { id: "docs", label: "Dokumen" }].map((item) => (
            <button key={item.id} onClick={() => setTab(item.id as typeof tab)} className={`details-tab ${tab === item.id ? "details-tab-active" : ""}`}>{item.label}</button>
          ))}
        </div>
        {tab === "about" && (
          <div className="space-y-5 p-5">
            <div>
              <p className="eyebrow">Deskripsi</p>
              <p className="mt-2 text-[14px] leading-6 text-[#65716e]">{chat.description}</p>
            </div>
            <div className="employee-profile-card"><div className="flex items-center gap-2"><span className="agent-context-status" /><div><p className="text-[14px] font-bold text-[#30443d]">{agent.name} · {agent.role}</p><p className="text-[14px] text-[#7f9289]">AI employee · siap bekerja</p></div></div><div className="mt-3 flex flex-wrap gap-1.5">{agent.skills.map((skill) => <span key={skill} className="rounded-full bg-white px-2 py-1 text-[14px] font-semibold text-[#5c776b]">{skill}</span>)}</div></div><div className="rounded-xl border border-[#dfece5] bg-[#f8fcfa] p-3"><p className="eyebrow">Konfigurasi aktif yang dipakai AI</p>{persistedContext?.division && <p className="mt-2 text-[14px] leading-5 text-[#65716e]"><strong>{persistedContext.division.businessArea}</strong> · {persistedContext.division.description}</p>}{persistedContext?.agent?.personality && <p className="mt-2 text-[14px] leading-5 text-[#65716e]"><strong>Personality:</strong> {persistedContext.agent.personality}</p>}{persistedContext?.standards && <div className="mt-3 space-y-1 text-[14px] leading-4 text-[#71847a]"><p><strong>Tujuan:</strong> {persistedContext.standards.purpose}</p><p><strong>Format:</strong> {persistedContext.standards.outputFormat}</p><p><strong>Guardrail:</strong> {persistedContext.standards.guardrails}</p><p><strong>Checklist:</strong> {persistedContext.standards.checklist}</p></div>}{persistedContext?.pipelines?.[0] && <p className="mt-2 text-[14px] leading-4 text-[#71847a]"><strong>Pipeline:</strong> {persistedContext.pipelines[0].name} · langkah {persistedContext.pipelines[0].currentStep} · {persistedContext.pipelines[0].status}</p>}{persistedContext?.automations?.[0] && <p className="mt-2 text-[14px] leading-4 text-[#71847a]"><strong>Automasi:</strong> {persistedContext.automations[0].name} · {persistedContext.automations[0].trigger} · {persistedContext.automations[0].status}</p>}</div>
            <div className="space-y-4"><div><p className="eyebrow">Memory kerja</p><div className="mt-2 space-y-1.5">{agent.memory.map((memory) => <p key={memory} className="rounded-lg bg-[#f8fbf9] px-3 py-2 text-[14px] leading-5 text-[#6d7d76]">{memory}</p>)}</div></div><div><p className="eyebrow">Database yang bisa dibaca</p><div className="mt-2 flex flex-wrap gap-1.5">{[...agent.dataAccess, ...(workspaceLabel ? [workspaceLabel] : [])].map((item) => <span key={item} className="rounded-full bg-[#f7faf8] px-2 py-1 text-[14px] font-semibold text-[#6d7d76]">{item}</span>)}</div></div><div><p className="eyebrow">Pipeline aktif</p><div className="mt-2 space-y-2">{agent.pipeline.split(" → ").map((step, index) => <div key={step} className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${index + 1 <= (agent.currentStep || 1) ? "bg-[#2d8d72] text-white" : "bg-[#e6f3ec] text-[#4e907a]"}`}>{index + 1}</span><span className="text-[14px] font-semibold text-[#667770]">{step}</span>{index < agent.pipeline.split(" → ").length - 1 && <span className="ml-auto text-[#b1c8bd]">→</span>}</div>)}</div></div><div><p className="eyebrow">Automasi aktif</p><div className="mt-2 flex items-center justify-between rounded-lg border border-[#dceee5] bg-[#f4fbf7] px-3 py-2"><div><p className="text-[14px] font-bold text-[#3d6759]">{agent.automation}</p><p className="mt-0.5 text-[14px] text-[#89a096]">Menunggu pemicu berikutnya</p></div><span className="rounded-full bg-[#dff4e9] px-2 py-1 text-[9px] font-bold text-[#2d856d]">Aktif</span></div></div></div>
            <div>
              <div className="flex items-center justify-between"><p className="eyebrow">Anggota · {chat.members.length}</p><button type="button" onClick={onManageMembers} className="text-[14px] font-semibold text-[#2b8b73]">Kelola</button></div>
              <div className="mt-3 space-y-3">
                {chat.members.map((member) => <div key={member.name} className="flex items-center gap-3"><Avatar initials={member.initials} avatarClass={member.avatarClass} size="sm" online={member.online} /><div className="min-w-0"><p className="text-[14px] font-bold text-[#33413d]">{member.name} <span className="font-normal text-[#a0aaa6]">· {member.role}</span></p><p className="mt-0.5 truncate text-[14px] text-[#8c9894]">{member.bio}</p></div></div>)}
              </div>
            </div>
            <div className="details-setting-row"><span className="flex items-center gap-3"><span className="details-setting-icon"><BellOff className="h-4 w-4" /></span><span><span className="block text-[14px] font-semibold text-[#3b4844]">Bisukan notifikasi</span><span className="block text-[14px] text-[#98a19e]">Hanya untuk grup ini</span></span></span><Toggle checked={muted} onChange={setMuted} label="Bisukan notifikasi" /></div>
            <button type="button" onClick={() => toast.info("Divisi aman tetap aktif. Untuk mengarsipkan, gunakan menu SAKU di kiri atas.")} className="danger-action"><Archive className="h-4 w-4" /> Nonaktifkan divisi ini</button>
          </div>
        )}
        {tab === "media" && (
          <div className="p-5">
            <p className="eyebrow">Media dari percakapan</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {chat.media.map((item, index) => <div key={item} className={`media-tile media-tile-${index % 4}`}><span>{item}</span><ImageIcon className="h-4 w-4 opacity-60" /></div>)}
            </div>
            <p className="mt-7 text-[14px] leading-5 text-[#99a29f]">Media yang dikirim ke percakapan ini akan tersimpan rapi di sini. Kamu bisa membukanya lagi kapan saja.</p>
          </div>
        )}
        {tab === "docs" && (
          <div className="p-5">
            <div className="flex items-center justify-between"><p className="eyebrow">Dokumen · {allDocs.length}</p><button type="button" onClick={() => setDocFilter((current) => current ? "" : "pdf")} className="text-[14px] font-semibold text-[#2b8b73]">{docFilter ? "Tampilkan semua" : "Filter PDF"}</button></div>
            <div className="mt-4 space-y-3">{allDocs.filter((doc) => !docFilter || doc.type === docFilter).map((doc, index) => <AttachmentCard key={`${doc.name}-${index}`} attachment={doc} compact onPreview={() => setPreviewDoc(doc)} />)}</div>
            <div className="mt-6 rounded-2xl bg-[#f3f8f5] p-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#2b8b73]" /><p className="text-[14px] leading-5 text-[#628278]">Dokumen disimpan di penyimpanan aman dan hanya dibagikan di ruang kerja ini.</p></div></div>
          </div>
        )}
      </div>
      {previewDoc && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#20322e]/30 p-4" role="dialog" aria-label={`Preview ${previewDoc.name}`} onClick={() => setPreviewDoc(null)}><div className="max-h-[80vh] w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-[#e6eee9] px-5 py-4"><div><p className="text-[14px] font-bold text-[#30443d]">Preview dokumen</p><p className="mt-1 text-[14px] text-[#809088]">{previewDoc.name} · {previewDoc.detectedKind || "file"}</p></div><button type="button" aria-label="Tutup preview dokumen" onClick={() => setPreviewDoc(null)} className="rounded-full p-2 text-[#71827a] hover:bg-[#f3f8f5]"><X className="h-4 w-4" /></button></div><div className="max-h-[65vh] overflow-auto p-5"><div className="mb-4 rounded-xl bg-[#f4fbf7] px-3 py-2 text-[14px] font-semibold text-[#2d856d]">{previewDoc.extractionStatus === "complete" ? "Konten terbaca" : "Konten belum dapat diekstrak"}</div><pre data-testid="document-preview" className="whitespace-pre-wrap text-[14px] leading-5 text-[#52665d]">{previewDoc.extractedText || previewDoc.extractionPreview || "Belum ada preview terstruktur untuk dokumen ini."}</pre></div></div></div>}
    </aside>
  );
}

function PublicWelcome({ onLogin, loading, error }: { onLogin: () => void; loading: boolean; error: unknown }) {
  return <AuthScreen onOAuthLogin={onLogin} loading={loading} error={error} />;
}

type OnboardingInterview = {
  businessName: string;
  businessDescription: string;
  customer: string;
  biggestChallenge: string;
  priorities: string[];
};

function OnboardingModal({ onClose, initialBusinessName, onFinish, isSaving }: { onClose: () => void; initialBusinessName: string; onFinish: (interview: OnboardingInterview) => void; isSaving: boolean }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingInterview>({ businessName: initialBusinessName === "Bisnismu" ? "" : initialBusinessName, businessDescription: "", customer: "", biggestChallenge: "", priorities: ["Penjualan"] });
  const options = ["Penjualan", "Marketing", "Keuangan", "Operasional", "Customer Service"];
  const update = (key: keyof OnboardingInterview, value: string | string[]) => setForm((current) => ({ ...current, [key]: value }));
  const togglePriority = (item: string) => update("priorities", form.priorities.includes(item) ? form.priorities.filter((value) => value !== item) : [...form.priorities, item]);
  const canContinue = step === 1 ? form.businessName.trim().length >= 2 : step === 2 ? form.businessDescription.trim().length >= 10 : step === 3 ? form.customer.trim().length >= 3 : step === 4 ? form.biggestChallenge.trim().length >= 3 && form.priorities.length > 0 : true;
  const next = () => setStep((current) => Math.min(4, current + 1));
  return (
    <div className="modal-backdrop">
      <div className="onboarding-modal">
        <button aria-label="Tutup onboarding" onClick={onClose} className="absolute right-5 top-5 rounded-full p-2 text-[#8b9691] transition hover:bg-[#f2f5f3]"><X className="h-4 w-4" /></button>
        <div className="onboarding-art"><span className="onboarding-orbit onboarding-orbit-one" /><span className="onboarding-orbit onboarding-orbit-two" /><span className="onboarding-spark"><Sparkles className="h-5 w-5" /></span><div className="onboarding-mark">S</div><span className="onboarding-bubble bubble-one">aku dengarkan</span><span className="onboarding-bubble bubble-two">siap menyiapkan</span></div>
        <div className="px-7 pb-7 pt-6 sm:px-9 sm:pb-9">
          <div className="flex items-center gap-1.5">{[0, 1, 2, 3, 4].map((item) => <span key={item} className={`h-1.5 rounded-full transition-all ${item === step ? "w-7 bg-[#277f69]" : item < step ? "w-3 bg-[#9bd2bd]" : "w-1.5 bg-[#dce8e2]"}`} />)}</div>
          {step > 0 && <button type="button" aria-label="Kembali ke pertanyaan sebelumnya" disabled={isSaving} onClick={() => setStep((current) => Math.max(0, current - 1))} className="mt-5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[14px] font-bold text-[#5c8173] transition hover:bg-[#f1f7f3] disabled:cursor-not-allowed disabled:opacity-45"><ChevronLeft className="h-3.5 w-3.5" /> Kembali</button>}
          {step === 0 && <div><p className="eyebrow mt-6">Wawancara ringan bersama Dita</p><h2 className="mt-2 font-display text-[28px] font-bold leading-[1.05] tracking-[-0.06em] text-[#273632]">Biar SAKU benar-benar cocok dengan caramu bekerja.</h2><p className="mt-4 text-[14px] leading-6 text-[#74817c]">Aku akan bertanya sebentar tentang bisnis dan tantanganmu. Setelah itu, AI akan menyiapkan tim, pipeline, automasi, dan memory awal — tanpa istilah teknis.</p><button onClick={next} className="primary-button mt-7 w-full justify-center">Mulai wawancara <ChevronRight className="h-4 w-4" /></button></div>}
          {step === 1 && <div><p className="eyebrow mt-6">Pertanyaan 1 dari 4</p><h2 className="mt-2 font-display text-[25px] font-bold tracking-[-0.05em] text-[#273632]">Bisnismu bernama apa?</h2><p className="mt-2 text-[14px] leading-6 text-[#74817c]">Nama ini dipakai untuk memberi konteks ke seluruh tim AI.</p><input autoFocus value={form.businessName} onChange={(event) => update("businessName", event.target.value)} placeholder="Contoh: Toko Rona" className="soft-input mt-6" /><button onClick={next} disabled={!canContinue} className="primary-button mt-5 w-full justify-center disabled:cursor-not-allowed disabled:opacity-45">Lanjut <ChevronRight className="h-4 w-4" /></button></div>}
          {step === 2 && <div><p className="eyebrow mt-6">Pertanyaan 2 dari 4</p><h2 className="mt-2 font-display text-[25px] font-bold tracking-[-0.05em] text-[#273632]">Ceritakan bisnismu dengan bahasa sehari-hari.</h2><p className="mt-2 text-[14px] leading-6 text-[#74817c]">Jual apa, melayani siapa, atau pekerjaan apa yang paling sering dilakukan?</p><textarea autoFocus value={form.businessDescription} onChange={(event) => update("businessDescription", event.target.value)} placeholder="Contoh: Kami menjual skincare lokal lewat Instagram dan marketplace…" className="soft-input mt-6 min-h-24 w-full resize-y" /><button onClick={next} disabled={!canContinue} className="primary-button mt-5 w-full justify-center disabled:cursor-not-allowed disabled:opacity-45">Lanjut <ChevronRight className="h-4 w-4" /></button></div>}
          {step === 3 && <div><p className="eyebrow mt-6">Pertanyaan 3 dari 4</p><h2 className="mt-2 font-display text-[25px] font-bold tracking-[-0.05em] text-[#273632]">Biasanya kamu melayani siapa?</h2><p className="mt-2 text-[14px] leading-6 text-[#74817c]">Jawaban sederhana saja, misalnya ibu muda, toko grosir, atau klien perusahaan.</p><input autoFocus value={form.customer} onChange={(event) => update("customer", event.target.value)} placeholder="Contoh: Perempuan usia 25–40 yang ingin kulit sehat" className="soft-input mt-6" /><button onClick={next} disabled={!canContinue} className="primary-button mt-5 w-full justify-center disabled:cursor-not-allowed disabled:opacity-45">Lanjut <ChevronRight className="h-4 w-4" /></button></div>}
          {step === 4 && <div><p className="eyebrow mt-6">Pertanyaan 4 dari 4</p><h2 className="mt-2 font-display text-[25px] font-bold tracking-[-0.05em] text-[#273632]">Apa yang paling ingin dibuat lebih ringan?</h2><p className="mt-2 text-[14px] leading-6 text-[#74817c]">Pilih area utama dan ceritakan hambatan terbesarmu. Dita akan menyusun paket awal yang bisa langsung direview.</p><div className="mt-5 grid grid-cols-2 gap-2">{options.map((option) => <button type="button" key={option} onClick={() => togglePriority(option)} className={`priority-chip ${form.priorities.includes(option) ? "priority-chip-active" : ""}`}>{form.priorities.includes(option) && <Check className="h-3.5 w-3.5" />}{option}</button>)}</div><textarea value={form.biggestChallenge} onChange={(event) => update("biggestChallenge", event.target.value)} placeholder="Contoh: Saya sering lupa follow-up calon pelanggan dan sulit tahu pekerjaan mana yang paling penting…" className="soft-input mt-4 min-h-20 w-full resize-y" /><button type="button" disabled={isSaving || !canContinue} onClick={() => onFinish({ ...form, businessName: form.businessName.trim(), businessDescription: form.businessDescription.trim(), customer: form.customer.trim(), biggestChallenge: form.biggestChallenge.trim() })} className="primary-button mt-5 w-full justify-center disabled:cursor-wait disabled:opacity-55">{isSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Dita sedang menyiapkan workspace</> : <>Siapkan workspace-ku <Sparkles className="h-4 w-4" /></>}</button></div>}
        </div>
      </div>
    </div>
  );
}
type WorkspaceMemberView = { id: number; email: string; name: string; role: "admin" | "member"; status: "pending" | "active" | "removed"; createdAt: Date };
type SupportRequestView = { id: number; category: string; subject: string; message: string; status: "open" | "in_progress" | "resolved"; createdAt: Date };

function MemberManagementPanel() {
  const workspaceUtils = trpc.useUtils();
  const { data: members = [], isLoading } = trpc.workspace.members.list.useQuery();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [pendingMember, setPendingMember] = useState<WorkspaceMemberView | null>(null);
  const inviteMutation = trpc.workspace.members.invite.useMutation({ onSuccess: () => { setName(""); setEmail(""); setRole("member"); void workspaceUtils.workspace.members.list.invalidate(); toast.success("Undangan dibuat. Minta anggota masuk dengan email yang sama untuk menerimanya."); }, onError: (error) => toast.error(error.message || "Undangan belum bisa disimpan.") });
  const updateMutation = trpc.workspace.members.update.useMutation({ onSuccess: () => { void workspaceUtils.workspace.members.list.invalidate(); toast.success("Akses anggota diperbarui."); }, onError: () => toast.error("Akses anggota belum bisa diperbarui.") });
  const confirmDeactivate = () => {
    if (!pendingMember) return;
    updateMutation.mutate({ id: pendingMember.id, status: "removed" });
    setPendingMember(null);
  };
  return <>
    <section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon bg-[#e6f0fb] text-[#4f78a5]"><Users className="h-4 w-4" /></span><div><h2>Kelola anggota workspace</h2><p>Catat undangan dan atur akses tim dengan aman</p></div></div><div className="rounded-xl border border-[#dfece5] bg-[#fbfefc] p-3"><p className="text-[14px] leading-5 text-[#74817c]">Setelah diundang, anggota cukup membuat atau masuk ke akun dengan <strong>email yang sama</strong>. SAKU AI akan menampilkan undangan untuk diterima dan mengaktifkan workspace secara otomatis.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><input aria-label="Nama anggota baru" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama anggota" className="soft-input" /><input aria-label="Email anggota baru" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@bisnis.com" type="email" className="soft-input" /></div><div className="mt-2 flex flex-wrap gap-2"><select aria-label="Peran anggota baru" value={role} onChange={(event) => setRole(event.target.value as "member" | "admin")} className="soft-input min-w-32"><option value="member">Member</option><option value="admin">Admin</option></select><button type="button" disabled={inviteMutation.isPending || name.trim().length < 2 || !email.includes("@")} onClick={() => inviteMutation.mutate({ name: name.trim(), email: email.trim(), role })} className="primary-button flex-1 justify-center text-[14px]">{inviteMutation.isPending ? "Menyimpan…" : "Catat undangan"}</button></div></div><div className="mt-4 space-y-2">{isLoading ? <p className="text-[14px] text-[#84918b]">Memuat anggota…</p> : (members as WorkspaceMemberView[]).length ? (members as WorkspaceMemberView[]).map((member) => <div key={member.id} className="flex items-center gap-3 rounded-xl border border-[#e7efeb] bg-white px-3 py-2.5"><Avatar initials={member.name.slice(0, 1).toUpperCase()} avatarClass="bg-[#f2d9c3] text-[#a4612e]" size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-[14px] font-bold text-[#34433e]">{member.name}</p><p className="truncate text-[14px] text-[#8b9892]">{member.email}</p></div><select aria-label={`Peran ${member.name}`} value={member.role} onChange={(event) => updateMutation.mutate({ id: member.id, role: event.target.value as "member" | "admin" })} className="rounded-lg border border-[#dfece5] bg-white px-2 py-1.5 text-[14px] font-semibold text-[#5c7168]"><option value="member">Member</option><option value="admin">Admin</option></select><button type="button" disabled={member.status === "removed"} onClick={() => setPendingMember(member)} className="rounded-lg px-3 py-2 text-[14px] font-bold text-[#b86464] hover:bg-[#fff1f1]">Nonaktifkan</button><span className={`rounded-full px-2 py-1 text-[14px] font-bold ${member.status === "active" ? "bg-[#e3f4ec] text-[#2b836b]" : member.status === "removed" ? "bg-[#f8e5e5] text-[#b86464]" : "bg-[#fff0db] text-[#bd762b]"}`}>{member.status === "active" ? "Aktif" : member.status === "removed" ? "Nonaktif" : "Pending"}</span></div>) : <div className="rounded-xl bg-[#f6faf8] p-3 text-[14px] leading-5 text-[#7e8b86]">Belum ada anggota tambahan. Catat undangan pertama di atas.</div>}</div></section>
    <AlertDialog open={Boolean(pendingMember)} onOpenChange={(open) => { if (!open) setPendingMember(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Nonaktifkan akses anggota?</AlertDialogTitle><AlertDialogDescription>{pendingMember ? `Akses ${pendingMember.name} (${pendingMember.email}) akan dinonaktifkan dari workspace. Anggota ini tidak bisa mengakses workspace sampai diaktifkan kembali.` : "Akses anggota akan dinonaktifkan dari workspace."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={updateMutation.isPending}>Batal</AlertDialogCancel><AlertDialogAction onClick={confirmDeactivate} disabled={updateMutation.isPending} className="bg-[#b86464] text-white hover:bg-[#9f4e4e]">{updateMutation.isPending ? "Memproses…" : "Ya, nonaktifkan"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
function HelpCenterPanel() {
  const workspaceUtils = trpc.useUtils();
  const { data: requests = [] } = trpc.workspace.support.list.useQuery();
  const [category, setCategory] = useState("Panduan penggunaan");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const supportMutation = trpc.workspace.support.create.useMutation({ onSuccess: () => { setSubject(""); setMessage(""); void workspaceUtils.workspace.support.list.invalidate(); toast.success("Tiket bantuan berhasil dibuat."); }, onError: (error) => toast.error(error.message || "Tiket belum bisa dikirim.") });
  const guides = [{ title: "Mulai dari onboarding", text: "Kenalkan bisnis dan pilih prioritas agar SAKU menyiapkan tim AI yang relevan." }, { title: "Gunakan chat sebagai pusat kerja", text: "Minta Dita membuat divisi, pipeline, automasi, ringkasan, atau membaca dokumen." }, { title: "Jaga workspace tetap privat", text: "Data dan file tersimpan per akun. Kelola akses tim dari panel anggota workspace." }];
  return <section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon bg-[#f7e1e1] text-[#b86464]"><CircleHelp className="h-4 w-4" /></span><div><h2>Pusat bantuan SAKU AI</h2><p>Panduan singkat dan tiket dukungan untuk workspace</p></div></div><div className="grid gap-2">{guides.map((guide) => <details key={guide.title} className="rounded-xl border border-[#e7efeb] bg-[#fbfefc] px-3 py-2"><summary className="cursor-pointer text-[14px] font-bold text-[#34433e]">{guide.title}</summary><p className="mt-2 text-[14px] leading-5 text-[#7e8b86]">{guide.text}</p></details>)}</div><div className="mt-4 rounded-xl border border-[#dfece5] bg-white p-3"><p className="text-[14px] font-bold text-[#34433e]">Kirim kendala atau pertanyaan</p><div className="mt-2 grid gap-2 sm:grid-cols-[0.7fr_1.3fr]"><select aria-label="Kategori bantuan" value={category} onChange={(event) => setCategory(event.target.value)} className="soft-input"><option>Panduan penggunaan</option><option>Bug atau error</option><option>Billing dan akun</option><option>Masukan fitur</option></select><input aria-label="Subjek bantuan" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Contoh: dokumen tidak terbaca" className="soft-input" /></div><textarea aria-label="Isi permintaan bantuan" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ceritakan apa yang terjadi dan langkah terakhir yang kamu lakukan…" className="soft-input mt-2 min-h-24 w-full resize-y" maxLength={4000} /><button type="button" disabled={supportMutation.isPending || subject.trim().length < 3 || message.trim().length < 10} onClick={() => supportMutation.mutate({ category, subject: subject.trim(), message: message.trim() })} className="primary-button mt-2 w-full justify-center text-[14px]">{supportMutation.isPending ? "Mengirim…" : "Kirim ke pusat bantuan"}</button></div>{(requests as SupportRequestView[]).length > 0 && <div className="mt-4 space-y-2"><p className="text-[14px] font-bold uppercase tracking-[0.12em] text-[#8b9892]">Tiket terakhir</p>{(requests as SupportRequestView[]).slice(0, 3).map((request) => <div key={request.id} className="flex items-center gap-3 rounded-xl border border-[#e7efeb] bg-[#fbfefc] px-3 py-2.5"><div className="min-w-0 flex-1"><p className="truncate text-[14px] font-bold text-[#34433e]">#{request.id} · {request.subject}</p><p className="text-[14px] text-[#8b9892]">{request.category}</p></div><span className="rounded-full bg-[#fff0db] px-2 py-1 text-[14px] font-bold text-[#bd762b]">{request.status === "open" ? "Terbuka" : request.status === "in_progress" ? "Diproses" : "Selesai"}</span></div>)}</div>}</section>;
}

type TeamStandardForm = {
  purpose: string;
  principles: string;
  responseStyle: string;
  outputFormat: string;
  guardrails: string;
  checklist: string;
};

const defaultTeamStandard = (channelId: string): TeamStandardForm => ({
  purpose: `Membantu tim ${channelId === "assistant" ? "utama" : channelId} menyelesaikan pekerjaan dengan hasil yang jelas dan bisa ditindaklanjuti.`,
  principles: "Fokus pada tujuan tim; gunakan data yang tersedia; bedakan fakta, asumsi, dan rekomendasi; prioritaskan langkah berikutnya.",
  responseStyle: "Gunakan Bahasa Indonesia yang ringkas, hangat, profesional, dan langsung ke inti. Tanyakan klarifikasi bila konteks belum cukup.",
  outputFormat: "Mulai dengan kesimpulan singkat, gunakan bullet untuk langkah kerja, tampilkan angka dan status dengan jelas, lalu tutup dengan next step.",
  guardrails: "Jangan mengarang data, sumber, status pekerjaan, atau hasil tindakan. Jangan mengambil keputusan berisiko tanpa persetujuan pemilik. Jangan keluar dari peran tim.",
  checklist: "Pahami tujuan; cek konteks dan data; pilih pipeline tim; jawab sesuai format; sebutkan asumsi atau risiko; berikan langkah berikutnya.",
});

function TeamStandardsPanel({ pipelineTargets }: { pipelineTargets: { channelId: string; title: string }[] }) {
  const utils = trpc.useUtils();
  const targets = pipelineTargets.length ? pipelineTargets : [{ channelId: "assistant", title: "Dita · Asisten Pribadi" }];
  const [selectedChannel, setSelectedChannel] = useState(targets[0]?.channelId || "assistant");
  const standardsInput = useMemo(() => ({ channelId: selectedChannel }), [selectedChannel]);
  const { data: savedStandards, isLoading } = trpc.workspace.standards.get.useQuery(standardsInput);
  const [form, setForm] = useState<TeamStandardForm>(() => defaultTeamStandard(selectedChannel));
  const saveMutation = trpc.workspace.standards.upsert.useMutation({
    onSuccess: () => { void utils.workspace.standards.get.invalidate(standardsInput); toast.success("Standar tim berhasil disimpan. Jawaban AI akan mengikuti aturan ini."); },
    onError: (error) => toast.error(error.message || "Standar tim belum bisa disimpan."),
  });
  useEffect(() => {
    if (savedStandards) setForm({ purpose: savedStandards.purpose, principles: savedStandards.principles, responseStyle: savedStandards.responseStyle, outputFormat: savedStandards.outputFormat, guardrails: savedStandards.guardrails, checklist: savedStandards.checklist });
    else setForm(defaultTeamStandard(selectedChannel));
  }, [savedStandards, selectedChannel]);
  const updateField = (field: keyof TeamStandardForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const fields: Array<{ key: keyof TeamStandardForm; label: string; hint: string; placeholder: string }> = [
    { key: "purpose", label: "Tujuan tim", hint: "Hasil utama yang harus dikejar AI tim ini.", placeholder: "Contoh: Mengubah lead menjadi pelanggan dengan follow-up yang konsisten." },
    { key: "principles", label: "Prinsip kerja", hint: "Cara tim menilai prioritas dan mengambil langkah.", placeholder: "Contoh: utamakan data, jelaskan asumsi, jangan melewati tahap kualifikasi." },
    { key: "responseStyle", label: "Gaya jawaban", hint: "Nada, bahasa, dan tingkat detail yang diharapkan.", placeholder: "Contoh: ringkas, hangat, profesional, tidak bertele-tele." },
    { key: "outputFormat", label: "Format output", hint: "Bentuk jawaban agar mudah dipakai tim.", placeholder: "Contoh: kesimpulan → bullet langkah → next step." },
    { key: "guardrails", label: "Batasan dan guardrail", hint: "Hal yang tidak boleh dilakukan AI.", placeholder: "Contoh: jangan mengarang harga, diskon, atau status pesanan." },
    { key: "checklist", label: "Checklist sebelum menjawab", hint: "Pemeriksaan singkat yang wajib dilakukan.", placeholder: "Contoh: cek konteks → cek data → jawab → sebutkan risiko." },
  ];
  return <section className="settings-card" data-testid="team-standards-panel"><div className="settings-card-heading"><span className="settings-card-icon bg-[#e9e5f8] text-[#755fa4]"><ShieldCheck className="h-4 w-4" /></span><div><h2>Standar Tim AI</h2><p>Jaga cara berpikir setiap divisi tetap fokus dan konsisten</p></div></div><div className="rounded-xl border border-[#dfece5] bg-[#f8fcfa] p-3"><label className="settings-field mt-0"><span className="settings-field-label">Pilih tim yang ingin diatur</span><select aria-label="Pilih tim untuk standar" value={selectedChannel} onChange={(event) => setSelectedChannel(event.target.value)} className="soft-input">{targets.map((target) => <option key={target.channelId} value={target.channelId}>{target.title}</option>)}</select></label><div className="mt-3 flex items-start gap-2 rounded-xl bg-[#eef8f2] px-3 py-2.5 text-[14px] leading-5 text-[#55766a]"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2b836b]" /><p>Standar ini dikirim sebagai aturan kerja wajib ke AI tim yang dipilih. AI akan tetap memakai pipeline dan data timnya, tetapi tidak boleh melenceng dari guardrail ini.</p></div></div>{isLoading ? <p className="mt-4 text-[14px] text-[#84918b]">Memuat standar tim…</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map((field) => <label key={field.key} className="settings-field"><span className="settings-field-label">{field.label}</span><span className="text-[14px] leading-4 text-[#93a09a]">{field.hint}</span><textarea value={form[field.key]} onChange={(event) => updateField(field.key, event.target.value)} placeholder={field.placeholder} maxLength={6000} className="soft-input mt-1 min-h-24 w-full resize-y" /></label>)}</div>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[14px] text-[#899690]">Terakhir disimpan akan berlaku pada pesan berikutnya.</p><button type="button" disabled={saveMutation.isPending || isLoading || Object.values(form).some((value) => value.trim().length < 10)} onClick={() => saveMutation.mutate({ channelId: selectedChannel, ...form })} className="primary-button">{saveMutation.isPending ? "Menyimpan…" : "Simpan standar tim"}</button></div></section>;
}

type PipelineTemplate = { id: string; department: string; name: string; description: string; steps: readonly string[] };

function SmartMatchingRulesPanel() {
  const rulesQuery = trpc.workspace.reconciliationRules.list.useQuery();
  const utils = trpc.useUtils();
  const [pattern, setPattern] = useState("");
  const [targetCategory, setTargetCategory] = useState("");
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [pendingRule, setPendingRule] = useState<{ id: number; pattern: string } | null>(null);
  const createMutation = trpc.workspace.reconciliationRules.create.useMutation({ onSuccess: () => { setPattern(""); setTargetCategory(""); void utils.workspace.reconciliationRules.list.invalidate(); toast.success("Aturan matching berhasil disimpan."); }, onError: (error) => toast.error(error.message || "Aturan belum bisa disimpan.") });
  const removeMutation = trpc.workspace.reconciliationRules.remove.useMutation({ onSuccess: () => { void utils.workspace.reconciliationRules.list.invalidate(); toast.success("Aturan dihapus. Transaksi baru tidak akan memakai aturan ini."); }, onError: () => toast.error("Aturan belum bisa dihapus. Coba lagi.") });
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!pattern.trim() || !targetCategory.trim()) return; createMutation.mutate({ pattern: pattern.trim(), targetCategory: targetCategory.trim(), autoConfirm }); };
  const confirmRemove = () => { if (!pendingRule) return; removeMutation.mutate({ ruleId: pendingRule.id }); setPendingRule(null); };
  return <>
    <section className="settings-card" data-testid="smart-matching-rules-panel"><div className="settings-card-heading"><span className="settings-card-icon bg-[#fff0db] text-[#b56d2b]"><ShieldCheck className="h-4 w-4" /></span><div><h2>Smart Matching Rules</h2><p>Otomatis beri kategori pada mutasi Moota atau CSV yang masuk</p></div></div><p className="mt-3 text-[14px] leading-5 text-[#71847a]">Contoh: deskripsi mengandung <strong>Tokopedia</strong> → kategori <strong>Penjualan marketplace</strong>. Aktifkan konfirmasi otomatis hanya untuk pola yang sudah kamu percaya.</p><form onSubmit={submit} className="mt-4 grid gap-2"><label className="settings-field mt-0"><span className="settings-field-label">Jika deskripsi mengandung</span><input className="soft-input" value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="Contoh: Tokopedia, QRIS, Beli Bahan" maxLength={160} /></label><label className="settings-field"><span className="settings-field-label">Masukkan ke kategori</span><input className="soft-input" value={targetCategory} onChange={(event) => setTargetCategory(event.target.value)} placeholder="Contoh: Penjualan marketplace" maxLength={120} /></label><label className="rule-check"><input type="checkbox" checked={autoConfirm} onChange={(event) => setAutoConfirm(event.target.checked)} /><span><strong>Konfirmasi otomatis</strong><small>Mutasi yang cocok langsung dianggap sudah direkonsiliasi.</small></span></label><button type="submit" className="primary-button justify-center" disabled={!pattern.trim() || !targetCategory.trim() || createMutation.isPending}>{createMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…</> : "Tambah aturan"}</button></form><div className="mt-4 grid gap-2">{rulesQuery.isLoading ? <p className="text-[14px] text-[#789087]">Memuat aturan…</p> : rulesQuery.data?.length ? rulesQuery.data.map((rule) => <div key={rule.id} className="rule-row"><div className="min-w-0"><strong>{rule.pattern}</strong><span>→ {rule.targetCategory}</span><small>{rule.autoConfirm ? "Konfirmasi otomatis aktif" : "Perlu review manual"}</small></div><button type="button" aria-label={`Hapus aturan ${rule.pattern}`} onClick={() => setPendingRule({ id: rule.id, pattern: rule.pattern })} disabled={removeMutation.isPending} className="rule-delete"><X className="h-3.5 w-3.5" /></button></div>) : <p className="rounded-xl bg-[#f6faf8] p-3 text-[14px] text-[#789087]">Belum ada aturan. Tambahkan pola yang sering muncul di mutasi bankmu.</p>}</div></section>
    <AlertDialog open={Boolean(pendingRule)} onOpenChange={(open) => { if (!open) setPendingRule(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Hapus aturan smart-matching?</AlertDialogTitle><AlertDialogDescription>{pendingRule ? `Aturan “${pendingRule.pattern}” akan dihapus dan tidak akan dipakai untuk transaksi baru.` : "Aturan smart-matching akan dihapus."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={removeMutation.isPending}>Batal</AlertDialogCancel><AlertDialogAction onClick={confirmRemove} disabled={removeMutation.isPending} className="bg-[#b86464] text-white hover:bg-[#9f4e4e]">{removeMutation.isPending ? "Menghapus…" : "Ya, hapus aturan"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
function SettingsView({ onBack, userName, businessName, onBusinessNameChange, persona, onPersonaChange, automations, automationRuns, pipelineTemplates, pipelineTargets }: { onBack: () => void; userName: string; businessName: string; onBusinessNameChange: (name: string) => void; persona: string; onPersonaChange: (persona: string) => void; automations: AutomationRecord[]; automationRuns: AutomationRunRecord[]; pipelineTemplates: PipelineTemplate[]; pipelineTargets: { channelId: string; title: string }[] }) {
  const [notifications, setNotifications] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [compact, setCompact] = useState(false);
  const [targetChannel, setTargetChannel] = useState(pipelineTargets[0]?.channelId || "sales");
  const [pipelineNames, setPipelineNames] = useState<Record<string, string>>({});
  const [appliedMessage, setAppliedMessage] = useState("");
  const { logout = async () => undefined } = useAuth();
  const applyTemplateMutation = trpc.workspace.pipelineTemplates.applyTemplate.useMutation({ onSuccess: (result) => setAppliedMessage(`Pipeline “${result.pipeline?.name || result.template.name}” berhasil dibuat.`), onError: (error) => setAppliedMessage(error.message) });
  const exportWorkspace = () => { const payload = { workspace: businessName || "Bisnismu", owner: userName, exportedAt: new Date().toISOString(), automations, automationRuns }; const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "saku-ai-workspace.json"; anchor.click(); URL.revokeObjectURL(url); toast.success("Data workspace berhasil diekspor."); };
  return <div className="settings-view"><div className="settings-topbar"><button onClick={onBack} className="back-button"><ArrowLeft className="h-4 w-4" /> Kembali ke chat</button><div className="flex items-center gap-2 text-[14px] text-[#9aa39f]"><Settings className="h-4 w-4" /> Workspace</div></div><div className="settings-scroll"><div className="settings-intro"><div><p className="eyebrow">Preferensi ruang kerja</p><h1 className="mt-2 font-display text-[30px] font-bold tracking-[-0.06em] text-[#293834]">Pengaturan</h1><p className="mt-2 max-w-xl text-[14px] leading-6 text-[#74817c]">Atur cara SAKU AI menemani pekerjaanmu. Perubahan di sini hanya berlaku untuk akun dan workspace ini.</p></div><div className="settings-profile"><Avatar initials={userName.slice(0, 1).toUpperCase()} avatarClass="bg-[#d7eee5] text-[#287c68]" size="md" /><div><p className="text-[14px] font-bold text-[#34433e]">{userName}</p><p className="text-[14px] text-[#8b9692]">Pemilik workspace</p></div></div></div><div className="settings-grid"><section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon bg-[#e1f2ec] text-[#2a876f]"><Users className="h-4 w-4" /></span><div><h2>Workspace</h2><p>Identitas yang dipakai tim SAKU AI</p></div></div><label className="settings-field block w-full"><span>Nama bisnis</span><div className="soft-input-row"><BriefcaseBusiness className="h-4 w-4 text-[#8ba39a]" /><input aria-label="Nama bisnis" value={businessName} onChange={(event) => onBusinessNameChange(event.target.value)} placeholder="Bisnismu" className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#40564d] outline-none placeholder:text-[#9da7a3]" /><PenLine className="ml-auto h-3.5 w-3.5 text-[#9da7a3]" /></div></label><label className="settings-field block w-full"><span>Persona AI</span><textarea aria-label="Persona AI" value={persona} onChange={(event) => onPersonaChange(event.target.value)} placeholder="Contoh: hangat, ringkas, dan proaktif" maxLength={1000} className="mt-2 min-h-20 w-full resize-y rounded-xl border border-[#dfece5] bg-white px-3 py-2 text-[14px] leading-5 text-[#40564d] outline-none" /></label></section><TeamStandardsPanel pipelineTargets={pipelineTargets} /><PasswordSettingsCard /><ConnectedAccountsPanel /><MootaIntegrationCard /><GoogleSheetsIntegrationCard /><SmartMatchingRulesPanel /><MemberManagementPanel /><section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon bg-[#fff0db] text-[#bd762b]"><Bell className="h-4 w-4" /></span><div><h2>Notifikasi</h2><p>Atur kapan tim memberi kabar</p></div></div><div className="toggle-row"><div><p>Notifikasi workspace</p><span>Pesan dan update penting</span></div><Toggle checked={notifications} onChange={setNotifications} label="Notifikasi workspace" /></div><div className="toggle-row"><div><p>Suara pesan</p><span>Putar suara saat ada pesan baru</span></div><Toggle checked={sounds} onChange={setSounds} label="Suara pesan" /></div><div className="toggle-row"><div><p>Tampilan ringkas</p><span>Kurangi jarak antar pesan</span></div><Toggle checked={compact} onChange={setCompact} label="Tampilan ringkas" /></div></section><section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon bg-[#e9e5f8] text-[#755fa4]"><ShieldCheck className="h-4 w-4" /></span><div><h2>Privasi & data</h2><p>Kontrol data bisnis dan akses tim</p></div></div><button type="button" onClick={exportWorkspace} className="settings-link-row"><span><strong>Ekspor data</strong><small>Unduh salinan informasi workspace</small></span><Download className="h-4 w-4" /></button></section><section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon bg-[#e6f0fb] text-[#4f78a5]"><ClipboardList className="h-4 w-4" /></span><div><h2>Template pipeline bisnis</h2><p>Alur siap pakai untuk pekerjaan inti</p></div></div><div className="space-y-3">{pipelineTemplates.map((template) => <div key={template.id} data-testid={`pipeline-template-${template.id}`} className="rounded-xl border border-[#e1eee8] bg-[#fbfefc] p-3"><p className="text-[14px] font-bold text-[#34433e]">{template.department} · {template.name}</p><p className="mt-1 text-[14px] leading-5 text-[#7e8b86]">{template.description}</p><div className="mt-3 flex items-center gap-2"><select aria-label={`Pilih divisi untuk ${template.name}`} value={targetChannel} onChange={(event) => setTargetChannel(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-[#dfece5] bg-white px-2.5 py-2 text-[14px] font-semibold text-[#5b7067]">{pipelineTargets.map((target) => <option key={target.channelId} value={target.channelId}>{target.title}</option>)}</select><button type="button" data-testid={`apply-template-${template.id}`} disabled={applyTemplateMutation.isPending || !pipelineTargets.length} onClick={() => applyTemplateMutation.mutate({ templateId: template.id, channelId: targetChannel, pipelineName: (pipelineNames[template.id] ?? template.name).trim() })} className="rounded-lg bg-[#2d9478] px-3 py-2 text-[14px] font-bold text-white disabled:opacity-50">Pakai</button></div></div>)}</div>{appliedMessage && <p role="status" className="mt-3 rounded-xl bg-[#f0faf5] px-3 py-2 text-[14px] font-semibold text-[#2b836b]">{appliedMessage}</p>}</section><section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon bg-[#dff4eb] text-[#2c8a70]"><Zap className="h-4 w-4" /></span><div><h2>Automasi aktif</h2><p>Perintah yang sudah disimpan</p></div></div>{automations.length ? automations.map((automation) => <div key={automation.id} className="rounded-xl border border-[#e1eee8] bg-[#fbfefc] p-3"><p className="text-[14px] font-bold text-[#34433e]">{automation.name}</p><p className="mt-1 text-[14px] text-[#7e8b86]">{automation.description}</p></div>) : <div className="rounded-xl bg-[#f6faf8] p-3 text-[14px] text-[#7e8b86]">Belum ada automasi tersimpan.</div>}</section><section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon bg-[#e8eef8] text-[#5e75a7]"><Activity className="h-4 w-4" /></span><div><h2>Riwayat eksekusi</h2><p>Jejak kerja automasi yang sudah berjalan</p></div></div>{automationRuns.length ? automationRuns.slice(0, 5).map((run) => <div key={run.id} className="rounded-xl border border-[#e1eee8] bg-[#fbfefc] p-3"><div className="flex items-center justify-between"><p className="text-[14px] font-bold text-[#34433e]">Run #{run.id}</p><span className="rounded-full bg-[#e3f4ec] px-2 py-1 text-[14px] font-bold text-[#2b836b]">{run.status}</span></div><p className="mt-1 text-[14px] leading-5 text-[#7e8b86]">{run.output}</p></div>) : <div className="rounded-xl bg-[#f6faf8] p-3 text-[14px] text-[#7e8b86]">Belum ada eksekusi tersimpan.</div>}</section><HelpCenterPanel /><section className="settings-card"><button type="button" onClick={() => void logout().then(() => toast.success("Kamu sudah keluar dari workspace."))} className="logout-row"><LogOut className="h-4 w-4" /> Keluar dari workspace</button></section></div></div></div>;
}

function WorkspaceApp() {
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatRecord[]>(() => seedChats());
  const [selectedId, setSelectedId] = useState<ChannelId>("assistant");
  const [search, setSearch] = useState("");
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState("");
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [iconTourOpen, setIconTourOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [persona, setPersona] = useState("");
  const [autoOnboardingOpened, setAutoOnboardingOpened] = useState(false);
  const [view, setView] = useState<"chat" | "settings" | "finance" | "inventory" | "crm">("chat");
  const [showSidebar, setShowSidebar] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState<Record<ChannelId, Attachment[]>>({});
  const [localAutomations, setLocalAutomations] = useState<AutomationRecord[]>([]);
  const [input, setInput] = useState("");
  const [messageCursor, setMessageCursor] = useState<number | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setChatSearchOpen(true);
        setChatMenuOpen(false);
        setView("chat");
        window.setTimeout(() => document.querySelector<HTMLInputElement>('[placeholder="Cari pesan di percakapan ini"]')?.focus(), 0);
      }
      if (event.key === "Escape") {
        setChatMenuOpen(false);
        setSidebarMenuOpen(false);
        setChatSearchOpen(false);
        setDetailsOpen(false);
        setIconTourOpen(false);
        if (!showSidebar) setShowSidebar(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSidebar]);
  const replyMutation = trpc.sakuAi.reply.useMutation();
  const workspaceUtils = trpc.useUtils();
  const { data: persistedMessagesData, isLoading: messagesLoading } = trpc.workspace.messages.list.useQuery({ channelId: selectedId, limit: 100, cursor: messageCursor }, { enabled: Boolean(user) });
  const persistedMessages = useMemo(() => Array.isArray(persistedMessagesData) ? persistedMessagesData : persistedMessagesData?.items ?? [], [persistedMessagesData]);
  const nextMessageCursor = Array.isArray(persistedMessagesData) ? null : persistedMessagesData?.nextCursor;
  const saveMessageMutation = trpc.workspace.messages.save.useMutation({ onError: () => toast.error("Pesan belum tersimpan di riwayat. Coba lagi sebentar.") });
  const { data: workspaceProfile, isLoading: workspaceProfileLoading } = trpc.workspace.profile.get.useQuery(undefined, { enabled: Boolean(user) });
  const { mutate: saveWorkspaceProfile } = trpc.workspace.profile.update.useMutation({ onError: () => toast.error("Perubahan workspace belum tersimpan. Coba lagi sebentar.") });
  const [profileHydrated, setProfileHydrated] = useState(false);
  useEffect(() => {
    if (!user || workspaceProfileLoading) return;
    setBusinessName(workspaceProfile?.businessName || "");
    setPersona(workspaceProfile?.persona || "");
    setProfileHydrated(true);
  }, [user?.openId, workspaceProfile, workspaceProfileLoading]);
  useEffect(() => {
    if (!user || workspaceProfileLoading || !profileHydrated || autoOnboardingOpened) return;
    if (!workspaceProfile?.businessName) {
      setOnboardingOpen(true);
      setAutoOnboardingOpened(true);
    }
  }, [autoOnboardingOpened, profileHydrated, user, workspaceProfile?.businessName, workspaceProfileLoading]);
  useEffect(() => {
    if (!profileHydrated || !user || !businessName.trim()) return;
    const timer = window.setTimeout(() => saveWorkspaceProfile({ businessName: businessName.trim(), persona: persona.trim() || undefined }), 500);
    return () => window.clearTimeout(timer);
  }, [businessName, persona, profileHydrated, saveWorkspaceProfile, user]);
  const onboardingPrepareMutation = trpc.workspace.onboarding.prepare.useMutation({
    onSuccess: (result) => {
      setBusinessName(result.businessName);
      setPersona(result.persona);
      setOnboardingOpen(false);
      setIconTourOpen(true);
      void Promise.all([
        workspaceUtils.workspace.snapshot.invalidate(),
        workspaceUtils.workspace.employeeContext.invalidate(),
        workspaceUtils.workspace.divisions.list.invalidate(),
        workspaceUtils.workspace.automations.list.invalidate(),
        workspaceUtils.workspace.automationRuns.list.invalidate(),
      ]);
      toast.success(`Workspace siap. ${result.plan.teams.length} tim AI, pipeline, dan automasi sudah disiapkan.`);
    },
    onError: () => toast.error("Onboarding belum selesai. Data yang sudah diisi tetap aman—periksa isian lalu coba lagi."),
  });
  const uploadMutation = trpc.storage.upload.useMutation();
  const { data: persistedDivisions = [], isLoading: divisionsLoading } = trpc.workspace.divisions.list.useQuery(undefined, { enabled: Boolean(user) });
  const { data: persistedAutomations = [] } = trpc.workspace.automations.list.useQuery(undefined, { enabled: Boolean(user) });
  const { data: pipelineTemplates = [] } = trpc.workspace.pipelineTemplates.list.useQuery(undefined, { enabled: Boolean(user) });
  const { data: workspaceSnapshot, isLoading: snapshotLoading } = trpc.workspace.snapshot.useQuery(undefined, { enabled: Boolean(user) });
  const { data: automationRuns = [] } = trpc.workspace.automationRuns.list.useQuery(undefined, { enabled: Boolean(user) });
  const automations = useMemo<AutomationRecord[]>(() => [...persistedAutomations, ...localAutomations].filter((automation, index, all) => all.findIndex((candidate) => candidate.id === automation.id) === index), [persistedAutomations, localAutomations]);
  const { data: storedFiles = [], isLoading: filesLoading } = trpc.storage.list.useQuery({ channelId: selectedId }, { enabled: Boolean(user) });
  const persistedAttachments = useMemo<Attachment[]>(() => storedFiles.map((file) => ({
    name: file.fileName,
    type: file.mimeType.includes("image") ? "image" : file.mimeType.includes("sheet") || file.fileName.endsWith(".xlsx") ? "excel" : file.mimeType.includes("pdf") ? "pdf" : file.mimeType.includes("word") ? "word" : "other",
    size: `${Math.max(1, Math.round(file.fileSize / 1024))} KB`,
    url: file.storageUrl,
    extractionStatus: file.extractionStatus,
    extractionPreview: file.structuredPreview || undefined,
    extractedText: file.extractedText || undefined,
    detectedKind: file.detectedKind,
    understanding: file.structuredPreview || undefined,
  })), [storedFiles]);
  const selectedChat = chats.find((chat) => chat.id === selectedId) ?? chats[0];
  const { data: activeEmployeeContext, isLoading: employeeLoading } = trpc.workspace.employeeContext.useQuery({ channelId: selectedId }, { enabled: Boolean(user) });
  const selectedAgent = useMemo<AgentContext>(() => {
    const fallback = getAgentContext(selectedId, selectedChat.title);
    const workspaceLabel = workspaceSnapshot ? `Workspace: ${workspaceSnapshot.divisions} divisi · ${workspaceSnapshot.files} dokumen · ${workspaceSnapshot.automations} automasi · ${workspaceSnapshot.pipelines} pipeline` : undefined;
    if (!activeEmployeeContext?.agent) return workspaceLabel ? { ...fallback, dataAccess: [...fallback.dataAccess, workspaceLabel] } : fallback;
    return { ...fallback, name: activeEmployeeContext.agent.name, role: activeEmployeeContext.agent.roleTitle, avatarClass: activeEmployeeContext.agent.avatarClass, skills: safeJsonArray(activeEmployeeContext.agent.skillsText, fallback.skills), dataAccess: [...safeJsonArray(activeEmployeeContext.agent.dataAccessText, fallback.dataAccess), ...(workspaceLabel ? [workspaceLabel] : [])], memory: activeEmployeeContext.memories?.length ? activeEmployeeContext.memories.map((item) => item.memory) : fallback.memory, pipeline: activeEmployeeContext.pipelines?.[0]?.stepsText ? safeJsonArray(activeEmployeeContext.pipelines[0].stepsText, fallback.pipeline.split(" → ")).join(" → ") : fallback.pipeline, currentStep: activeEmployeeContext.pipelines?.[0]?.currentStep || fallback.currentStep, automation: activeEmployeeContext.automations?.[0]?.name || fallback.automation };
  }, [activeEmployeeContext, selectedChat.title, selectedId, workspaceSnapshot]);
  const visibleMessages = useMemo(() => selectedChat.messages.filter((message) => !chatQuery.trim() || message.text?.toLowerCase().includes(chatQuery.toLowerCase())), [chatQuery, selectedChat.messages]);
  const quickPrompts = selectedId === "assistant"
    ? ["Susun prioritas hari ini", "Ringkas pekerjaan minggu ini", "Tambah tim kerja"]
    : [`Susun fokus ${selectedChat.title.replace(/^Tim\s+/i, "")} hari ini`, "Buat ringkasan progres", "Tunjukkan risiko utama"];
  const workspaceLoading = Boolean(user) && (divisionsLoading || filesLoading || snapshotLoading || employeeLoading);
  const loadingStages: LoadingStage[] = [
    { label: "Tim", state: divisionsLoading ? "active" : "done" },
    { label: "Dokumen", state: divisionsLoading ? "pending" : filesLoading ? "active" : "done" },
    { label: "Konteks AI", state: divisionsLoading || filesLoading ? "pending" : employeeLoading ? "active" : "done" },
  ];
  const userName = user?.name || "Pemilik bisnis";
  const restoreMessage = (row: { messageKey: string; sender: MessageSender; senderName: string | null; senderRole: string | null; content: string | null; attachmentJson: string | null; createdAt: Date }) => {
    let attachment: Attachment | undefined;
    try { attachment = row.attachmentJson ? JSON.parse(row.attachmentJson) as Attachment : undefined; } catch { attachment = undefined; }
    return { id: row.messageKey, sender: row.sender, senderName: row.senderName || undefined, senderRole: row.senderRole || undefined, text: row.content || undefined, attachment, time: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(row.createdAt)) } satisfies ChatMessage;
  };
  const saveMessage = (channelId: ChannelId, message: ChatMessage) => {
    const attachment = message.attachment;
    const attachmentMetadata = attachment ? { name: attachment.name, type: attachment.type, size: attachment.size, url: attachment.url, extractionStatus: attachment.extractionStatus, extractionPreview: attachment.extractionPreview, detectedKind: attachment.detectedKind, understanding: attachment.understanding } : undefined;
    saveMessageMutation.mutate({ channelId, message: { messageKey: message.id, sender: message.sender, senderName: message.senderName, senderRole: message.senderRole, content: message.text, attachmentJson: attachmentMetadata ? JSON.stringify(attachmentMetadata) : undefined } });
  };
  useEffect(() => {
    if (!persistedDivisions.length) return;
    setChats((current) => {
      const existing = new Set(current.map((chat) => chat.id));
      const additions = persistedDivisions.filter((division) => !existing.has(division.channelId));
      return additions.reduce((next, division) => mergeDivisionChatList(next, division), current);
    });
  }, [persistedDivisions]);
  useEffect(() => { setMessageCursor(undefined); }, [selectedId]);
  useEffect(() => {
    if (messagesLoading) return;
    const restored = persistedMessages.map(restoreMessage);
    if (!restored.length) return;
    setChats((current) => current.map((chat) => {
      if (chat.id !== selectedId || !restored.length) return chat;
      const merged = new Map([...chat.messages, ...restored].map((message) => [message.id, message]));
      return { ...chat, messages: Array.from(merged.values()), preview: restored.at(-1)?.text || restored.at(-1)?.attachment?.name || chat.preview, time: restored.at(-1)?.time || chat.time };
    }));
  }, [messagesLoading, persistedMessages, selectedId]);
  const filteredChats = useMemo(() => chats.filter((chat) => `${chat.title} ${chat.preview}`.toLowerCase().includes(search.toLowerCase())), [chats, search]);

  const appendMessage = (channelId: ChannelId, message: ChatMessage) => {
    setChats((current) => current.map((chat) => chat.id === channelId ? { ...chat, messages: [...chat.messages, message], preview: message.text || message.attachment?.name || chat.preview, time: message.time, unread: 0 } : chat));
  };

  const handleSend = (value = input, attachmentContext?: Attachment) => {
    if (!user) { toast.info("Masuk dulu untuk mengobrol dengan tim SAKU AI."); startLogin(); return; }
    const text = value.trim();
    if (!text || replyMutation.isPending) return;
    const ownerMessage: ChatMessage = { id: makeId("owner"), sender: "owner", senderName: userName, text, time: nowTime() };
    appendMessage(selectedId, ownerMessage);
    saveMessage(selectedId, ownerMessage);
    setInput("");
    const currentMessages = [...selectedChat.messages, ownerMessage].slice(-10).map((message) => ({ role: message.sender === "owner" ? "user" as const : "assistant" as const, content: message.text || (message.attachment ? `File terlampir: ${message.attachment.name}\n${message.attachment.extractedText || message.attachment.extractionPreview || "Tidak ada teks yang terbaca."}` : "Dokumen terlampir") }));
    if (attachmentContext) currentMessages.push({ role: "user", content: `File yang baru dikirim: ${attachmentContext.name}\nJenis: ${attachmentContext.detectedKind || attachmentContext.type}\n${attachmentContext.extractedText || attachmentContext.extractionPreview || "Tidak ada teks yang terbaca; gunakan nama file dan metadata untuk menjelaskan kemungkinan kegunaannya."}`.slice(0, 4000) });
    replyMutation.mutate({ channel: selectedId, teamName: selectedChat.title, businessName: businessName.trim() || "Bisnismu", persona: persona.trim() || undefined, agentName: selectedAgent.name, agentRole: selectedAgent.role, skills: selectedAgent.skills, memory: selectedAgent.memory, dataAccess: selectedAgent.dataAccess, pipeline: selectedAgent.pipeline, automation: selectedAgent.automation, history: currentMessages }, {
      onSuccess: (response) => {
        const createResult = response.toolResults?.find((result) => result.toolName === "create_division") as { division?: { id: number; channelId: string; name: string; businessArea: string; description: string; avatarClass: string } } | undefined;
        if (createResult?.division) {
          const createdChat = makeCustomChat(createResult.division);
          setChats((current) => mergeDivisionChatList(current, createResult.division!));
          toast.success(`${createdChat.title} sudah ditambahkan ke Tim divisi.`);
        }
        const actionResult = response.toolResults?.[0] as { toolName?: string; automation?: AutomationRecord; caption?: string; imageUrl?: string; platform?: "instagram" | "twitter" | "general" } | undefined;
        const createdAutomation = actionResult?.automation;
        if (actionResult?.toolName === "create_automation" && createdAutomation) setLocalAutomations((current) => current.some((automation) => automation.id === createdAutomation.id) ? current : [...current, createdAutomation]);
        const actionLabel = actionResult?.toolName === "create_division" ? "Divisi dibuat dan disimpan" : actionResult?.toolName === "create_automation" ? "Automasi dibuat dan diaktifkan" : actionResult?.toolName === "list_divisions" ? "Daftar divisi diperbarui" : actionResult?.toolName === "list_automations" ? "Daftar automasi diperbarui" : actionResult?.toolName === "advance_pipeline" ? "Progress pipeline diperbarui" : actionResult?.toolName === "record_finance_transaction" ? "Transaksi diproses ke Jurnal Finance" : actionResult?.toolName === "generate_image" ? "Visual dibuat dan dilampirkan" : actionResult?.toolName === "generate_video" ? "Video dibuat dan dilampirkan" : actionResult?.toolName === "generate_voice_note" ? "Voice note dibuat dan dilampirkan" : actionResult?.toolName === "generate_content_package" ? "Paket konten siap direview" : undefined;
        const generatedMedia = (actionResult as { attachment?: { url?: string; name?: string; type?: string; mimeType?: string } } | undefined)?.attachment;
        const generatedAttachment = generatedMedia?.url && ["image", "video", "audio"].includes(generatedMedia.type || "") ? ({ name: generatedMedia.name || "Media SAKU AI", type: generatedMedia.type as Attachment["type"], url: generatedMedia.url } as Attachment) : undefined;
        const contentPackage = actionResult?.toolName === "generate_content_package" && actionResult.caption && actionResult.platform ? { caption: actionResult.caption, imageUrl: actionResult.imageUrl, platform: actionResult.platform } : undefined;
        const replyMessage: ChatMessage = { id: makeId("reply"), sender: selectedId === "assistant" ? "assistant" : "agent", senderName: response.senderName, senderRole: response.senderRole, text: response.content, actionLabel, contentPackage, attachment: generatedAttachment, time: nowTime() };
        appendMessage(selectedId, replyMessage);
        saveMessage(selectedId, replyMessage);
      },
      onError: () => {
        const errorMessage: ChatMessage = { id: makeId("reply"), sender: selectedId === "assistant" ? "assistant" : "agent", senderName: selectedId === "assistant" ? "Dita" : selectedChat.members[0]?.name, senderRole: selectedId === "assistant" ? "Asisten Pribadi" : selectedChat.members[0]?.role, text: "Aku catat dulu ya, Kak. Koneksi ke tim sedang kurang stabil, tapi pesanmu tidak hilang. Coba kirim lagi sebentar lagi.", time: nowTime() };
        appendMessage(selectedId, errorMessage);
        saveMessage(selectedId, errorMessage);
        toast.error("Balasan tim belum tersedia. Coba beberapa saat lagi.");
      },
    });
  };

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!user) { toast.info("Masuk dulu untuk mengunggah dokumen ke workspace."); startLogin(); return; }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Ukuran file maksimal 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result);
        const uploaded = await uploadMutation.mutateAsync({ channelId: selectedId, fileName: file.name, mimeType: file.type || "application/octet-stream", dataUrl });
        const type: Attachment["type"] = file.type.includes("image") ? "image" : file.type.includes("sheet") || file.name.endsWith(".xlsx") ? "excel" : file.type.includes("pdf") ? "pdf" : file.type.includes("word") ? "word" : "other";
        const attachment = { name: file.name, type, size: `${Math.max(1, Math.round(file.size / 1024))} KB`, url: uploaded.url, extractionStatus: uploaded.extractionStatus, extractionPreview: uploaded.extractionPreview, extractedText: uploaded.extractedText, detectedKind: uploaded.detectedKind, understanding: uploaded.understanding } as Attachment;
        setUploadedFiles((current) => ({ ...current, [selectedId]: [...(current[selectedId] ?? []), attachment] }));
        const documentMessage: ChatMessage = { id: makeId("document"), sender: "owner", senderName: userName, attachment, time: nowTime() };
        appendMessage(selectedId, documentMessage);
        saveMessage(selectedId, documentMessage);
        toast.success("File berhasil ditambahkan. Dita sedang memahami isi dan kegunaannya.");
        handleSend(`Tolong jelaskan file ${file.name}: isinya apa, berguna untuk apa, dan apa langkah berikutnya.`, attachment);
      } catch { toast.error("Dokumen belum bisa diunggah. Coba lagi."); }
    };
    reader.readAsDataURL(file);
  };

  const selectChat = (id: ChannelId) => { setSelectedId(id); setDetailsOpen(false); setView("chat"); setShowSidebar(false); };

  return (
    <main className="saku-page">
      <a className="skip-link" href="#workspace-main">Lewati ke ruang kerja</a>
      <div className="workspace-frame">
        <section className={`workspace-sidebar ${showSidebar ? "workspace-sidebar-visible" : ""}`}>
          <div className="sidebar-header"><div className="brand-lockup"><span className="brand-mark">S</span><span><strong>SAKU</strong><small>AI workspace</small></span></div><div className="relative flex items-center gap-1"><IconButton tourId="tour-new-chat" label="Mulai chat baru" onClick={() => { setSelectedId("assistant"); setView("chat"); setShowSidebar(false); }}><PenLine className="h-[17px] w-[17px]" /></IconButton><IconButton label="Buka menu" onClick={() => setSidebarMenuOpen((open) => !open)} active={sidebarMenuOpen}><MoreHorizontal className="h-[18px] w-[18px]" /></IconButton>{sidebarMenuOpen && <div className="sidebar-menu"><button onClick={() => { setView("settings"); setSidebarMenuOpen(false); setShowSidebar(false); }}><Settings className="h-4 w-4" /> Pengaturan</button><button onClick={() => { setView("finance"); setSidebarMenuOpen(false); setShowSidebar(false); }}><Banknote className="h-4 w-4" /> Review Finance</button><button onClick={() => { setView("inventory"); setSidebarMenuOpen(false); setShowSidebar(false); }}><Package className="h-4 w-4" /> Inventory</button><button onClick={() => { setView("crm"); setSidebarMenuOpen(false); setShowSidebar(false); }}><Users className="h-4 w-4" /> CRM</button><button onClick={() => { setOnboardingOpen(true); setSidebarMenuOpen(false); }}><Sparkles className="h-4 w-4" /> Mulai onboarding</button><button onClick={() => { setIconTourOpen(true); setSidebarMenuOpen(false); }}><CircleHelp className="h-4 w-4" /> Pelajari ikon penting</button><button onClick={() => toast("Arsip divisi akan tersedia setelah workspace tersambung.")}><Archive className="h-4 w-4" /> Arsipkan grup</button></div>}</div></div>
          <div className="sidebar-search" data-tour="tour-search"><Search className="h-4 w-4 text-[#9aa49f]" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari tim atau percakapan" aria-label="Cari tim atau percakapan" /><kbd aria-label="Pintasan keyboard Command K">⌘ K</kbd></div>
          <nav className="workspace-shortcuts" aria-label="Navigasi workspace">
            <button type="button" onClick={() => { selectChat("assistant"); }} className={view === "chat" && selectedId === "assistant" ? "workspace-shortcut-active" : ""} aria-current={view === "chat" && selectedId === "assistant" ? "page" : undefined}><MessageCircle className="h-4 w-4" aria-hidden="true" /><span><strong>Ruang kerja</strong><small>Tulis pekerjaan yang ingin dirapikan</small></span></button>
            <button type="button" onClick={() => { setView("finance"); setShowSidebar(false); }} className={view === "finance" ? "workspace-shortcut-active" : ""} aria-current={view === "finance" ? "page" : undefined}><Banknote className="h-4 w-4" aria-hidden="true" /><span><strong>Keuangan</strong><small>Tagihan dan transaksi</small></span></button>
            <button type="button" onClick={() => { setView("inventory"); setShowSidebar(false); }} className={view === "inventory" ? "workspace-shortcut-active" : ""} aria-current={view === "inventory" ? "page" : undefined}><Package className="h-4 w-4" aria-hidden="true" /><span><strong>Stok</strong><small>Barang dan persediaan</small></span></button>
            <button type="button" onClick={() => { setView("crm"); setShowSidebar(false); }} className={view === "crm" ? "workspace-shortcut-active" : ""} aria-current={view === "crm" ? "page" : undefined}><Users className="h-4 w-4" aria-hidden="true" /><span><strong>Pelanggan</strong><small>Kontak dan penjualan</small></span></button>
            <button type="button" onClick={() => { setView("settings"); setShowSidebar(false); }} className={view === "settings" ? "workspace-shortcut-active" : ""} aria-current={view === "settings" ? "page" : undefined}><Settings className="h-4 w-4" aria-hidden="true" /><span><strong>Pengaturan</strong><small>Profil, anggota, dan koneksi</small></span></button>
            <button type="button" onClick={() => setIconTourOpen(true)}><CircleHelp className="h-4 w-4" aria-hidden="true" /><span><strong>Bantuan</strong><small>Cara memakai ruang kerja</small></span></button>
          </nav>
          <div className="sidebar-scroll"><p className="sidebar-label">Disematkan</p><button type="button" onClick={() => selectChat("assistant")} className={`assistant-pinned ${selectedId === "assistant" && view === "chat" ? "assistant-pinned-selected" : ""}`}><Avatar initials="D" avatarClass="bg-[#ccebdd] text-[#18775f]" size="md" online /><span className="min-w-0 flex-1"><span className="flex items-center justify-between"><span className="truncate text-[14px] font-bold text-[#243631]">Dita</span><Star className="h-3.5 w-3.5 fill-[#e6b65e] text-[#e6b65e]" aria-label="Ruang utama" /></span><span className="mt-1 block truncate text-[14px] text-[#5b8f7e]">Pendamping kerja · ruang utama</span></span></button><div className="sidebar-divider" /><div className="flex items-center justify-between px-2 pb-2"><p className="sidebar-label mb-0">Tim divisi</p><button type="button" onClick={() => toast("Chat Dita untuk membuat tim baru.")} aria-label="Buat tim baru" className="rounded-lg p-1 text-[#9ca6a2] hover:bg-[#eef4f1] hover:text-[#2b876f]"><Plus className="h-4 w-4" /></button></div>{workspaceLoading ? <WorkspaceLoadingSkeleton compact /> : <div className="space-y-0.5">{filteredChats.filter((chat) => chat.id !== "assistant").map((chat) => <ChatListItem key={chat.id} chat={chat} selected={chat.id === selectedId && view === "chat"} onClick={() => selectChat(chat.id)} />)}{!filteredChats.filter((chat) => chat.id !== "assistant").length && <div className="sidebar-empty">{search.trim() ? <><Search className="h-4 w-4" /><strong>Tim tidak ditemukan</strong><span>Coba kata kunci lain.</span></> : <><Users className="h-4 w-4" /><strong>Belum ada tim divisi</strong><span>Chat Dita untuk membuat tim pertama.</span></>}</div>}</div>}<button type="button" className="sidebar-tip" onClick={() => { selectChat("assistant"); setInput("Buatkan tim baru untuk bisnis saya"); window.setTimeout(() => composerInputRef.current?.focus(), 0); }}><span className="tip-icon"><Zap className="h-4 w-4" aria-hidden="true" /></span><span><p>Tambah tim kerja</p><span>Minta Dita menyiapkannya.</span></span><ChevronRight className="ml-auto h-4 w-4 text-[#84aa9d]" aria-hidden="true" /></button></div>
          <div className="sidebar-footer"><div className="profile-mini"><Avatar initials={userName.slice(0, 1).toUpperCase()} avatarClass="bg-[#f2d9c3] text-[#a4612e]" size="sm" online /><span className="min-w-0"><strong className="block truncate text-[14px] text-[#31413c]">{userName}</strong><small className="block truncate text-[14px] text-[#96a09c]">Pemilik {businessName.trim() || "Bisnismu"}</small></span><button onClick={() => { setView("settings"); setShowSidebar(false); }} aria-label="Pengaturan akun" title="Pengaturan akun" className="ml-auto rounded-lg p-1.5 text-[#8b9893] hover:bg-[#eff4f1]"><Settings className="h-4 w-4" /></button></div></div>
        </section>
        <section id="workspace-main" aria-busy={workspaceLoading || replyMutation.isPending} className={`workspace-main ${detailsOpen ? "workspace-main-with-details" : ""} ${!showSidebar ? "workspace-main-mobile-visible" : ""}`} tabIndex={-1}>
          {view === "finance" ? <FinanceReviewPage onBack={() => setView("chat")} /> : view === "inventory" ? <InventoryPage onBack={() => setView("chat")} /> : view === "crm" ? <CrmPage onBack={() => setView("chat")} /> : view === "settings" ? <SettingsView onBack={() => setView("chat")} userName={userName} businessName={businessName} onBusinessNameChange={setBusinessName} persona={persona} onPersonaChange={setPersona} automations={automations} automationRuns={automationRuns as AutomationRunRecord[]} pipelineTemplates={pipelineTemplates as PipelineTemplate[]} pipelineTargets={persistedDivisions.map((division) => ({ channelId: division.channelId, title: division.name }))} /> : <>
            <header className="chat-header"><div className="flex min-w-0 items-center gap-3"><button onClick={() => setShowSidebar(true)} className="mobile-back-button" aria-label="Kembali ke daftar chat"><ArrowLeft className="h-4 w-4" /></button><Avatar initials={selectedAgent.name.slice(0, 2).toUpperCase()} avatarClass={selectedAgent.avatarClass || selectedChat.avatarClass} size="md" online={selectedChat.id === "assistant" || selectedChat.id === "marketing" || selectedId.startsWith("custom-")} /><div className="min-w-0"><h1 className="truncate text-[15px] font-bold text-[#283732]">{selectedAgent.name} · {selectedAgent.role}</h1><p className={`mt-0.5 truncate text-[14px] ${selectedChat.typing ? "font-semibold text-[#2b8b73]" : "text-[#8e9995]"}`}>{selectedChat.typing ? "sedang mengetik…" : `online · bertanggung jawab atas ${selectedChat.title}`}</p></div></div><div className="relative flex items-center gap-1"><IconButton tourId="tour-search" label="Cari dalam chat" onClick={() => { setChatSearchOpen((open) => !open); setChatMenuOpen(false); }} active={chatSearchOpen}><Search className="h-[17px] w-[17px]" /></IconButton><IconButton tourId="tour-info" label="Buka info percakapan" onClick={() => setDetailsOpen(true)} active={detailsOpen}><Info className="h-[17px] w-[17px]" /></IconButton><IconButton tourId="tour-menu" label="Menu percakapan" onClick={() => { setChatMenuOpen((open) => !open); setChatSearchOpen(false); }} active={chatMenuOpen}><MoreHorizontal className="h-[18px] w-[18px]" /></IconButton>{chatMenuOpen && <div className="sidebar-menu right-0 top-10"><button type="button" onClick={() => { setChats((current) => current.map((chat) => chat.id === selectedId ? { ...chat, unread: 0 } : chat)); setChatMenuOpen(false); toast.success("Percakapan ditandai sudah dibaca."); }}><Check className="h-4 w-4" /> Tandai sudah dibaca</button><button type="button" onClick={() => { setInput(""); setChatMenuOpen(false); toast.success("Draft pesan dibersihkan."); }}><X className="h-4 w-4" /> Bersihkan draft</button></div>}</div></header>
            {chatSearchOpen && <div className="border-b border-[#e7efeb] bg-white px-5 py-2"><input autoFocus value={chatQuery} onChange={(event) => setChatQuery(event.target.value)} placeholder="Cari pesan di percakapan ini" className="soft-input w-full" /></div>}
            <div className="agent-context-strip" data-testid="agent-context-strip"><div className="agent-context-main"><span className="agent-context-status" /><div><p>{selectedAgent.name} · {selectedAgent.role}</p><span>{workspaceLoading ? "sedang menyiapkan konteks kerja…" : `AI employee aktif · ${selectedAgent.pipeline}`}</span></div></div><div className="agent-context-chips">{selectedAgent.skills.map((skill) => <span key={skill}>{skill}</span>)}<span className="agent-context-chip-memory">Memory tersimpan</span><span>Data: {selectedAgent.dataAccess.join(" · ")}</span></div></div>
            {workspaceLoading && <WorkspaceLoadingSkeleton stages={loadingStages} />}
            {!chatQuery.trim() && !visibleMessages.length && <WorkspaceGuide onStart={() => setOnboardingOpen(true)} onOpenSettings={() => { setView("settings"); setShowSidebar(false); }} hasBusinessName={Boolean(businessName.trim())} />}
            <div className="chat-canvas"><div className="chat-day-divider"><span>Hari ini</span></div><div className="chat-messages">{nextMessageCursor && <button type="button" onClick={() => setMessageCursor(nextMessageCursor)} className="secondary-button mx-auto mb-3 justify-center text-[14px]">Muat riwayat lebih lama</button>}{visibleMessages.map((message) => <MessageBubble key={message.id} message={message} />)}{!chatQuery.trim() && !visibleMessages.length && <div className="conversation-empty-state"><Sparkles className="h-5 w-5" /><strong>Belum ada pesan di sini</strong><span>Tulis kebutuhanmu di bawah untuk memulai percakapan dengan {selectedAgent.name}.</span></div>}{chatQuery.trim() && !visibleMessages.length && <div className="search-empty-state"><Search className="h-5 w-5" /><strong>Tidak ada pesan yang cocok</strong><span>Coba kata kunci lain atau bersihkan pencarian.</span></div>}{replyMutation.isPending && <div className="message-row justify-start"><span className="message-avatar bg-[#d8efe6] text-[#1c806b]">{selectedId === "assistant" ? "D" : selectedChat.members[0]?.initials}</span><div className="message-stack items-start"><span className="mb-1 px-1 text-[14px] font-semibold text-[#4b8b7a]">{selectedId === "assistant" ? "Dita" : selectedChat.members[0]?.name} <span className="font-normal text-[#9aa29f]">sedang mengetik…</span></span><div className="typing-bubble"><span /><span /><span /></div></div></div>}</div></div>
            <div className="composer-wrap">{!chatQuery.trim() && !visibleMessages.length && <div className="quick-prompts" aria-label="Saran untuk memulai"><span className="quick-prompts-label">Mulai dari</span>{quickPrompts.map((prompt) => <button type="button" key={prompt} className="quick-prompt" onClick={() => { setInput(prompt); composerInputRef.current?.focus(); }}>{prompt}</button>)}</div>}<div className="composer"><input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} accept="*/*" /><button type="button" data-tour="tour-attach" onClick={() => fileInputRef.current?.click()} aria-label={uploadMutation.isPending ? "Sedang mengunggah file" : "Lampirkan file apa pun"} aria-busy={uploadMutation.isPending} className="composer-icon" disabled={uploadMutation.isPending || !user}>{uploadMutation.isPending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Paperclip className="h-[18px] w-[18px]" />}</button><input ref={composerInputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); handleSend(); } }} placeholder={selectedId === "assistant" ? "Tulis pesan ke Dita…" : `Tulis pesan ke ${selectedChat.title}…`} /><button type="button" data-tour="tour-send" aria-label={replyMutation.isPending ? "Dita sedang menyiapkan jawaban" : "Kirim pesan"} aria-busy={replyMutation.isPending} onClick={() => handleSend()} disabled={!input.trim() || replyMutation.isPending} className="composer-send">{replyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div><div className="composer-hint"><span><ShieldCheck className="h-3 w-3" /> Data workspace privat</span><span>Enter untuk kirim</span></div></div>
          </>}
        </section>
        {detailsOpen && view === "chat" && <DetailsPanel chat={selectedChat} onClose={() => setDetailsOpen(false)} onManageMembers={() => { setView("settings"); setDetailsOpen(false); setShowSidebar(false); }} uploadedFiles={[...persistedAttachments, ...(uploadedFiles[selectedId] ?? [])]} />}
      </div>
      {onboardingOpen && <OnboardingModal onClose={() => onboardingPrepareMutation.isPending ? undefined : setOnboardingOpen(false)} initialBusinessName={businessName.trim() || "Bisnismu"} isSaving={onboardingPrepareMutation.isPending} onFinish={(interview) => { if (!user) { startLogin(); return; } onboardingPrepareMutation.mutate(interview); }} />}
      <IconTour open={iconTourOpen} onClose={() => setIconTourOpen(false)} />
    </main>
  );
}

function WorkspaceInvitationGate() {
  const { user } = useAuth();
  const { data: pendingInvitations = [] } = trpc.workspace.invitations.pending.useQuery(undefined, { enabled: Boolean(user) });
  if (user && pendingInvitations.length) return <PendingInvitationScreen invitations={pendingInvitations} />;
  return <WorkspaceApp />;
}

function WorkspaceEntry() {
  const workspaceRouter = trpc.workspace as unknown as { invitations?: unknown };
  return workspaceRouter.invitations ? <WorkspaceInvitationGate /> : <WorkspaceApp />;
}

export default function Home() {
  const { user, loading, error } = useAuth();
  const [loginStarting, setLoginStarting] = useState(false);
  const handleLogin = () => {
    setLoginStarting(true);
    try {
      startLogin();
    } catch {
      setLoginStarting(false);
      toast.error("Login belum tersedia. Coba muat ulang halaman.");
    }
  };
  if (loading) return <main className="saku-page flex items-center justify-center p-6"><WorkspaceLoadingSkeleton /></main>;
  if (!user) return <PublicWelcome onLogin={handleLogin} loading={loginStarting} error={error} />;
  return <WorkspaceEntry />;
}
