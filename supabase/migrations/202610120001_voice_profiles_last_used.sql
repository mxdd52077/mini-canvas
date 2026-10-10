alter table public.voice_profiles add column if not exists last_used_at timestamptz;
