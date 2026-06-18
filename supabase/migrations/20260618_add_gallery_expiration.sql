alter table public.projects
  add column if not exists expires_at timestamptz;

update public.projects
set expires_at = created_at + interval '7 days'
where expires_at is null;

alter table public.projects
  alter column expires_at set default (now() + interval '7 days');

create index if not exists projects_expires_at_idx
  on public.projects(expires_at);

