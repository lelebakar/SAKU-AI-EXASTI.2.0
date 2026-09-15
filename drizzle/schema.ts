import { bigint, double, int, index, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: text("passwordHash"),
  passwordUpdatedAt: timestamp("passwordUpdatedAt"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ userOpenIdIndex: index("password_reset_tokens_user_open_id_idx").on(table.userOpenId) }));

export const sakuWorkspaces = mysqlTable("saku_workspaces", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull().unique(),
  businessName: varchar("businessName", { length: 120 }).notNull().default("Bisnismu"),
  persona: varchar("persona", { length: 1000 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const sakuRateLimitBuckets = mysqlTable("saku_rate_limit_buckets", {
  bucketKey: varchar("bucketKey", { length: 255 }).primaryKey(),
  count: int("count").notNull().default(0),
  resetAt: bigint("resetAt", { mode: "number" }).notNull(),
});

export const sakuWorkspaceBusinessTypes = mysqlTable("saku_workspace_business_types", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  businessType: mysqlEnum("businessType", ["service", "retail", "manufacturing", "food_beverage"]).notNull(),
  isPrimary: int("isPrimary").default(0).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ workspaceTypeIndex: uniqueIndex("saku_workspace_business_types_workspace_type_unique").on(table.workspaceId, table.businessType) }));

export const sakuAgents = mysqlTable("saku_agents", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  channelId: varchar("channelId", { length: 64 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  roleTitle: varchar("roleTitle", { length: 120 }).notNull(),
  avatarClass: varchar("avatarClass", { length: 120 }).default("bg-[#d8efe6] text-[#1c806b]").notNull(),
  status: mysqlEnum("status", ["online", "working", "idle"]).default("online").notNull(),
  personality: text("personality").notNull(),
  skillsText: text("skillsText").notNull(),
  dataAccessText: text("dataAccessText").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerChannelIndex: index("saku_agents_owner_channel_idx").on(table.ownerOpenId, table.channelId) }));

export const sakuTeamStandards = mysqlTable("saku_team_standards", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  channelId: varchar("channelId", { length: 64 }).notNull(),
  purpose: text("purpose").notNull(),
  principles: text("principles").notNull(),
  responseStyle: text("responseStyle").notNull(),
  outputFormat: text("outputFormat").notNull(),
  guardrails: text("guardrails").notNull(),
  checklist: text("checklist").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ ownerChannelUnique: uniqueIndex("saku_team_standards_owner_channel_unique").on(table.ownerOpenId, table.channelId) }));

export const sakuAutomationRuns = mysqlTable("saku_automation_runs", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  automationId: int("automationId").notNull(),
  channelId: varchar("channelId", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["running", "success", "failed"]).default("success").notNull(),
  output: text("output").notNull(),
  executionKey: varchar("executionKey", { length: 140 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  executionKeyUnique: uniqueIndex("saku_automation_runs_execution_key_unique").on(table.executionKey),
  ownerChannelIndex: index("saku_automation_runs_owner_channel_idx").on(table.ownerOpenId, table.channelId),
}));

