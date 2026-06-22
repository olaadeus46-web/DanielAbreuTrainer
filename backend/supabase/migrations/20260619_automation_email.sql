-- Convert automations from WhatsApp to Email
-- Add subject and attachments fields to Automation
alter table "Automation" add column if not exists "subject" text;
alter table "Automation" add column if not exists "attachments" jsonb not null default '[]'::jsonb;

-- Store Gmail OAuth tokens on Trainer
alter table "Trainer" add column if not exists "gmailRefreshToken" text;
alter table "Trainer" add column if not exists "gmailEmail" text;
