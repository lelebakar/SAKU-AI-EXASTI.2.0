import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sakuWorkspaceMembers } from "../drizzle/schema";
import { acceptSakuWorkspaceInvitation, getDb, listSakuPendingWorkspaceInvitations } from "./db";

const ownerOpenId = `invite-owner-test-${Date.now()}`;
const email = `invitee-${Date.now()}@example.com`;
let memberId: number | undefined;

afterEach(async () => {
  const db = await getDb();
  if (db && memberId) await db.delete(sakuWorkspaceMembers).where(eq(sakuWorkspaceMembers.id, memberId));
});

describe("workspace invitation acceptance", () => {
  it("activates a pending invitation only for the invited email", async () => {
    const db = await getDb();
    if (!db) return;
    const inserted = await db.insert(sakuWorkspaceMembers).values({ ownerOpenId, memberOpenId: null, email, name: "Invitee", role: "member", status: "pending" });
    memberId = Number(inserted[0].insertId);

    const pending = await listSakuPendingWorkspaceInvitations(email);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.status).toBe("pending");

    const accepted = await acceptSakuWorkspaceInvitation({ id: memberId, email, memberOpenId: "email:invitee-account", name: "Invitee Account" });
    expect(accepted).toMatchObject({ id: memberId, email, memberOpenId: "email:invitee-account", status: "active", role: "member" });

    const noLongerPending = await listSakuPendingWorkspaceInvitations(email);
    expect(noLongerPending).toHaveLength(0);
  });
});
