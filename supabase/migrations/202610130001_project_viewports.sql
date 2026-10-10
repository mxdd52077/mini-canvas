create table if not exists public.project_viewports(
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  x double precision not null default 0,
  y double precision not null default 0,
  zoom double precision not null default 1,
  updated_at timestamptz not null default now(),
  primary key(user_id,project_id)
);

alter table public.project_viewports enable row level security;
drop policy if exists project_viewports_self on public.project_viewports;
create policy project_viewports_self on public.project_viewports
  for all to authenticated
  using(user_id=(select auth.uid()))
  with check(user_id=(select auth.uid()));

grant select,insert,update,delete on public.project_viewports to authenticated;
