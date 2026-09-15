CREATE TABLE `saku_journal_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`vendor` varchar(240) NOT NULL,
	`transactionDate` timestamp NOT NULL,
	`total` int NOT NULL,
	`itemsText` text NOT NULL,
	`category` varchar(120),
	`sourceUrl` text,
	`sourceType` varchar(40) NOT NULL DEFAULT 'receipt',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_journal_entries_id` PRIMARY KEY(`id`)
);
