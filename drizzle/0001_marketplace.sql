CREATE TABLE "change_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"message_id" text,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"draft" jsonb NOT NULL,
	"pricing" jsonb,
	"status" text NOT NULL,
	"milestone_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "check_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"milestone_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"mode" text NOT NULL,
	"evidence_url" text NOT NULL,
	"commit_sha" text,
	"replay_url" text,
	"results" jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"milestone_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"html" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" text PRIMARY KEY NOT NULL,
	"milestone_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"merchant" text,
	"image_url" text,
	"price_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"channel" text NOT NULL,
	"author_id" text,
	"sender" text NOT NULL,
	"body" text NOT NULL,
	"scope" jsonb,
	"change_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "negotiations" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"milestone_id" text NOT NULL,
	"round" integer NOT NULL,
	"price_minor" bigint NOT NULL,
	"reason" text,
	"fair" boolean NOT NULL,
	"ai_estimate" jsonb,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"milestone_id" text NOT NULL,
	"payee_key" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"batch_id" text,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "collaborators" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "timezone" text DEFAULT 'Asia/Kolkata' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "kind" text DEFAULT 'original' NOT NULL;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "split" jsonb;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "actual_hours" double precision;--> statement-breakpoint
CREATE INDEX "change_requests_contract_idx" ON "change_requests" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "check_runs_milestone_idx" ON "check_runs" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "materials_milestone_idx" ON "materials" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "messages_contract_idx" ON "messages" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "negotiations_contract_idx" ON "negotiations" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "payouts_milestone_idx" ON "payouts" USING btree ("milestone_id");