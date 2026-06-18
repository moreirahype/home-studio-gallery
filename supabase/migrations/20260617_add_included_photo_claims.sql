create table if not exists public.project_included_photos (
  project_id uuid not null references public.projects(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete restrict,
  claimed_at timestamptz not null default now(),
  primary key (project_id, photo_id)
);

alter table public.project_included_photos enable row level security;

drop policy if exists "Service role can manage included photo claims"
on public.project_included_photos;

create policy "Service role can manage included photo claims"
on public.project_included_photos
for all
to service_role
using (true)
with check (true);
