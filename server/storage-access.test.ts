import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sakuFiles } from "../drizzle/schema";
import { getDb, getSakuFileByStorageKey, insertSakuFile } from "./db";

const ownerOpenId = `storage-owner-test-${Date.now()}`;
const storageKey = `saku-ai/${ownerOpenId}/attachments/private-receipt.png`;

afterEach(async () => {
  const db = await getDb();
  if (db) await db.delete(sakuFiles).where(eq(sakuFiles.ownerOpenId, ownerOpenId));
});

describe("protected storage ownership lookup", () => {
  it("returns a file for its workspace owner", async () => {
    const db = await getDb();
    if (!db) return;
    await insertSakuFile({ ownerOpenId, channelId: "finance", fileName: "private-receipt.png", mimeType: "image/png", fileSize: 12, storageKey, storageUrl: `/manus-storage/${storageKey}`, detectedKind: "image", extractionStatus: "complete", extractedText: null, structuredPreview: null });
    await expect(getSakuFileByStorageKey(ownerOpenId, storageKey)).resolves.toMatchObject({ ownerOpenId, storageKey });
  });

  it("does not return another workspace's file", async () => {
    const db = await getDb();
    if (!db) return;
    await insertSakuFile({ ownerOpenId, channelId: "finance", fileName: "private-receipt.png", mimeType: "image/png", fileSize: 12, storageKey, storageUrl: `/manus-storage/${storageKey}`, detectedKind: "image", extractionStatus: "complete", extractedText: null, structuredPreview: null });
    await expect(getSakuFileByStorageKey("different-workspace", storageKey)).resolves.toBeUndefined();
  });
});