export const sakuAutomations = mysqlTable("saku_automations", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  channelId: varchar("channelId", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description").notNull(),
  trigger: varchar("trigger", { length: 240 }).notNull(),
  scheduleCron: varchar("scheduleCron", { length: 80 }),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  status: mysqlEnum("status", ["draft", "active", "paused"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerChannelIndex: index("saku_automations_owner_channel_idx").on(table.ownerOpenId, table.channelId) }));

export const sakuDivisions = mysqlTable("saku_divisions", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  channelId: varchar("channelId", { length: 64 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  businessArea: varchar("businessArea", { length: 80 }).notNull(),
  description: text("description").notNull(),
  avatarClass: varchar("avatarClass", { length: 120 }).default("bg-[#e5e9f6] text-[#5e6a9e]").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerChannelIndex: index("saku_divisions_owner_channel_idx").on(table.ownerOpenId, table.channelId) }));

export const sakuFiles = mysqlTable("saku_files", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  channelId: varchar("channelId", { length: 32 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  fileSize: int("fileSize").notNull(),
  storageKey: text("storageKey").notNull(),
  storageUrl: text("storageUrl").notNull(),
  detectedKind: varchar("detectedKind", { length: 40 }).default("unknown").notNull(),
  extractionStatus: mysqlEnum("extractionStatus", ["pending", "complete", "unsupported", "failed"]).default("pending").notNull(),
  extractedText: text("extractedText"),
  structuredPreview: text("structuredPreview"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerChannelIndex: index("saku_files_owner_channel_idx").on(table.ownerOpenId, table.channelId) }));

export const sakuMemories = mysqlTable("saku_memories", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  agentId: int("agentId").notNull(),
  memory: text("memory").notNull(),
  embeddingJson: text("embeddingJson"),
  embeddingProvider: varchar("embeddingProvider", { length: 40 }),
  importance: mysqlEnum("importance", ["low", "medium", "high"]).default("medium").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerAgentIndex: index("saku_memories_owner_agent_idx").on(table.ownerOpenId, table.agentId) }));

export const sakuPipelines = mysqlTable("saku_pipelines", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  channelId: varchar("channelId", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  status: mysqlEnum("status", ["active", "paused", "completed"]).default("active").notNull(),
  currentStep: int("currentStep").default(1).notNull(),
  stepsText: text("stepsText").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerChannelIndex: index("saku_pipelines_owner_channel_idx").on(table.ownerOpenId, table.channelId) }));

export const sakuInventoryItems = mysqlTable("saku_inventory_items", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  sku: varchar("sku", { length: 80 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  category: varchar("category", { length: 100 }).notNull().default("Umum"),
  unit: varchar("unit", { length: 32 }).notNull().default("pcs"),
  quantity: double("quantity").notNull().default(0),
  minQuantity: double("minQuantity").notNull().default(0),
  costPrice: int("costPrice").notNull().default(0),
  sellingPrice: int("sellingPrice").notNull().default(0),
  itemType: mysqlEnum("itemType", ["service", "merchandise", "raw_material", "work_in_progress", "finished_good", "packaging", "consumable", "non_stock"]).default("merchandise").notNull(),
  trackStock: int("trackStock").default(1).notNull(),
  sellable: int("sellable").default(1).notNull(),
  purchasable: int("purchasable").default(1).notNull(),
  producible: int("producible").default(0).notNull(),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ ownerSkuIndex: index("saku_inventory_items_owner_sku_idx").on(table.ownerOpenId, table.sku) }));

export const sakuInventoryMovements = mysqlTable("saku_inventory_movements", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  itemId: int("itemId").notNull(),
  movementType: mysqlEnum("movementType", ["in", "out", "adjustment"]).notNull(),
  quantity: double("quantity").notNull(),
  note: varchar("note", { length: 240 }),
  sourceType: varchar("sourceType", { length: 40 }).default("manual").notNull(),
  sourceId: int("sourceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerItemIndex: index("saku_inventory_movements_owner_item_idx").on(table.ownerOpenId, table.itemId) }));

export const sakuSalesOrders = mysqlTable("saku_sales_orders", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  customerId: int("customerId"),
  channelId: varchar("channelId", { length: 64 }),
  orderNumber: varchar("orderNumber", { length: 80 }).notNull(),
  status: mysqlEnum("status", ["draft", "confirmed", "completed", "cancelled"]).default("draft").notNull(),
  orderDate: timestamp("orderDate").defaultNow().notNull(),
  subtotal: int("subtotal").default(0).notNull(),
  discount: int("discount").default(0).notNull(),
  tax: int("tax").default(0).notNull(),
  total: int("total").default(0).notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["unpaid", "partial", "paid", "refunded"]).default("unpaid").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ workspaceOrderNumberUnique: uniqueIndex("saku_sales_orders_workspace_order_number_unique").on(table.workspaceId, table.orderNumber), workspaceStatusIndex: index("saku_sales_orders_workspace_status_idx").on(table.workspaceId, table.status) }));

