CREATE TABLE `saku_team_standards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`channelId` varchar(64) NOT NULL,
	`purpose` text NOT NULL,
	`principles` text NOT NULL,
	`responseStyle` text NOT NULL,
	`outputFormat` text NOT NULL,
	`guardrails` text NOT NULL,
	`checklist` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saku_team_standards_id` PRIMARY KEY(`id`),
	CONSTRAINT `saku_team_standards_owner_channel_unique` UNIQUE(`ownerOpenId`,`channelId`)
);
