CREATE TABLE "push_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"frequency" varchar(16) DEFAULT 'weekly' NOT NULL,
	"topic" varchar(128) DEFAULT '',
	"filter_status" varchar(16) DEFAULT 'accepted',
	"source_type" varchar(32) DEFAULT '',
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp,
	"last_status" varchar(16) DEFAULT 'pending',
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
