CREATE TABLE `saku_sales_order_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`itemId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` int NOT NULL,
	`costPriceSnapshot` int NOT NULL DEFAULT 0,
	`lineTotal` int NOT NULL,
	CONSTRAINT `saku_sales_order_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_sales_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`customerId` int,
	`channelId` varchar(64),
	`orderNumber` varchar(80) NOT NULL,
	`status` enum('draft','confirmed','completed','cancelled') NOT NULL DEFAULT 'draft',
	`orderDate` timestamp NOT NULL DEFAULT (now()),
	`subtotal` int NOT NULL DEFAULT 0,
	`discount` int NOT NULL DEFAULT 0,
	`tax` int NOT NULL DEFAULT 0,
	`total` int NOT NULL DEFAULT 0,
	`paymentStatus` enum('unpaid','partial','paid','refunded') NOT NULL DEFAULT 'unpaid',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saku_sales_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `saku_sales_orders_workspace_order_number_unique` UNIQUE(`workspaceId`,`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `saku_workspace_business_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`businessType` enum('service','retail','manufacturing','food_beverage') NOT NULL,
	`isPrimary` int NOT NULL DEFAULT 0,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_workspace_business_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `saku_workspace_business_types_workspace_type_unique` UNIQUE(`workspaceId`,`businessType`)
);
--> statement-breakpoint
ALTER TABLE `saku_inventory_items` ADD `itemType` enum('service','merchandise','raw_material','work_in_progress','finished_good','packaging','consumable','non_stock') DEFAULT 'merchandise' NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_inventory_items` ADD `trackStock` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_inventory_items` ADD `sellable` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_inventory_items` ADD `purchasable` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_inventory_items` ADD `producible` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_inventory_movements` ADD `sourceType` varchar(40) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_inventory_movements` ADD `sourceId` int;--> statement-breakpoint
CREATE INDEX `saku_sales_order_lines_order_idx` ON `saku_sales_order_lines` (`orderId`);--> statement-breakpoint
CREATE INDEX `saku_sales_order_lines_item_idx` ON `saku_sales_order_lines` (`itemId`);--> statement-breakpoint
CREATE INDEX `saku_sales_orders_workspace_status_idx` ON `saku_sales_orders` (`workspaceId`,`status`);