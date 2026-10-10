alter table public.model_configs drop constraint if exists model_configs_kind_check;
alter table public.model_configs add constraint model_configs_kind_check check(kind in('image','video','audio','chat'));
