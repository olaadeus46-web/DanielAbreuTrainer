alter table "Automation"
  add column if not exists "parentAutomationId" text references "Automation"("id") on delete set null;

create index if not exists idx_automation_parent on "Automation"("parentAutomationId");

alter table "CheckInLink"
  add column if not exists "automationId" text references "Automation"("id") on delete set null;

create index if not exists idx_checkinlink_automation on "CheckInLink"("automationId");

alter table "FeedbackLink"
  add column if not exists "automationId" text references "Automation"("id") on delete set null;

create index if not exists idx_feedbacklink_automation on "FeedbackLink"("automationId");