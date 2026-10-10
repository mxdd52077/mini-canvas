create table if not exists public.voice_profiles(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  project_name text not null,
  name text not null check(char_length(name) between 1 and 80),
  voice_id text not null check(char_length(voice_id) between 1 and 160),
  source_model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,voice_id)
);

create index if not exists voice_profiles_user_project_idx
  on public.voice_profiles(user_id,project_name,name);

alter table public.voice_profiles enable row level security;
drop policy if exists voice_profiles_self on public.voice_profiles;
create policy voice_profiles_self on public.voice_profiles
  for all to authenticated
  using(user_id=(select auth.uid()))
  with check(user_id=(select auth.uid()));

grant select,insert,update,delete on public.voice_profiles to authenticated;
