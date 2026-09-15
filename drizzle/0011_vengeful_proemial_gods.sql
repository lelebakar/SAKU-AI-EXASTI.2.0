CREATE TABLE `saku_reconciliation_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`pattern` varchar(160) NOT NULL,
	`targetCategory` varchar(120) NOT NULL,
	`autoConfirm` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saku_reconciliation_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `saku_reconciliation_rules_workspace_pattern_idx` ON `saku_reconciliation_rules` (`workspaceId`,`pattern`);