alter table projects
  add column niche_id text not null default 'geral',
  add column context_final text,
  add column included_photos smallint not null default 1
    check (included_photos between 1 and 20),
  add column paid_amount_cents integer not null default 490
    check (paid_amount_cents >= 490);

update projects
set context_final = prompt
where context_final is null;

alter table projects
  alter column context_final set not null;

alter table orders
  add column bi_reported_at timestamptz;
