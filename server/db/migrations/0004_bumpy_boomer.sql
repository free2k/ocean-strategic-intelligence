CREATE TABLE "proxy_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"name" varchar(128),
	"authorization" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wechat_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_key" varchar(64) NOT NULL,
	"token" varchar(128) NOT NULL,
	"cookies" jsonb NOT NULL,
	"nickname" varchar(128),
	"avatar" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "wechat_sessions_auth_key_unique" UNIQUE("auth_key")
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "download_status" varchar(16) DEFAULT 'pending' NOT NULL;