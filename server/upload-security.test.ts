import { describe, expect, it } from "vitest";
import { validateUploadFile } from "./upload-security";

describe("storage.upload file validation", () => {
  it("accepts a PNG whose signature matches the declared MIME type", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(validateUploadFile("image/png", png)).toBe("image/png");
  });

  it("accepts an arbitrary non-empty MIME type without executing or interpreting it", () => {
    expect(validateUploadFile("application/x-msdownload", Buffer.from("MZ"))).toBe("application/x-msdownload");
  });

  it("rejects a MIME-spoofed file when magic bytes do not match", () => {
    expect(() => validateUploadFile("image/png", Buffer.from("not a png"))).toThrow("Isi file tidak cocok");
  });

  it("accepts CSV text and rejects binary data declared as CSV", () => {
    expect(validateUploadFile("text/csv", Buffer.from("produk,harga\nKopi,25000"))).toBe("text/csv");
    expect(() => validateUploadFile("text/csv", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))).toThrow("Isi file tidak cocok");
  });
});
