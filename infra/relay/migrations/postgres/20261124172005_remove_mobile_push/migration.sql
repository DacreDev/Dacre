DROP TABLE "relay_agent_activity_rows";--> statement-breakpoint
DROP TABLE "relay_delivery_attempts";--> statement-breakpoint
DROP TABLE "relay_live_activities";--> statement-breakpoint
DROP TABLE "relay_mobile_devices";--> statement-breakpoint
ALTER TABLE "relay_environment_links" DROP COLUMN "notifications_enabled";--> statement-breakpoint
ALTER TABLE "relay_environment_links" DROP COLUMN "live_activities_enabled";