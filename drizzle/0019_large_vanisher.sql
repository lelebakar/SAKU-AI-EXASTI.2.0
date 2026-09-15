ALTER TABLE `saku_bom_lines` MODIFY COLUMN `quantity` double NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_boms` MODIFY COLUMN `outputQuantity` double NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `saku_inventory_items` MODIFY COLUMN `quantity` double NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_inventory_items` MODIFY COLUMN `minQuantity` double NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_inventory_movements` MODIFY COLUMN `quantity` double NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_production_consumptions` MODIFY COLUMN `plannedQuantity` double NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_production_consumptions` MODIFY COLUMN `actualQuantity` double NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_production_consumptions` MODIFY COLUMN `wasteQuantity` double NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_production_orders` MODIFY COLUMN `plannedQuantity` double NOT NULL;--> statement-breakpoint
ALTER TABLE `saku_production_orders` MODIFY COLUMN `actualQuantity` double NOT NULL;