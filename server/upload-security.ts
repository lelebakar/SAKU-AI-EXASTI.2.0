import { Buffer } from "node:buffer";

export const ALLOWED_UPLOAD_TYPES = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "application/pdf": "PDF",
  "text/csv": "CSV",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
} as const;

export type AllowedUploadMimeType = keyof typeof ALLOWED_UPLOAD_TYPES;

function hasPrefix(data: Buffer, prefix: number[]) {
  return data.length >= prefix.length && prefix.every((byte, index) => data[index] === byte);
}

function isZipContainer(data: Buffer) {
  return hasPrefix(data, [0x50, 0x4b, 0x03, 0x04]) || hasPrefix(data, [0x50, 0x4b, 0x05, 0x06]) || hasPrefix(data, [0x50, 0x4b, 0x07, 0x08]);
}

function signatureMatches(mimeType: AllowedUploadMimeType, data: Buffer) {
  switch (mimeType) {
    case "image/jpeg": return hasPrefix(data, [0xff, 0xd8, 0xff]);
    case "image/png": return hasPrefix(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp": return hasPrefix(data, [0x52, 0x49, 0x46, 0x46]) && data.subarray(8, 12).toString("ascii") === "WEBP";
    case "application/pdf": return data.subarray(0, 5).toString("ascii") === "%PDF-";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return isZipContainer(data);
    case "text/csv":
      return !data.includes(0) && data.toString("utf8").trim().length > 0;
  }
}

export function validateUploadFile(mimeType: string, data: Buffer) {
  const normalizedMime = mimeType.trim().toLowerCase();
  if (!(normalizedMime in ALLOWED_UPLOAD_TYPES)) {
    throw new Error("Jenis file tidak didukung. Unggah JPG, PNG, WebP, PDF, CSV, XLSX, atau DOCX.");
  }
  if (!data.length) throw new Error("File kosong tidak dapat diunggah.");
  if (!signatureMatches(normalizedMime as AllowedUploadMimeType, data)) {
    throw new Error(`Isi file tidak cocok dengan tipe ${ALLOWED_UPLOAD_TYPES[normalizedMime as AllowedUploadMimeType]}. Periksa file lalu coba lagi.`);
  }
  return normalizedMime as AllowedUploadMimeType;
}
