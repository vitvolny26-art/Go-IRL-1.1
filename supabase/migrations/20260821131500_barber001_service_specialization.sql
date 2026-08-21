-- BARBER001: specialization-driven professional workspace.
-- Additive only. Existing services become Nails. Supported presets: nails, barber.

do $preflight$
begin
  if to_regprocedure('public.get_my_beauty_profile_v3()') is null then
    raise exception 'BARBER001 requires get_my_beauty_profile_v3()';
  end if;
  if to_regprocedure('public.save_my_beauty_profile_v3(text,text,text,text,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,timestamptz)') is null then
    raise exception 'BARBER001 requires canonical save_my_beauty_profile_v3(...)';
  end if;
end
$preflight$;

alter table public.beauty_professional_services
  add column if not exists specialization text not null default 'nails';

alter table public.beauty_professional_services
  drop constraint if exists beauty_professional_services_specialization_check;

alter table public.beauty_professional_services
  add constraint beauty_professional_services_specialization_check
  check (specialization in ('nails', 'barber'));

comment on column public.beauty_professional_services.specialization is
  'Professional workspace UI discriminator. Currently supported: nails, barber.';

do $migration$
declare
  v_signature constant regprocedure := 'public.get_my_beauty_profile_v3()'::regprocedure;
  v_definition text;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position('''specialization'', service.specialization' in v_definition) = 0 then
    if position('''id'', service.client_key,' in v_definition) = 0 then
      raise exception 'BARBER001 get v3 service JSON marker not found';
    end if;
    v_definition := replace(
      v_definition,
      '''id'', service.client_key,',
      '''id'', service.client_key,' || E'\n          ''specialization'', service.specialization,'
    );
    execute v_definition;
  end if;
end
$migration$;

do $migration$
declare
  v_signature constant regprocedure :=
    'public.save_my_beauty_profile_v3(text,text,text,text,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,timestamptz)'::regprocedure;
  v_definition text;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('v_specialization text;' in v_definition) = 0 then
    if position('v_active boolean;' in v_definition) = 0 then raise exception 'BARBER001 active variable marker not found'; end if;
    v_definition := replace(v_definition, 'v_active boolean;', 'v_active boolean;' || E'\n  v_specialization text;');
  end if;

  if position('v_specialization := coalesce(nullif(btrim(v_item ->> ''specialization''), ''''), ''nails'');' in v_definition) = 0 then
    if position('v_active := coalesce((v_item ->> ''active'')::boolean, true);' in v_definition) = 0 then raise exception 'BARBER001 active assignment marker not found'; end if;
    v_definition := replace(
      v_definition,
      'v_active := coalesce((v_item ->> ''active'')::boolean, true);',
      'v_active := coalesce((v_item ->> ''active'')::boolean, true);' || E'\n    v_specialization := coalesce(nullif(btrim(v_item ->> ''specialization''), ''''), ''nails'');\n    if v_specialization not in (''nails'', ''barber'') then\n      raise exception ''Invalid Beauty service specialization'' using errcode = ''22023'';\n    end if;'
    );
  end if;

  if position('client_key, specialization, service_name,' in regexp_replace(v_definition, '[[:space:]]+', ' ', 'g')) = 0 then
    if v_definition !~ 'client_key,[[:space:]]*service_name,' then raise exception 'BARBER001 insert column marker not found'; end if;
    v_definition := regexp_replace(
      v_definition,
      'client_key,[[:space:]]*service_name,',
      'client_key, specialization, service_name,',
      'g'
    );
  end if;

  if position('v_client_key, v_specialization, v_service_name,' in regexp_replace(v_definition, '[[:space:]]+', ' ', 'g')) = 0 then
    if v_definition !~ 'v_client_key,[[:space:]]*v_service_name,' then raise exception 'BARBER001 insert value marker not found'; end if;
    v_definition := regexp_replace(
      v_definition,
      'v_client_key,[[:space:]]*v_service_name,',
      'v_client_key, v_specialization, v_service_name,',
      'g'
    );
  end if;

  if position('specialization = excluded.specialization' in v_definition) = 0 then
    if position('service_name = excluded.service_name,' in v_definition) = 0 then raise exception 'BARBER001 conflict update marker not found'; end if;
    v_definition := replace(v_definition, 'service_name = excluded.service_name,', 'specialization = excluded.specialization,' || E'\n      service_name = excluded.service_name,');
  end if;

  execute v_definition;
end
$migration$;

notify pgrst, 'reload schema';
