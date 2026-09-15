import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import * as XLSX from "xlsx";

const execFileAsync = promisify(execFile);

export type FileIntelligence = {
  kind: "csv" | "spreadsheet" | "pdf" | "word" | "image" | "document" | "text" | "unknown";
  status: "pending" | "complete" | "unsupported" | "failed";
  needsVision: boolean;
  text?: string;
  preview?: string;
};

function cleanText(value: string): string {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function csvPreview(input: string): string {
  const rows = input.split(/\r?\n/).filter(Boolean).slice(0, 8);
  if (rows.length < 2) return rows[0] ?? "";
  const headers = rows[0].split(",").map((value) => value.trim());
  return rows.slice(1).map((row) => {
    const values = row.split(",").map((value) => value.trim());
    const labeled = values.map((value, index) => `${headers[index] || `Kolom ${index + 1}`}: ${value}`).join(" · ");
    const compact = values.join(" · ");
    return `${labeled}\n${compact}`;
  }).join("\n");
}

function spreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\s+/g, " ").trim();
}

function extractSpreadsheet(fileName: string, data: Buffer): FileIntelligence {
  try {
    const isZip = [0x50, 0x4b, 0x03, 0x04].every((byte, index) => data[index] === byte)
      || [0x50, 0x4b, 0x05, 0x06].every((byte, index) => data[index] === byte)
      || [0x50, 0x4b, 0x07, 0x08].every((byte, index) => data[index] === byte);
    if (!isZip) return { kind: "spreadsheet", status: "failed", needsVision: false, preview: "File Excel tidak bisa dibaca. Pastikan workbook tidak rusak lalu coba unggah ulang." };
    const workbook = XLSX.read(data, {
      type: "buffer",
      cellDates: true,
      cellNF: false,
      cellText: true,
      sheetRows: 1000,
      WTF: false,
    });
    const sections = workbook.SheetNames.map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", raw: false, blankrows: false })
        .slice(0, 1000)
        .map((row) => row.slice(0, 40).map(spreadsheetCell));
      if (!rows.length) return `Sheet: ${sheetName}\n(kosong)`;
      const headers = rows[0]!.map((value, index) => value || `Kolom ${index + 1}`);
      const lines = rows.slice(1).map((row, rowIndex) => {
        const values = headers.map((header, columnIndex) => `${header}: ${row[columnIndex] || ""}`).join(" · ");
        return `Baris ${rowIndex + 2}: ${values}`;
      });
      return [`Sheet: ${sheetName}`, `Kolom: ${headers.join(" · ")}`, ...lines].join("\n");
    }).filter(Boolean);
    const text = cleanText(sections.join("\n\n")).slice(0, 100_000);
    if (!text) return { kind: "spreadsheet", status: "failed", needsVision: false, preview: "Excel berhasil dibuka, tetapi tidak ada data yang terbaca." };
    return { kind: "spreadsheet", status: "complete", needsVision: false, text, preview: `Excel · ${fileName}\n${text.slice(0, 1200)}` };
  } catch {
    return { kind: "spreadsheet", status: "failed", needsVision: false, preview: "File Excel tidak bisa dibaca. Pastikan workbook tidak rusak lalu coba unggah ulang." };
  }
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

async function extractPdf(fileName: string, data: Buffer): Promise<FileIntelligence> {
  const folder = await mkdtemp(join(tmpdir(), "saku-pdf-"));
  const inputPath = join(folder, basename(fileName) || "document.pdf");
  const outputPath = join(folder, "text.txt");
  try {
    await writeFile(inputPath, data);
    await execFileAsync("pdftotext", ["-layout", inputPath, outputPath], { timeout: 30_000 });
    const text = cleanText(await readFile(outputPath, "utf8"));
    return { kind: "pdf", status: text ? "complete" : "failed", needsVision: false, text, preview: text ? `Halaman 1 · ${text.slice(0, 900)}` : "PDF gagal diekstrak: tidak ada teks yang terbaca." };
  } catch {
    return { kind: "pdf", status: "failed", needsVision: false, preview: "PDF gagal diekstrak. Coba unggah ulang file yang valid." };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function extractDocx(fileName: string, data: Buffer): Promise<FileIntelligence> {
  const folder = await mkdtemp(join(tmpdir(), "saku-docx-"));
  const inputPath = join(folder, basename(fileName) || "document.docx");
  try {
    await writeFile(inputPath, data);
    const { stdout } = await execFileAsync("unzip", ["-p", inputPath, "word/document.xml"], { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 });
    const paragraphs = stdout.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)?.map((paragraph) =>
      cleanText(decodeXmlEntities(paragraph.replace(/<w:tab\s*\/?>(?:<\/w:tab>)?/g, "\t").replace(/<w:br\s*\/?>(?:<\/w:br>)?/g, "\n").replace(/<[^>]+>/g, " ")))
    ).filter(Boolean) ?? [];
    const text = cleanText(paragraphs.join("\n"));
    return { kind: "word", status: text ? "complete" : "failed", needsVision: false, text, preview: text ? `Word · ${text.slice(0, 900)}` : "Dokumen Word gagal diekstrak: tidak ada paragraf yang terbaca." };
  } catch {
    return { kind: "word", status: "failed", needsVision: false, preview: "Dokumen Word gagal diekstrak. Coba unggah ulang file yang valid." };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export async function extractFileIntelligence(fileName: string, mimeType: string, data: Buffer): Promise<FileIntelligence> {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  const textLikeExtension = /\.(txt|md|markdown|json|xml|html?|css|scss|less|js|jsx|ts|tsx|py|java|go|rs|sql|yaml|yml|toml|ini|log|srt|vtt)$/i.test(lowerName);
  if (lowerMime.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/i.test(lowerName)) {
    return { kind: "image", status: "pending", needsVision: true, preview: "Gambar akan dibaca dengan OCR visual." };
  }
  if (lowerMime === "text/csv" || lowerName.endsWith(".csv")) {
    const text = cleanText(data.toString("utf8"));
    return { kind: "csv", status: "complete", needsVision: false, text, preview: csvPreview(text) };
  }
  if (lowerMime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || lowerName.endsWith(".xlsx")) return extractSpreadsheet(fileName, data);
  if (lowerMime === "application/pdf" || lowerName.endsWith(".pdf")) return extractPdf(fileName, data);
  if (lowerMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || lowerName.endsWith(".docx")) return extractDocx(fileName, data);
  if (lowerMime.startsWith("text/") || textLikeExtension || ["application/json", "application/xml", "application/javascript"].includes(lowerMime)) {
    const text = cleanText(data.toString("utf8"));
    return { kind: "text", status: text ? "complete" : "failed", needsVision: false, text, preview: text ? `Teks · ${fileName}\n${text.slice(0, 1200)}` : "File teks kosong atau tidak terbaca." };
  }
  const label = lowerMime.startsWith("audio/") ? "audio" : lowerMime.startsWith("video/") ? "video" : lowerMime.includes("zip") || lowerMime.includes("compressed") ? "arsip" : "file";
  return { kind: "unknown", status: "complete", needsVision: false, preview: `Metadata tersedia · ${fileName}\nJenis: ${mimeType || "application/octet-stream"}\nKategori: ${label}\nIsi file ini tersimpan aman; analisis isi otomatis membutuhkan format yang dapat dibaca.` };
}
