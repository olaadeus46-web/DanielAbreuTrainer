create table if not exists "CheckInLink" (
  "id" text primary key default gen_random_uuid()::text,
  "clientId" text not null references "Client"("id") on delete cascade,
  "token" text not null unique,
  "expiresAt" timestamptz not null,
  "usedAt" timestamptz,
  "submittedCheckInId" text references "CheckIn"("id") on delete set null,
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_checkinlink_client on "CheckInLink"("clientId");
create index if not exists idx_checkinlink_expires on "CheckInLink"("expiresAt");