CREATE TABLE `saku_inventory_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`sku` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`category` varchar(100) NOT NULL DEFAULT 'Umum',
	`unit` varchar(32) NOT NULL DEFAULT 'pcs',
	`quantity` int NOT NULL DEFAULT 0,
	`minQuantity` int NOT NULL DEFAULT 0,
	`costPrice` int NOT NULL DEFAULT 0,
	`sellingPrice` int NOT NULL DEFAULT 0,
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saku_inventory_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saku_inventory_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`itemId` int NOT NULL,
	`movementType` enum('in','out','adjustment') NOT NULL,
	`quantity` int NOT NULL,
	`note` varchar(240),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saku_inventory_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `saku_inventory_items_owner_sku_idx` ON `saku_inventory_items` (`ownerOpenId`,`sku`);--> statement-breakpoint
CREATE INDEX `saku_inventory_movements_owner_item_idx` ON `saku_inventory_movements` (`ownerOpenId`,`itemId`);