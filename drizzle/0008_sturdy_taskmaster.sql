CREATE INDEX `saku_agents_owner_channel_idx` ON `saku_agents` (`ownerOpenId`,`channelId`);--> statement-breakpoint
CREATE INDEX `saku_automation_runs_owner_channel_idx` ON `saku_automation_runs` (`ownerOpenId`,`channelId`);--> statement-breakpoint
CREATE INDEX `saku_automations_owner_channel_idx` ON `saku_automations` (`ownerOpenId`,`channelId`);--> statement-breakpoint
CREATE INDEX `saku_divisions_owner_channel_idx` ON `saku_divisions` (`ownerOpenId`,`channelId`);--> statement-breakpoint
CREATE INDEX `saku_files_owner_channel_idx` ON `saku_files` (`ownerOpenId`,`channelId`);--> statement-breakpoint
CREATE INDEX `saku_memories_owner_agent_idx` ON `saku_memories` (`ownerOpenId`,`agentId`);--> statement-breakpoint
CREATE INDEX `saku_messages_owner_channel_idx` ON `saku_messages` (`ownerOpenId`,`channelId`);--> statement-breakpoint
CREATE INDEX `saku_pipelines_owner_channel_idx` ON `saku_pipelines` (`ownerOpenId`,`channelId`);