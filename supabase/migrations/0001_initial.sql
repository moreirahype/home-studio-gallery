create extension if not exists "pgcrypto";

create type project_status as enum (
  'queued',
  'generating',
  'ready',
  'partially_paid',
  'paid',
  'failed'
);

create type photo_status as enum ('queued', 'generating', 'ready', 'failed');
create type order_status as enum ('pending', 'paid', 'expired', 'cancelled');

create table projects (
  id uuid primary key default gen_random_uuid(),
  gallery_token text not null unique,
  zapdata_contact_id text not null,
  customer_name text not null,
  phone text not null,
  source_image_path text not null,
  prompt text not null,
  receipt_id text not null unique,
  status project_status not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  position smallint not null check (position between 1 and 20),
  kie_task_id text unique,
  original_path text,
  preview_path text,
  status photo_status not null default 'queued',
  created_at timestamptz not null default now(),
  unique (project_id, position)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete restrict,
  mercado_pago_payment_id text unique,
  amount_cents integer not null check (amount_cents > 0),
  status order_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table order_photos (
  order_id uuid not null references orders(id) on delete cascade,
  photo_id uuid not null references photos(id) on delete restrict,
  primary key (order_id, photo_id)
);

create index photos_project_id_idx on photos(project_id);
create index orders_project_id_idx on orders(project_id);

alter table projects enable row level security;
alter table photos enable row level security;
alter table orders enable row level security;
alter table order_photos enable row level security;