export const sakuSalesOrderLines = mysqlTable("saku_sales_order_lines", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: int("unitPrice").notNull(),
  costPriceSnapshot: int("costPriceSnapshot").default(0).notNull(),
  lineTotal: int("lineTotal").notNull(),
}, (table) => ({ orderIndex: index("saku_sales_order_lines_order_idx").on(table.orderId), itemIndex: index("saku_sales_order_lines_item_idx").on(table.itemId) }));

export const sakuBoms = mysqlTable("saku_boms", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  outputItemId: int("outputItemId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  version: varchar("version", { length: 40 }).notNull().default("v1"),
  outputQuantity: double("outputQuantity").notNull().default(1),
  unit: varchar("unit", { length: 32 }).notNull().default("pcs"),
  status: mysqlEnum("status", ["draft", "active", "archived"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ workspaceBomUnique: uniqueIndex("saku_boms_workspace_name_version_unique").on(table.workspaceId, table.name, table.version), outputIndex: index("saku_boms_output_item_idx").on(table.outputItemId) }));

export const sakuBomLines = mysqlTable("saku_bom_lines", {
  id: int("id").autoincrement().primaryKey(),
  bomId: int("bomId").notNull(),
  inputItemId: int("inputItemId").notNull(),
  quantity: double("quantity").notNull(),
  unit: varchar("unit", { length: 32 }).notNull().default("pcs"),
  wastePercent: int("wastePercent").notNull().default(0),
}, (table) => ({ bomIndex: index("saku_bom_lines_bom_idx").on(table.bomId), inputIndex: index("saku_bom_lines_input_item_idx").on(table.inputItemId) }));

export const sakuProductionOrders = mysqlTable("saku_production_orders", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  bomId: int("bomId").notNull(),
  outputItemId: int("outputItemId").notNull(),
  orderNumber: varchar("orderNumber", { length: 80 }).notNull(),
  plannedQuantity: double("plannedQuantity").notNull(),
  actualQuantity: double("actualQuantity").default(0).notNull(),
  status: mysqlEnum("status", ["draft", "in_progress", "completed", "cancelled"]).default("draft").notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ workspaceProductionUnique: uniqueIndex("saku_production_orders_workspace_order_number_unique").on(table.workspaceId, table.orderNumber), workspaceStatusIndex: index("saku_production_orders_workspace_status_idx").on(table.workspaceId, table.status) }));

export const sakuProductionConsumptions = mysqlTable("saku_production_consumptions", {
  id: int("id").autoincrement().primaryKey(),
  productionOrderId: int("productionOrderId").notNull(),
  inputItemId: int("inputItemId").notNull(),
  plannedQuantity: double("plannedQuantity").notNull(),
  actualQuantity: double("actualQuantity").default(0).notNull(),
  wasteQuantity: double("wasteQuantity").default(0).notNull(),
}, (table) => ({ productionIndex: index("saku_production_consumptions_order_idx").on(table.productionOrderId), inputIndex: index("saku_production_consumptions_input_item_idx").on(table.inputItemId) }));

export const sakuCrmContacts = mysqlTable("saku_crm_contacts", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  company: varchar("company", { length: 160 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 48 }),
  source: varchar("source", { length: 80 }).default("Manual").notNull(),
  stage: mysqlEnum("stage", ["lead", "qualified", "proposal", "won", "lost"]).default("lead").notNull(),
  opportunityValue: int("opportunityValue").default(0).notNull(),
  nextFollowUp: timestamp("nextFollowUp"),
  notes: text("notes"),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ ownerStageIndex: index("saku_crm_contacts_owner_stage_idx").on(table.ownerOpenId, table.stage) }));

