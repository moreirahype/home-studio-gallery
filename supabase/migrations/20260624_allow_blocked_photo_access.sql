alter table public.project_included_photos
  add column if not exists release_kind text not null default 'included';

alter table public.project_included_photos
  drop constraint if exists project_included_photos_release_kind_check;

alter table public.project_included_photos
  add constraint project_included_photos_release_kind_check
  check (release_kind in ('included', 'manual', 'blocked'));
