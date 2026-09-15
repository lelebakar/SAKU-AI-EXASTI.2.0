import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(role: TrpcContext["workspaceRole"]): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "workspace-user",
      email: "user@example.com",
      name: "Workspace User",
      loginMethod: "email",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    workspaceOwnerOpenId: "workspace-owner",
    workspaceRole: role,
  };
}

describe("workspace role authorization", () => {
  it("denies a member from inviting or changing workspace members", async () => {
    const caller = appRouter.createCaller(context("member"));
    await expect(caller.workspace.members.invite({ email: "new@example.com", name: "New User", role: "member" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.members.update({ id: 1, role: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies a member from changing workspace profile settings", async () => {
    const caller = appRouter.createCaller(context("member"));
    await expect(caller.workspace.profile.update({ businessName: "Bisnis Baru" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an admin to read the member list", async () => {
    const caller = appRouter.createCaller(context("admin"));
    await expect(caller.workspace.members.list()).resolves.toEqual([]);
  });

  it("requires a resolved workspace role for ordinary workspace routes", async () => {
    const noAccess = context(undefined);
    noAccess.workspaceOwnerOpenId = undefined;
    const caller = appRouter.createCaller(noAccess);
    await expect(caller.workspace.divisions.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
