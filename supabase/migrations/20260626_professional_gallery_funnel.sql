alter table public.projects
  add column if not exists gallery_type text not null default 'universal'
  check (gallery_type in ('universal', 'professional'));

alter table public.zapdata_leads
  add column if not exists gallery_type text not null default 'universal'
  check (gallery_type in ('universal', 'professional'));

alter table public.projects
  add column if not exists extra_photo_pricing jsonb,
  add column if not exists video_price_cents integer not null default 1990 check (video_price_cents >= 0),
  add column if not exists first_impression_pack_price_cents integer not null default 1490 check (first_impression_pack_price_cents >= 0);

alter table public.zapdata_leads
  add column if not exists extra_photo_pricing jsonb,
  add column if not exists video_price_cents integer not null default 1990 check (video_price_cents >= 0),
  add column if not exists first_impression_pack_price_cents integer not null default 1490 check (first_impression_pack_price_cents >= 0);

alter table public.projects
  alter column video_price_cents set default 1990,
  alter column first_impression_pack_price_cents set default 1490;

alter table public.zapdata_leads
  alter column video_price_cents set default 1990,
  alter column first_impression_pack_price_cents set default 1490;

alter table public.photos
  drop constraint if exists photos_position_check;

alter table public.photos
  add constraint photos_position_check check (position between 1 and 80);

alter table public.order_items
  drop constraint if exists order_items_kind_check;

alter table public.order_items
  add constraint order_items_kind_check
  check (kind in ('photos', 'video', 'new_shoot', 'first_impression_pack'));

create table if not exists public.gallery_products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  gallery_type text not null default 'universal'
    check (gallery_type in ('universal', 'professional')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.gallery_attendants (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.gallery_products (name, gallery_type)
values
  ('Sem produto', 'universal'),
  ('Galeria IA - Profissional', 'professional')
on conflict (name) do nothing;

insert into public.gallery_attendants (name)
values
  ('Galeria'),
  ('Galeria Sheila')
on conflict (name) do nothing;