export const sakuCrmActivities = mysqlTable("saku_crm_activities", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  contactId: int("contactId").notNull(),
  activityType: mysqlEnum("activityType", ["note", "call", "meeting", "email"]).default("note").notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  detail: text("detail"),
  dueAt: timestamp("dueAt"),
  completed: int("completed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerContactIndex: index("saku_crm_activities_owner_contact_idx").on(table.ownerOpenId, table.contactId) }));

export const sakuMessages = mysqlTable("saku_messages", {
  id: int("id").autoincrement().primaryKey(),
  messageKey: varchar("messageKey", { length: 80 }).notNull().unique(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  channelId: varchar("channelId", { length: 64 }).notNull(),
  sender: mysqlEnum("sender", ["owner", "agent", "assistant"]).notNull(),
  senderName: varchar("senderName", { length: 100 }),
  senderRole: varchar("senderRole", { length: 120 }),
  content: text("content"),
  attachmentJson: text("attachmentJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerChannelIndex: index("saku_messages_owner_channel_idx").on(table.ownerOpenId, table.channelId) }));

export const sakuWorkspaceMembers = mysqlTable("saku_workspace_members", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  memberOpenId: varchar("memberOpenId", { length: 64 }),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  role: mysqlEnum("role", ["admin", "member"]).default("member").notNull(),
  status: mysqlEnum("status", ["pending", "active", "removed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const sakuSupportRequests = mysqlTable("saku_support_requests", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  subject: varchar("subject", { length: 160 }).notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const sakuIntegrationCredentials = mysqlTable("saku_integration_credentials", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  provider: varchar("provider", { length: 40 }).notNull(),
  apiKeyEncrypted: text("apiKeyEncrypted").notNull(),
  webhookSecretEncrypted: text("webhookSecretEncrypted"),
  metadataJson: text("metadataJson"),
  status: mysqlEnum("status", ["active", "disabled"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ workspaceProviderUnique: uniqueIndex("saku_integration_workspace_provider_unique").on(table.workspaceId, table.provider) }));

export const sakuReconciliationRules = mysqlTable("saku_reconciliation_rules", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  pattern: varchar("pattern", { length: 160 }).notNull(),
  targetCategory: varchar("targetCategory", { length: 120 }).notNull(),
  autoConfirm: int("autoConfirm").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ workspacePatternIndex: index("saku_reconciliation_rules_workspace_pattern_idx").on(table.workspaceId, table.pattern) }));

export const sakuJournalEntries = mysqlTable("saku_journal_entries", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  vendor: varchar("vendor", { length: 240 }).notNull(),
  transactionDate: timestamp("transactionDate").notNull(),
  entryType: mysqlEnum("entryType", ["expense", "income"]).default("expense").notNull(),
  total: int("total").notNull(),
  itemsText: text("itemsText").notNull(),
  category: varchar("category", { length: 120 }),
  sourceUrl: text("sourceUrl"),
  sourceType: varchar("sourceType", { length: 40 }).default("receipt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const sakuFinanceReceivables = mysqlTable("saku_finance_receivables", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  channelId: varchar("channelId", { length: 64 }).notNull(),
  customerReference: varchar("customerReference", { length: 240 }).notNull(),
  amount: int("amount").notNull(),
  status: mysqlEnum("status", ["open", "paid", "ambiguous"]).default("open").notNull(),
  paidMutationId: varchar("paidMutationId", { length: 160 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const sakuBankMutations = mysqlTable("saku_bank_mutations", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  provider: varchar("provider", { length: 40 }).notNull(),
  externalId: varchar("externalId", { length: 160 }).notNull().unique(),
  amount: int("amount").notNull(),
  mutationType: mysqlEnum("mutationType", ["credit", "debit", "unknown"]).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 120 }),
  matchStatus: mysqlEnum("matchStatus", ["matched", "unidentified", "ambiguous"]).default("unidentified").notNull(),
  matchedReceivableId: int("matchedReceivableId"),
  rawPayload: text("rawPayload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type SakuWorkspace = typeof sakuWorkspaces.$inferSelect;
export type InsertSakuWorkspace = typeof sakuWorkspaces.$inferInsert;
export type SakuWorkspaceBusinessType = typeof sakuWorkspaceBusinessTypes.$inferSelect;
export type InsertSakuWorkspaceBusinessType = typeof sakuWorkspaceBusinessTypes.$inferInsert;
export type SakuAgent = typeof sakuAgents.$inferSelect;
export type InsertSakuAgent = typeof sakuAgents.$inferInsert;
export type SakuAutomationRun = typeof sakuAutomationRuns.$inferSelect;
export type InsertSakuAutomationRun = typeof sakuAutomationRuns.$inferInsert;
export type SakuAutomation = typeof sakuAutomations.$inferSelect;
export type InsertSakuAutomation = typeof sakuAutomations.$inferInsert;
export type SakuDivision = typeof sakuDivisions.$inferSelect;
export type InsertSakuDivision = typeof sakuDivisions.$inferInsert;
export type SakuFile = typeof sakuFiles.$inferSelect;
export type InsertSakuFile = typeof sakuFiles.$inferInsert;
export type SakuMemory = typeof sakuMemories.$inferSelect;
export type InsertSakuMemory = typeof sakuMemories.$inferInsert;
export type SakuPipeline = typeof sakuPipelines.$inferSelect;
export type InsertSakuPipeline = typeof sakuPipelines.$inferInsert;
export type SakuInventoryItem = typeof sakuInventoryItems.$inferSelect;
export type InsertSakuInventoryItem = typeof sakuInventoryItems.$inferInsert;
export type SakuInventoryMovement = typeof sakuInventoryMovements.$inferSelect;
export type InsertSakuInventoryMovement = typeof sakuInventoryMovements.$inferInsert;
export type SakuSalesOrder = typeof sakuSalesOrders.$inferSelect;
export type InsertSakuSalesOrder = typeof sakuSalesOrders.$inferInsert;
export type SakuSalesOrderLine = typeof sakuSalesOrderLines.$inferSelect;
export type InsertSakuSalesOrderLine = typeof sakuSalesOrderLines.$inferInsert;
export type SakuBom = typeof sakuBoms.$inferSelect;
export type InsertSakuBom = typeof sakuBoms.$inferInsert;
export type SakuBomLine = typeof sakuBomLines.$inferSelect;
export type InsertSakuBomLine = typeof sakuBomLines.$inferInsert;
export type SakuProductionOrder = typeof sakuProductionOrders.$inferSelect;
export type InsertSakuProductionOrder = typeof sakuProductionOrders.$inferInsert;
export type SakuProductionConsumption = typeof sakuProductionConsumptions.$inferSelect;
export type InsertSakuProductionConsumption = typeof sakuProductionConsumptions.$inferInsert;
export type SakuCrmContact = typeof sakuCrmContacts.$inferSelect;
export type InsertSakuCrmContact = typeof sakuCrmContacts.$inferInsert;
export type SakuCrmActivity = typeof sakuCrmActivities.$inferSelect;
export type InsertSakuCrmActivity = typeof sakuCrmActivities.$inferInsert;
export type SakuTeamStandard = typeof sakuTeamStandards.$inferSelect;
export type InsertSakuTeamStandard = typeof sakuTeamStandards.$inferInsert;
export type SakuMessage = typeof sakuMessages.$inferSelect;
export type InsertSakuMessage = typeof sakuMessages.$inferInsert;
export type SakuWorkspaceMember = typeof sakuWorkspaceMembers.$inferSelect;
export type InsertSakuWorkspaceMember = typeof sakuWorkspaceMembers.$inferInsert;
export type SakuSupportRequest = typeof sakuSupportRequests.$inferSelect;
export type InsertSakuSupportRequest = typeof sakuSupportRequests.$inferInsert;
export type SakuIntegrationCredential = typeof sakuIntegrationCredentials.$inferSelect;
export type InsertSakuIntegrationCredential = typeof sakuIntegrationCredentials.$inferInsert;
export type SakuFinanceReceivable = typeof sakuFinanceReceivables.$inferSelect;
export type InsertSakuFinanceReceivable = typeof sakuFinanceReceivables.$inferInsert;
export type SakuBankMutation = typeof sakuBankMutations.$inferSelect;
export type InsertSakuBankMutation = typeof sakuBankMutations.$inferInsert;
