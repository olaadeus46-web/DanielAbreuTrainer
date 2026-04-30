create table if not exists "ClientFeedback" (
  "id" text primary key default gen_random_uuid()::text,
  "clientId" text not null references "Client"("id") on delete cascade,
  "language" text not null default 'de',
  "trainingDuration" text not null,
  "progressSinceStart" text not null,
  "specificImprovements" text,
  "biggestChange" text,
  "supportFeeling" text not null,
  "coachCanImprove" text,
  "wouldRecommend" text not null,
  "allowInstagramUse" boolean not null,
  "mainDecisionReason" text,
  "submittedAt" timestamptz not null default now(),
  "createdAt" timestamptz not null default now()
);

create table if not exists "FeedbackLink" (
  "id" text primary key default gen_random_uuid()::text,
  "clientId" text not null references "Client"("id") on delete cascade,
  "token" text not null unique,
  "expiresAt" timestamptz not null,
  "usedAt" timestamptz,
  "submittedFeedbackId" text references "ClientFeedback"("id") on delete set null,
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_clientfeedback_client on "ClientFeedback"("clientId");
create index if not exists idx_clientfeedback_submitted_at on "ClientFeedback"("submittedAt");
create index if not exists idx_feedbacklink_client on "FeedbackLink"("clientId");
create index if not exists idx_feedbacklink_expires on "FeedbackLink"("expiresAt");
