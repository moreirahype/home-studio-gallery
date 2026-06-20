alter table if exists public.projects
  add column if not exists pricing_base_amount_cents integer;

alter table if exists public.zapdata_leads
  add column if not exists pricing_base_amount_cents integer;

comment on column public.projects.pricing_base_amount_cents is
  'Optional amount used as the upsell price-table anchor. paid_amount_cents remains the real front-end credit.';

comment on column public.zapdata_leads.pricing_base_amount_cents is
  'Optional amount used as the upsell price-table anchor when the lead converts into a gallery.';
