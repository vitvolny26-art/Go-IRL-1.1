begin;

revoke execute on function public.go_irl_get_my_beauty_confirmation_mode()
from public, anon;

revoke execute on function public.go_irl_set_my_beauty_confirmation_mode(text)
from public, anon;

grant execute on function public.go_irl_get_my_beauty_confirmation_mode()
to authenticated;

grant execute on function public.go_irl_set_my_beauty_confirmation_mode(text)
to authenticated;

notify pgrst, 'reload schema';

commit;
