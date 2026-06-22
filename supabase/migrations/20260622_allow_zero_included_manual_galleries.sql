alter table public.projects
  drop constraint if exists projects_included_photos_check;

alter table public.projects
  add constraint projects_included_photos_check
  check (included_photos between 0 and 20);

alter table public.projects
  drop constraint if exists projects_paid_amount_cents_check;

alter table public.projects
  add constraint projects_paid_amount_cents_check
  check (paid_amount_cents >= 0);

alter table public.zapdata_leads
  drop constraint if exists zapdata_leads_included_photos_check;

alter table public.zapdata_leads
  add constraint zapdata_leads_included_photos_check
  check (included_photos between 0 and 20);

alter table public.zapdata_leads
  drop constraint if exists zapdata_leads_paid_amount_cents_check;

alter table public.zapdata_leads
  add constraint zapdata_leads_paid_amount_cents_check
  check (paid_amount_cents >= 0);
