create extension if not exists "pgcrypto";

do $$
begin
  create type public.project_status as enum (
    'queued',
    'generating',
    'ready',
    'partially_paid',
    'paid',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.photo_status as enum (
    'queued',
    'generating',
    'ready',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.order_status as enum (
    'pending',
    'paid',
    'expired',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  gallery_token text not null unique,
  zapdata_contact_id text,
  customer_name text,
  phone text,
  source_image_url text not null,
  source_image_path text,
  context_final text not null,
  niche_id text not null default 'universal',
  receipt_id text unique,
  included_photos smallint not null default 1
    check (included_photos between 1 and 20),
  paid_amount_cents integer not null default 790
    check (paid_amount_cents > 0),
  generation_count smallint not null default 15
    check (generation_count between 1 and 20),
  status public.project_status not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  position smallint not null check (position between 1 and 20),
  generation_prompt text not null,
  kie_task_id text unique,
  original_path text,
  preview_path text,
  status public.photo_status not null default 'queued',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, position)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  mercado_pago_payment_id text unique,
  amount_cents integer not null check (amount_cents > 0),
  status public.order_status not null default 'pending',
  pix_qr_code text,
  pix_qr_code_base64 text,
  expires_at timestamptz,
  paid_at timestamptz,
  bi_reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects
  add column if not exists generation_count smallint not null default 15
  check (generation_count between 1 and 20);

create table if not exists public.order_photos (
  order_id uuid not null references public.orders(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete restrict,
  primary key (order_id, photo_id)
);

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

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  model text not null default 'bytedance/v1-pro-fast-image-to-video',
  source_photo_ids uuid[] not null default '{}',
  task_ids text[] not null default '{}',
  clip_paths text[] not null default '{}',
  output_path text,
  status text not null default 'queued'
    check (status in ('queued', 'generating', 'ready', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.video_jobs
  add column if not exists clip_paths text[] not null default '{}';

create table if not exists public.video_clips (
  id uuid primary key default gen_random_uuid(),
  video_job_id uuid not null references public.video_jobs(id) on delete cascade,
  task_id text not null unique,
  source_photo_id uuid references public.photos(id) on delete set null,
  path text,
  status text not null default 'generating'
    check (status in ('generating', 'ready', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.repeat_shoots (
  id uuid primary key default gen_random_uuid(),
  source_project_id uuid references public.projects(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  reference_image_path text,
  theme text not null,
  occasion text,
  style_notes text,
  photo_count smallint not null default 10 check (photo_count between 1 and 20),
  included_photos smallint not null default 1
    check (included_photos between 1 and 20),
  paid_amount_cents integer not null default 790
    check (paid_amount_cents > 0),
  status text not null default 'draft'
    check (status in ('draft', 'pending_payment', 'paid', 'generating', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.repeat_shoots
  add column if not exists included_photos smallint not null default 1
  check (included_photos between 1 and 20);

alter table public.repeat_shoots
  add column if not exists paid_amount_cents integer not null default 790
  check (paid_amount_cents > 0);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  active boolean not null default true,
  campaign_index integer not null default 0,
  last_notified_at timestamptz,
  next_notification_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists photos_project_id_idx
  on public.photos(project_id);

create index if not exists orders_project_id_idx
  on public.orders(project_id);

create index if not exists order_items_order_id_idx
  on public.order_items(order_id);

create index if not exists video_jobs_project_id_idx
  on public.video_jobs(project_id);

create index if not exists video_clips_video_job_id_idx
  on public.video_clips(video_job_id);

create index if not exists repeat_shoots_source_project_id_idx
  on public.repeat_shoots(source_project_id);

create index if not exists push_subscriptions_due_idx
  on public.push_subscriptions(active, next_notification_at);

create index if not exists projects_gallery_token_idx
  on public.projects(gallery_token);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists photos_set_updated_at on public.photos;
create trigger photos_set_updated_at
before update on public.photos
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.photos enable row level security;
alter table public.orders enable row level security;
alter table public.order_photos enable row level security;
alter table public.order_items enable row level security;
alter table public.video_jobs enable row level security;
alter table public.video_clips enable row level security;
alter table public.repeat_shoots enable row level security;
alter table public.push_subscriptions enable row level security;

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('source-images', 'source-images', false, 15728640),
  ('photo-originals', 'photo-originals', false, 20971520),
  ('photo-previews', 'photo-previews', false, 5242880),
  ('video-clips', 'video-clips', false, 52428800),
  ('videos', 'videos', false, 157286400)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;
