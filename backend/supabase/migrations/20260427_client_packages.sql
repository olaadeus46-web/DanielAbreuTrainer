create table if not exists "ClientPackage" (
  "id" text primary key default gen_random_uuid()::text,
  "trainerId" text not null references "Trainer"("id") on delete cascade,
  "name" text not null,
  "description" text,
  "monthlyPrice" numeric(10,2) not null,
  "sessionsPerWeek" integer,
  "sessionsPerMonth" integer,
  "hasOnlineSupport" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists idx_clientpackage_trainer on "ClientPackage"("trainerId");

alter table "Client"
  add column if not exists "packageId" text references "ClientPackage"("id") on delete set null;

create index if not exists idx_client_package on "Client"("packageId");
