create or replace function public.sync_voice_project_name() returns trigger
  language plpgsql security definer set search_path='' as $$
begin
  if new.name is distinct from old.name then
    update public.voice_profiles set project_name=new.name where project_id=new.id;
  end if;
  return new;
end$$;

drop trigger if exists voice_project_name_sync on public.projects;
create trigger voice_project_name_sync
  after update on public.projects
  for each row execute function public.sync_voice_project_name();
