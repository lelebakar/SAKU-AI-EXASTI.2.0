CREATE TABLE `saku_bank_mutations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`provider` varchar(40) NOT NULL,
	`externalId` varchar(160) NOT NULL,
	`amount` int NOT NULL,
	`mutationType` enum('credit','debit','unknown') NOT NULL,
	`description` text NOT NULL,
	`matchStatus` enum('matched','unidentified','ambiguous') NOT NULL DEFAULT 'unidentified',
	`matchedReceivableId` int,
	`rawPayload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_bank_mutations_id` PRIMARY KEY(`id`),
	CONSTRAINT `saku_bank_mutations_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
CREATE TABLE `saku_finance_receivables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`channelId` varchar(64) NOT NULL,
	`customerReference` varchar(240) NOT NULL,
	`amount` int NOT NULL,
	`status` enum('open','paid','ambiguous') NOT NULL DEFAULT 'open',
	`paidMutationId` varchar(160),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_finance_receivables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_integration_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`provider` varchar(40) NOT NULL,
	`apiKeyEncrypted` text NOT NULL,
	`webhookSecretEncrypted` text NOT NULL,
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saku_integration_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `saku_integration_workspace_provider_unique` UNIQUE(`workspaceId`,`provider`)
);
