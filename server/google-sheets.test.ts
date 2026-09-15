import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const integration = {
    id: 42,
    workspaceId: 7,
    provider: "google_sheets",
    apiKeyEncrypted: "encrypted-refresh-token",
    webhookSecretEncrypted: null,
    metadataJson: JSON.stringify({ spreadsheets: {} }),
    status: "active",
  };
  const workspace = { id: 7, ownerOpenId: "owner-1", businessName: "Toko Maju" };
  const getAccessToken = vi.fn().mockResolvedValue({ token: "access-token" });
  const setCredentials = vi.fn();
  const OAuth2 = vi.fn(() => ({ setCredentials, getAccessToken }));
  const create = vi.fn().mockResolvedValue({ data: { spreadsheetId: "spreadsheet-1", sheets: [{ properties: { title: "Sheet1" } }] } });
  const get = vi.fn().mockResolvedValue({ data: { sheets: [{ properties: { title: "Sheet1" } }] } });
  const clear = vi.fn().mockResolvedValue({ data: {} });
  const update = vi.fn().mockResolvedValue({ data: {} });
  const sheets = vi.fn(() => ({ spreadsheets: { create, get, values: { clear, update } } }));
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [integration] }),
      }),
    }),
    update: () => ({
      set: (payload: Record<string, unknown>) => ({
        where: async () => Object.assign(integration, payload),
      }),
    }),
  };
  return { integration, workspace, getAccessToken, setCredentials, OAuth2, create, get, clear, update, sheets, db, getDb: vi.fn(() => db), getSakuWorkspace: vi.fn(() => workspace), getSakuFinanceReview: vi.fn(), getSakuWorkspaceSnapshot: vi.fn() };
});

vi.mock("googleapis", () => ({ google: { auth: { OAuth2: state.OAuth2 }, sheets: state.sheets } }));
vi.mock("./credential-crypto", () => ({ decryptCredential: vi.fn(() => "refresh-token") }));
vi.mock("./db", () => ({ getDb: state.getDb, getSakuWorkspace: state.getSakuWorkspace, getSakuFinanceReview: state.getSakuFinanceReview, getSakuWorkspaceSnapshot: state.getSakuWorkspaceSnapshot }));

import { exportReportToSheet, getGoogleSheetsClient } from "./google-sheets";

describe("Google Sheets integration", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    state.integration.metadataJson = JSON.stringify({ spreadsheets: {} });
    state.getAccessToken.mockClear().mockResolvedValue({ token: "access-token" });
    state.setCredentials.mockClear();
    state.create.mockClear();
    state.get.mockClear();
    state.clear.mockClear();
    state.update.mockClear();
    state.getSakuFinanceReview.mockReset().mockResolvedValue({
      receivables: [{ customerReference: "Warung Sari", amount: 125000, status: "open", updatedAt: new Date("2026-09-01T10:00:00Z") }],
      mutations: [],
    });
    state.getSakuWorkspaceSnapshot.mockReset().mockResolvedValue({ divisions: 2, files: 3, automations: 4, pipelines: 5 });
  });

  it("refreshes the access token from the stored refresh token", async () => {
    await getGoogleSheetsClient("owner-1");
    expect(state.setCredentials).toHaveBeenCalledWith({ refresh_token: "refresh-token" });
    expect(state.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("creates a spreadsheet once, then reuses and clears it on subsequent exports", async () => {
    const first = await exportReportToSheet("owner-1", "receivables");
    const second = await exportReportToSheet("owner-1", "receivables");

    expect(first.spreadsheetId).toBe("spreadsheet-1");
    expect(second.url).toBe("https://docs.google.com/spreadsheets/d/spreadsheet-1/edit");
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(state.get).toHaveBeenCalledTimes(1);
    expect(state.clear).toHaveBeenCalledTimes(1);
    expect(state.update).toHaveBeenCalledTimes(2);
  });

  it("writes values from getSakuFinanceReview without dummy rows", async () => {
    await exportReportToSheet("owner-1", "receivables");
    const request = state.update.mock.calls[0]?.[0] as { requestBody?: { values?: unknown[][] } };
    expect(request.requestBody?.values).toEqual([
      ["No", "Pelanggan", "Jumlah", "Status", "Diperbarui"],
      [1, "Warung Sari", 125000, "open", "1/9/2026, 17.00.00"],
    ]);
  });
});
