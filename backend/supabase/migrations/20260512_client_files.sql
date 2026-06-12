create table if not exists "ClientFileFolder" (
  "id" text primary key default gen_random_uuid()::text,
  "trainerId" text not null references "Trainer"("id") on delete cascade,
  "clientId" text not null references "Client"("id") on delete cascade,
  "name" text not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint "clientfilefolder_unique_name_per_client" unique ("trainerId", "clientId", "name")
);

create index if not exists idx_clientfilefolder_trainer on "ClientFileFolder"("trainerId");
create index if not exists idx_clientfilefolder_client on "ClientFileFolder"("clientId");

create table if not exists "ClientFileItem" (
  "id" text primary key default gen_random_uuid()::text,
  "trainerId" text not null references "Trainer"("id") on delete cascade,
  "clientId" text not null references "Client"("id") on delete cascade,
  "folderId" text not null references "ClientFileFolder"("id") on delete cascade,
  "title" text not null,
  "type" text not null check ("type" in ('FILE', 'LINK')),
  "externalUrl" text,
  "fileName" text,
  "mimeType" text,
  "fileSize" integer,
  "fileUrl" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint "clientfileitem_file_or_link_required" check (
    ("type" = 'FILE' and "fileUrl" is not null) or
    ("type" = 'LINK' and "externalUrl" is not null)
  )
);

create index if not exists idx_clientfileitem_trainer on "ClientFileItem"("trainerId");
create index if not exists idx_clientfileitem_client on "ClientFileItem"("clientId");
create index if not exists idx_clientfileitem_folder on "ClientFileItem"("folderId");
