-- Add isAbsent flag to Client table
alter table "Client" add column if not exists "isAbsent" boolean not null default false;
