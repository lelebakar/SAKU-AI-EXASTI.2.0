CREATE TABLE `saku_bom_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bomId` int NOT NULL,
	`inputItemId` int NOT NULL,
	`quantity` int NOT NULL,
	`unit` varchar(32) NOT NULL DEFAULT 'pcs',
	`wastePercent` int NOT NULL DEFAULT 0,
	CONSTRAINT `saku_bom_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_boms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`outputItemId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`version` varchar(40) NOT NULL DEFAULT 'v1',
	`outputQuantity` int NOT NULL DEFAULT 1,
	`unit` varchar(32) NOT NULL DEFAULT 'pcs',
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saku_boms_id` PRIMARY KEY(`id`),
	CONSTRAINT `saku_boms_workspace_name_version_unique` UNIQUE(`workspaceId`,`name`,`version`)
);
--> statement-breakpoint
CREATE TABLE `saku_production_consumptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productionOrderId` int NOT NULL,
	`inputItemId` int NOT NULL,
	`plannedQuantity` int NOT NULL,
	`actualQuantity` int NOT NULL DEFAULT 0,
	`wasteQuantity` int NOT NULL DEFAULT 0,
	CONSTRAINT `saku_production_consumptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_production_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`bomId` int NOT NULL,
	`outputItemId` int NOT NULL,
	`orderNumber` varchar(80) NOT NULL,
	`plannedQuantity` int NOT NULL,
	`actualQuantity` int NOT NULL DEFAULT 0,
	`status` enum('draft','in_progress','completed','cancelled') NOT NULL DEFAULT 'draft',
	`startedAt` timestamp,
	`completedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_production_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `saku_production_orders_workspace_order_number_unique` UNIQUE(`workspaceId`,`orderNumber`)
);
--> statement-breakpoint
CREATE INDEX `saku_bom_lines_bom_idx` ON `saku_bom_lines` (`bomId`);--> statement-breakpoint
CREATE INDEX `saku_bom_lines_input_item_idx` ON `saku_bom_lines` (`inputItemId`);--> statement-breakpoint
CREATE INDEX `saku_boms_output_item_idx` ON `saku_boms` (`outputItemId`);--> statement-breakpoint
CREATE INDEX `saku_production_consumptions_order_idx` ON `saku_production_consumptions` (`productionOrderId`);--> statement-breakpoint
CREATE INDEX `saku_production_consumptions_input_item_idx` ON `saku_production_consumptions` (`inputItemId`);--> statement-breakpoint
CREATE INDEX `saku_production_orders_workspace_status_idx` ON `saku_production_orders` (`workspaceId`,`status`);