CREATE TABLE "scrape_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"table_selector" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schedule" varchar(64),
	"auth_config" jsonb DEFAULT 'null'::jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_scraped_at" timestamp,
	"last_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scraped_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"data" jsonb NOT NULL,
	"columns" jsonb NOT NULL,
	"row_count" integer NOT NULL,
	"scraped_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scraped_data" ADD CONSTRAINT "scraped_data_source_id_scrape_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."scrape_sources"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "scraped_data_source_idx" ON "scraped_data" USING btree ("source_id");
--> statement-breakpoint
CREATE INDEX "scraped_data_scraped_at_idx" ON "scraped_data" USING btree ("scraped_at");
