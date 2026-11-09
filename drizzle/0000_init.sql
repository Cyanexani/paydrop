CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_id" text NOT NULL,
	"client_id" text NOT NULL,
	"freelancer_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"currency" text NOT NULL,
	"deadline_days" integer NOT NULL,
	"allow_parallel" boolean DEFAULT false NOT NULL,
	"contracted_origins" jsonb NOT NULL,
	"tier" jsonb NOT NULL,
	"standing" jsonb NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"fee_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestone_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"milestone_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"position" integer NOT NULL,
	"draft" jsonb NOT NULL,
	"pricing" jsonb NOT NULL,
	"receipt" jsonb NOT NULL,
	"price_minor" bigint NOT NULL,
	"status" text NOT NULL,
	"version" integer NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"brief" text NOT NULL,
	"deadline_days" integer NOT NULL,
	"budget_minor" bigint,
	"scope" jsonb NOT NULL,
	"meta" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"headline" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"paypal_email" text,
	"kind" text DEFAULT 'human' NOT NULL,
	"owner_id" text,
	"outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"verified" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"outcome" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "contracts_client_idx" ON "contracts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "contracts_freelancer_idx" ON "contracts" USING btree ("freelancer_id");--> statement-breakpoint
CREATE INDEX "milestone_events_milestone_idx" ON "milestone_events" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "milestones_contract_idx" ON "milestones" USING btree ("contract_id");