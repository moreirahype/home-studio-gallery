alter table public.project_included_photos
  add column if not exists release_kind text not null default 'included'
  check (release_kind in ('included', 'manual'));

create index if not exists project_included_photos_project_kind_idx
  on public.project_included_photos (project_id, release_kind);
