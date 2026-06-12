alter table "Client"
  add column if not exists "isOnline" boolean not null default false;

create table if not exists "OnlineClientLink" (
  "id" text primary key default gen_random_uuid()::text,
  "trainerId" text not null references "Trainer"("id") on delete cascade,
  "token" text not null unique,
  "expiresAt" timestamptz not null,
  "usedAt" timestamptz,
  "submittedClientId" text references "Client"("id") on delete set null,
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_onlineclientlink_trainer on "OnlineClientLink"("trainerId");
create index if not exists idx_onlineclientlink_expires on "OnlineClientLink"("expiresAt");
