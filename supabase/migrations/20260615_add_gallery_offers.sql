alter table public.projects
  add column if not exists generation_count smallint not null default 15
  check (generation_count between 1 and 20);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('photos', 'video', 'new_shoot')),
  description text not null,
  quantity smallint not null default 1 check (quantity > 0),
  amount_cents integer not null check (amount_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_id_idx
  on public.order_items(order_id);

alter table public.order_items enable row level security;
