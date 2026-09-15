const RESET_EMAIL_SUBJECT = "Reset password SAKU AI";

function getPublicOrigin(req: { protocol?: string; headers?: Record<string, unknown> }) {
  const forwardedHost = String(req.headers?.["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || String(req.headers?.host || "").trim();
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "https";
  return host ? `${protocol}://${host}` : "";
}

export async function sendPasswordResetEmail(input: { to: string; resetUrl: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, configured: false } as const;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: RESET_EMAIL_SUBJECT,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#2b3d37"><h2>Reset password SAKU AI</h2><p>Klik tombol berikut untuk membuat password baru. Link berlaku selama 30 menit dan hanya bisa dipakai satu kali.</p><p><a href="${input.resetUrl}" style="display:inline-block;background:#2b8b73;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Buat password baru</a></p><p>Kalau kamu tidak meminta reset password, abaikan email ini.</p></div>`,
    }),
  });
  if (!response.ok) throw new Error(`Reset email provider returned ${response.status}`);
  return { sent: true, configured: true } as const;
}

export { getPublicOrigin };
