import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sakuCrmContacts, sakuMessages } from "../drizzle/schema";
import { getDb, insertSakuMessage, listSakuCrmContacts, listSakuMessages } from "./db";

const ownerOpenId = `pagination-test-${Date.now()}`;
const channelId = "pagination-channel";

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  await db.delete(sakuMessages).where(eq(sakuMessages.ownerOpenId, ownerOpenId));
  await db.delete(sakuCrmContacts).where(eq(sakuCrmContacts.ownerOpenId, ownerOpenId));
});

describe("bounded list pagination", () => {
  it("pages chat history with a database limit and older cursor", async () => {
    const db = await getDb();
    if (!db) return;
    await db.insert(sakuMessages).values([1, 2, 3].map((index) => ({ messageKey: `${ownerOpenId}-${index}`, ownerOpenId, channelId, sender: "owner" as const, senderName: "Test", senderRole: null, content: `Message ${index}`, attachmentJson: null })));

    const first = await listSakuMessages(ownerOpenId, channelId, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.items.map((item) => item.content)).toEqual(["Message 2", "Message 3"]);
    expect(first.nextCursor).toBeTypeOf("number");

    const older = await listSakuMessages(ownerOpenId, channelId, { limit: 2, cursor: first.nextCursor! });
    expect(older.items.map((item) => item.content)).toEqual(["Message 1"]);
    expect(older.nextCursor).toBeNull();
  });

  it("makes duplicate message inserts idempotent by messageKey", async () => {
    const message = { messageKey: `${ownerOpenId}-idempotent`, ownerOpenId, channelId, sender: "assistant" as const, senderName: "Saku", senderRole: null, content: "Satu pesan", attachmentJson: null };
    const first = await insertSakuMessage(message);
    const second = await insertSakuMessage({ ...message, content: "Pesan yang sama" });
    const rows = await listSakuMessages(ownerOpenId, channelId, { limit: 10 });

    expect(second?.id).toBe(first?.id);
    expect(rows.items.filter((row) => row.messageKey === message.messageKey)).toHaveLength(1);
    expect(rows.items.find((row) => row.messageKey === message.messageKey)?.content).toBe("Satu pesan");
  });

  it("pages CRM contacts instead of returning every active contact", async () => {
    const db = await getDb();
    if (!db) return;
    await db.insert(sakuCrmContacts).values([1, 2, 3].map((index) => ({ ownerOpenId, name: `Contact ${index}`, company: null, email: null, phone: null, source: "Test", stage: "lead" as const, opportunityValue: index, nextFollowUp: null, notes: null, status: "active" as const })));

    const first = await listSakuCrmContacts(ownerOpenId, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTypeOf("number");
    const older = await listSakuCrmContacts(ownerOpenId, { limit: 2, cursor: first.nextCursor! });
    expect(older.items).toHaveLength(1);
    expect(older.nextCursor).toBeNull();
  });
});
