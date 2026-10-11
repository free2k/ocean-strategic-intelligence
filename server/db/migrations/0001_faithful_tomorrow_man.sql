CREATE TABLE "filter_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(16) NOT NULL,
	"topic" varchar(128),
	"description" text,
	"title_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_chunks" ALTER COLUMN "embedding" SET DATA TYPE vector(1024);--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "filter_status" varchar(16) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "matched_topic" varchar(128);--> statement-breakpoint
CREATE INDEX "articles_filter_status_idx" ON "articles" USING btree ("filter_status");