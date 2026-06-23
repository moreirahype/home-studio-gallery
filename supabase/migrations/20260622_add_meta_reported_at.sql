alter table public.orders
  add column if not exists meta_reported_at timestamptz;
