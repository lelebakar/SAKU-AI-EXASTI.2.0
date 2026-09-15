import type { User } from "../drizzle/schema";
import { getSakuWorkspace, getSakuWorkspaceMembership } from "./db";

export type WorkspaceRole = "owner" | "admin" | "member";

export type WorkspaceAccess = {
  ownerOpenId: string;
  role: WorkspaceRole;
  source: "workspace-owner" | "membership" | "global-admin";
};

export async function resolveWorkspaceAccess(user: User): Promise<WorkspaceAccess | null> {
  const workspace = await getSakuWorkspace(user.openId);
  if (workspace) return { ownerOpenId: user.openId, role: "owner", source: "workspace-owner" };

  const membership = await getSakuWorkspaceMembership(user.openId, user.email || undefined);
  if (membership?.memberOpenId === user.openId || (user.email && membership?.email.toLowerCase() === user.email.toLowerCase())) {
    return { ownerOpenId: membership.ownerOpenId, role: membership.role, source: "membership" };
  }

  if (user.role === "admin") return { ownerOpenId: user.openId, role: "admin", source: "global-admin" };
  // A newly registered user has no workspace or membership yet; allow them to
  // initialize their own workspace. Pending/removed invitations are not
  // active memberships and therefore cannot grant access to another workspace.
  return { ownerOpenId: user.openId, role: "owner", source: "workspace-owner" };
}

export function canManageWorkspace(access: WorkspaceAccess | null): boolean {
  return access?.role === "owner" || access?.role === "admin";
}
