-- Automation table for WhatsApp message campaigns via Twilio
create table if not exists "Automation" (
  "id"          text primary key default gen_random_uuid()::text,
  "trainerId"   text not null references "Trainer"("id") on delete cascade,
  "name"        text not null,
  "type"        text not null,        -- 'CHECK_IN' | 'FEEDBACK'
  "sendMode"    text not null,        -- 'IMMEDIATE' | 'SCHEDULED'
  "delayDays"   integer,              -- only for SCHEDULED
  "clientIds"   text[] not null default '{}',
  "status"      text not null default 'PENDING', -- 'PENDING' | 'SENT' | 'FAILED'
  "scheduledAt" timestamptz,
  "sentAt"      timestamptz,
  "results"     jsonb,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);

create index if not exists idx_automation_trainer   on "Automation"("trainerId");
create index if not exists idx_automation_status    on "Automation"("status");
create index if not exists idx_automation_scheduled on "Automation"("scheduledAt");
