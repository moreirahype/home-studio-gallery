alter table public.projects
  add column if not exists bi_attendant_name text not null default 'Galeria';

alter table public.zapdata_leads
  add column if not exists bi_attendant_name text not null default 'Galeria';
