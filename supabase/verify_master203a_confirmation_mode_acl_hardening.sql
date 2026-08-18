do $$
begin
  if has_function_privilege('anon', 'public.go_irl_get_my_beauty_confirmation_mode()', 'EXECUTE') then
    raise exception 'anon must not execute confirmation mode getter';
  end if;

  if has_function_privilege('anon', 'public.go_irl_set_my_beauty_confirmation_mode(text)', 'EXECUTE') then
    raise exception 'anon must not execute confirmation mode setter';
  end if;

  if not has_function_privilege('authenticated', 'public.go_irl_get_my_beauty_confirmation_mode()', 'EXECUTE') then
    raise exception 'authenticated must execute confirmation mode getter';
  end if;

  if not has_function_privilege('authenticated', 'public.go_irl_set_my_beauty_confirmation_mode(text)', 'EXECUTE') then
    raise exception 'authenticated must execute confirmation mode setter';
  end if;
end;
$$;
