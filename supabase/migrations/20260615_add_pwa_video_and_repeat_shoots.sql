create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  model text not null default 'bytedance/v1-pro-fast-image-to-video',
  source_photo_ids uuid[] not null default '{}',
  task_ids text[] not null default '{}',
  output_path text,
  status text not null default 'queued'
    check (status in ('queued', 'generating', 'ready', 'failed')),
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

create index if not exists video_jobs_project_id_idx
  on public.video_jobs(project_id);

create index if not exists repeat_shoots_source_project_id_idx
  on public.repeat_shoots(source_project_id);

create index if not exists push_subscriptions_due_idx
  on public.push_subscriptions(active, next_notification_at);

alter table public.video_jobs enable row level security;
alter table public.repeat_shoots enable row level security;
alter table public.push_subscriptions enable row level security;
