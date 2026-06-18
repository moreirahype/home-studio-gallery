alter table public.projects
  add column if not exists bi_attendant_name text not null default 'Galeria';

alter table public.zapdata_leads
  add column if not exists bi_attendant_name text not null default 'Galeria';

update public.projects
set bi_attendant_name =
  'Galeria ' || (paid_amount_cents / 100)::text || '.' ||
  lpad((paid_amount_cents % 100)::text, 2, '0')
where bi_attendant_name = 'Galeria';

update public.zapdata_leads
set bi_attendant_name =
  'Galeria ' || (paid_amount_cents / 100)::text || '.' ||
  lpad((paid_amount_cents % 100)::text, 2, '0')
where bi_attendant_name = 'Galeria';
