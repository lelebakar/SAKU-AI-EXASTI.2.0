CREATE INDEX `saku_finance_receivables_workspace_status_idx` ON `saku_finance_receivables` (`workspaceId`,`status`);--> statement-breakpoint
CREATE INDEX `saku_finance_receivables_workspace_created_idx` ON `saku_finance_receivables` (`workspaceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `saku_journal_entries_workspace_date_idx` ON `saku_journal_entries` (`workspaceId`,`transactionDate`);--> statement-breakpoint
CREATE INDEX `saku_support_requests_owner_created_idx` ON `saku_support_requests` (`ownerOpenId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `saku_workspace_members_owner_status_idx` ON `saku_workspace_members` (`ownerOpenId`,`status`);--> statement-breakpoint
CREATE INDEX `saku_workspace_members_email_status_idx` ON `saku_workspace_members` (`email`,`status`);