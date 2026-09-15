import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import type { WorkspaceRole } from "../authorization";
import { resolveWorkspaceAccess } from "../authorization";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  workspaceOwnerOpenId?: string;
  workspaceRole?: WorkspaceRole;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }
  const access = user ? await resolveWorkspaceAccess(user) : null;

  return {
    req: opts.req,
    res: opts.res,
    user,
    workspaceOwnerOpenId: access?.ownerOpenId,
    workspaceRole: access?.role,
  };
}
