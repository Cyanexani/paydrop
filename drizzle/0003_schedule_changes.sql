ALTER TABLE "change_requests" ADD COLUMN "target_milestone_id" text;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "target_due_at" timestamp with time zone;