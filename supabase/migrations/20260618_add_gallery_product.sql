alter table public.projects
  add column if not exists product_name text not null default 'Galeria';

alter table public.zapdata_leads
  add column if not exists product_name text not null default 'Galeria';

update public.projects
set product_name = coalesce(nullif(niche_id, ''), 'Galeria')
where product_name = 'Galeria';

update public.zapdata_leads
set product_name = coalesce(nullif(niche_id, ''), 'Galeria')
where product_name = 'Galeria';
