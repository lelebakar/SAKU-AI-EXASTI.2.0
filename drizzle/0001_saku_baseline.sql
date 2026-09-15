CREATE TABLE `saku_agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`channelId` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`roleTitle` varchar(120) NOT NULL,
	`avatarClass` varchar(120) NOT NULL DEFAULT 'bg-[#d8efe6] text-[#1c806b]',
	`status` enum('online','working','idle') NOT NULL DEFAULT 'online',
	`personality` text NOT NULL,
	`skillsText` text NOT NULL,
	`dataAccessText` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_automation_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`automationId` int NOT NULL,
	`channelId` varchar(64) NOT NULL,
	`status` enum('running','success','failed') NOT NULL DEFAULT 'success',
	`output` text NOT NULL,
	`executionKey` varchar(140),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_automation_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `saku_automation_runs_execution_key_unique` UNIQUE(`executionKey`)
);
--> statement-breakpoint
CREATE TABLE `saku_automations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`channelId` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text NOT NULL,
	`trigger` varchar(240) NOT NULL,
	`scheduleCron` varchar(80),
	`scheduleCronTaskUid` varchar(65),
	`status` enum('draft','active','paused') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_automations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_divisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`channelId` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`businessArea` varchar(80) NOT NULL,
	`description` text NOT NULL,
	`avatarClass` varchar(120) NOT NULL DEFAULT 'bg-[#e5e9f6] text-[#5e6a9e]',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_divisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`channelId` varchar(32) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`fileSize` int NOT NULL,
	`storageKey` text NOT NULL,
	`storageUrl` text NOT NULL,
	`detectedKind` varchar(40) NOT NULL DEFAULT 'unknown',
	`extractionStatus` enum('pending','complete','unsupported','failed') NOT NULL DEFAULT 'pending',
	`extractedText` text,
	`structuredPreview` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_memories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`agentId` int NOT NULL,
	`memory` text NOT NULL,
	`importance` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_memories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageKey` varchar(80) NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`channelId` varchar(64) NOT NULL,
	`sender` enum('owner','agent','assistant') NOT NULL,
	`senderName` varchar(100),
	`senderRole` varchar(120),
	`content` text,
	`attachmentJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `saku_messages_messageKey_unique` UNIQUE(`messageKey`)
);
--> statement-breakpoint
CREATE TABLE `saku_pipelines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`channelId` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`status` enum('active','paused','completed') NOT NULL DEFAULT 'active',
	`currentStep` int NOT NULL DEFAULT 1,
	`stepsText` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_pipelines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_support_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`category` varchar(64) NOT NULL,
	`subject` varchar(160) NOT NULL,
	`message` text NOT NULL,
	`status` enum('open','in_progress','resolved') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_support_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_workspace_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`memberOpenId` varchar(64),
	`email` varchar(320) NOT NULL,
	`name` varchar(120) NOT NULL,
	`role` enum('admin','member') NOT NULL DEFAULT 'member',
	`status` enum('pending','active','removed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saku_workspace_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`businessName` varchar(120) NOT NULL DEFAULT 'Bisnismu',
	`persona` varchar(1000),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saku_workspaces_id` PRIMARY KEY(`id`),
	CONSTRAINT `saku_workspaces_ownerOpenId_unique` UNIQUE(`ownerOpenId`)
);
