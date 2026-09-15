import { parse as parseCookieHeader } from "cookie";
import type { Request, RequestHandler, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import { createSakuAutomationRun, getSakuAutomationByScheduleTaskUid, updateSakuAutomationSchedule } from "./db";
import type { SakuAutomation } from "../drizzle/schema";
import { createHeartbeatJob } from "./_core/heartbeat";
import { sdk } from "./_core/sdk";

type ParsedSchedule = {
  cron: string;
  timezone: "Asia/Jakarta";
  label: string;
};

const DAYS: Record<string, number> = {
  minggu: 0,
  ahad: 0,
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  jumaat: 5,
  sabtu: 6,
};

function formatLabel(trigger: string): string {
  return `${trigger.trim().toLowerCase()} (WIB)`;
}

/** Convert common Indonesian daily/weekly time phrases into a six-field UTC cron. */
export function parseAutomationSchedule(trigger: string): ParsedSchedule | undefined {
  const normalized = trigger.trim().toLowerCase();
  const timeMatch = normalized.match(/jam\s+(\d{1,2})(?::(\d{2}))?/i);
  if (!timeMatch) return undefined;

  const localHour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] ?? "0");
  if (!Number.isInteger(localHour) || localHour < 0 || localHour > 23 || minute < 0 || minute > 59) return undefined;

  const day = Object.keys(DAYS).find((name) => normalized.includes(name));
  const isDaily = /\bsetiap\s+(hari|pagi|siang|sore|malam)\b/.test(normalized) || /\bsetiap\s+jam\b/.test(normalized);
  if (!day && !isDaily) return undefined;

  // WIB is UTC+7. Borrow from the previous UTC day when a local hour is before 07:00.
  const utcTotalMinutes = localHour * 60 + minute - 7 * 60;
  const utcHour = ((Math.floor(utcTotalMinutes / 60) % 24) + 24) % 24;
  const utcMinute = ((utcTotalMinutes % 60) + 60) % 60;
  let dayOfWeek = day ? DAYS[day] : undefined;
  if (day && utcTotalMinutes < 0 && dayOfWeek !== undefined) dayOfWeek = (dayOfWeek + 6) % 7;

  const cron = `0 ${utcMinute} ${utcHour} * * ${dayOfWeek === undefined ? "*" : dayOfWeek}`;
  return { cron, timezone: "Asia/Jakarta", label: formatLabel(trigger) };
}

export function getAutomationSessionToken(req: Request): string {
  return parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
}

export async function scheduleSakuAutomation(automation: SakuAutomation, userSession: string): Promise<SakuAutomation> {
  const schedule = parseAutomationSchedule(automation.trigger);
  if (!schedule || automation.scheduleCronTaskUid) return automation;

  const job = await createHeartbeatJob({
    name: `saku-automation-${automation.id}`,
    cron: schedule.cron,
    path: "/api/scheduled/saku-automation",
    description: `${automation.name} · ${schedule.label}`,
  }, userSession);

  return (await updateSakuAutomationSchedule(automation.ownerOpenId, automation.id, {
    scheduleCron: schedule.cron,
    scheduleCronTaskUid: job.taskUid,
  })) ?? automation;
}

export const handleSakuAutomationScheduled: RequestHandler = async (req: Request, res: Response) => {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      res.status(403).json({ error: "cron-only" });
      return;
    }

    const automation = await getSakuAutomationByScheduleTaskUid(user.taskUid);
    if (!automation) {
      res.json({ ok: true, skipped: "orphan" });
      return;
    }

    const executionKey = `${user.taskUid}:${new Date().toISOString().slice(0, 16)}`;
    const run = await createSakuAutomationRun({
      ownerOpenId: automation.ownerOpenId,
      automationId: automation.id,
      channelId: automation.channelId,
      status: "success",
      output: `Automasi “${automation.name}” dijalankan sesuai jadwal ${automation.trigger}.`,
      executionKey,
    });
    res.json({ ok: true, automationId: automation.id, runId: run?.id });
  } catch (error) {
    console.error("[SAKU automation] scheduled run failed", error);
    res.status(500).json({ error: String(error), timestamp: new Date().toISOString() });
  }
};
