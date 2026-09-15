import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const workspaceProcedure = protectedProcedure.use(
  t.middleware(async opts => {
    if (!opts.ctx.workspaceOwnerOpenId || !opts.ctx.workspaceRole) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Akun ini belum memiliki akses ke workspace." });
    }
    return opts.next({ ctx: opts.ctx });
  }),
);

export const workspaceAdminProcedure = protectedProcedure.use(
  t.middleware(async opts => {
    if (opts.ctx.workspaceRole !== "owner" && opts.ctx.workspaceRole !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Akses ini hanya untuk owner atau admin workspace." });
    }
    return opts.next({ ctx: opts.ctx });
  }),
);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
