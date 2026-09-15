ALTER TABLE `saku_integration_credentials` MODIFY COLUMN `webhookSecretEncrypted` text;--> statement-breakpoint
ALTER TABLE `saku_integration_credentials` ADD `metadataJson` text;