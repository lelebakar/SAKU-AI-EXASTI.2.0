import { storagePut } from "../storage";
import { ENV } from "./env";

function forgeUrl(path: string) {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) throw new Error("Media generation is not configured");
  return new URL(path, ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`).toString();
}

async function requestJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(forgeUrl(path), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "connect-protocol-version": "1", authorization: `Bearer ${ENV.forgeApiKey}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Media generation failed (${response.status} ${response.statusText})`);
  return response.json() as Promise<Record<string, any>>;
}

async function persistEncodedMedia(result: Record<string, any>, prefix: string, extension: string, fallbackType: string) {
  const media = result.video || result.audio || result.file || result.image || result;
  const directUrl = media?.url || result.url;
  if (directUrl) return { url: directUrl, mimeType: media?.mimeType || result.mimeType || fallbackType };
  const encoded = media?.b64Json || media?.base64 || media?.data || result.b64Json || result.base64;
  if (typeof encoded !== "string" || !encoded) throw new Error("Media service returned no downloadable media");
  const buffer = Buffer.from(encoded.replace(/^data:[^;]+;base64,/, ""), "base64");
  const stored = await storagePut(`${prefix}/${Date.now()}.${extension}`, buffer, media?.mimeType || result.mimeType || fallbackType);
  return { url: stored.url, mimeType: media?.mimeType || result.mimeType || fallbackType };
}

export async function generateVideo(options: { prompt: string; storagePathPrefix?: string; durationSeconds?: number; portrait?: boolean }) {
  const result = await requestJson("video.v1.VideoService/GenerateVideo", {
    prompt: options.prompt,
    model: "gemini-omni-flash-preview",
    aspect_ratio: options.portrait ? "portrait" : "landscape",
    resolution: "720p",
    duration_seconds: options.durationSeconds ?? 8,
    generate_audio: true,
  });
  return persistEncodedMedia(result, options.storagePathPrefix || "generated-video", "mp4", "video/mp4");
}

export async function generateSpeech(options: { prompt: string; storagePathPrefix?: string; languageCode?: string }) {
  const result = await requestJson("audio.v1.AudioService/GenerateSpeech", {
    prompt: options.prompt.slice(0, 6000),
    voice_name: "Aoede",
    language_code: options.languageCode || "id-ID",
  });
  return persistEncodedMedia(result, options.storagePathPrefix || "generated-voice-notes", "wav", "audio/wav");
}
