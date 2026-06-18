create table if not exists public.zapdata_leads (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  project_id uuid references public.projects(id) on delete set null,
  zapdata_contact_id text,
  customer_name text,
  phone text,
  source_image_url text not null,
  context_final text not null,
  niche_id text not null default 'universal',
  included_photos smallint not null default 1
    check (included_photos between 1 and 20),
  paid_amount_cents integer not null default 790
    check (paid_amount_cents > 0),
  generation_count smallint not null default 15
    check (generation_count between 1 and 20),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'converted', 'expired', 'failed')),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists zapdata_leads_phone_idx
  on public.zapdata_leads(phone);

create index if not exists zapdata_leads_contact_idx
  on public.zapdata_leads(zapdata_contact_id);

alter table public.zapdata_leads enable row level security;

drop policy if exists "Service role can manage zapdata leads"
on public.zapdata_leads;

create policy "Service role can manage zapdata leads"
on public.zapdata_leads
for all
to service_role
using (true)
with check (true);
