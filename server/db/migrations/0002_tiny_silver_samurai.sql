ALTER TABLE "articles" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "summary_status" varchar(16) DEFAULT 'pending' NOT NULL;