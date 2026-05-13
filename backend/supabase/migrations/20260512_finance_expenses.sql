create table if not exists "Expense" (
  "id" text primary key default gen_random_uuid()::text,
  "trainerId" text not null references "Trainer"("id") on delete cascade,
  "title" text not null,
  "description" text,
  "amount" numeric(10,2) not null check ("amount" > 0),
  "category" text,
  "paymentMethod" text,
  "type" text not null default 'FIXED' check ("type" in ('FIXED', 'VARIABLE', 'ONE_OFF')),
  "expenseDate" timestamptz not null default now(),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists idx_expense_trainer on "Expense"("trainerId");
create index if not exists idx_expense_date on "Expense"("expenseDate");
create index if not exists idx_expense_type on "Expense"("type");

create table if not exists "ExpenseAttachment" (
  "id" text primary key default gen_random_uuid()::text,
  "expenseId" text not null references "Expense"("id") on delete cascade,
  "fileName" text not null,
  "mimeType" text,
  "fileSize" integer,
  "url" text not null,
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_expenseattachment_expense on "ExpenseAttachment"("expenseId");
