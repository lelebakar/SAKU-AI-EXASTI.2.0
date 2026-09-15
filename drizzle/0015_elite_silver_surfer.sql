CREATE TABLE `saku_crm_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`contactId` int NOT NULL,
	`activityType` enum('note','call','meeting','email') NOT NULL DEFAULT 'note',
	`title` varchar(160) NOT NULL,
	`detail` text,
	`dueAt` timestamp,
	`completed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_crm_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_crm_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`company` varchar(160),
	`email` varchar(320),
	`phone` varchar(48),
	`source` varchar(80) NOT NULL DEFAULT 'Manual',
	`stage` enum('lead','qualified','proposal','won','lost') NOT NULL DEFAULT 'lead',
	`opportunityValue` int NOT NULL DEFAULT 0,
	`nextFollowUp` timestamp,
	`notes` text,
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saku_crm_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `saku_crm_activities_owner_contact_idx` ON `saku_crm_activities` (`ownerOpenId`,`contactId`);--> statement-breakpoint
CREATE INDEX `saku_crm_contacts_owner_stage_idx` ON `saku_crm_contacts` (`ownerOpenId`,`stage`);