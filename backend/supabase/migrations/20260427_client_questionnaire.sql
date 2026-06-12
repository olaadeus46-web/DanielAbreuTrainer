alter table "Client"
  add column if not exists "phone" text,
  add column if not exists "heightCm" numeric(6,2),
  add column if not exists "waistCircumferenceCm" numeric(6,2),
  add column if not exists "birthDate" date,
  add column if not exists "address" text,
  add column if not exists "gymExperience" text,
  add column if not exists "motivation" text,
  add column if not exists "activityAndWork" text,
  add column if not exists "trainingAvailability" text,
  add column if not exists "nutritionHabits" text,
  add column if not exists "healthIssues" text,
  add column if not exists "trainingPlanNotes" text;
