-- GROOMING009: two-sided visit closure + post-visit rating/review loop.
-- Repository migration only. Production apply requires separate explicit approval.

begin;

create table if not exists public.beauty_visit_feedback (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.beauty_bookings(id) on delete cascade,
  profile_id uuid not null references public.beauty_professional_profiles(id) on delete cascade,
  client_user_key text not null,
  professional_detail text null check (professional_detail in ('served_on_time','served_client_late','client_no_show','problem')),
  professional_note text null,
  professional_actor_user_key text null,
  professional_recorded_at timestamptz null,
  client_confirmation text null check (client_confirmation in ('happened','did_not_happen','problem')),
  rating smallint null check (rating between 1 and 5),
  review_text text null,
  client_actor_user_key text null,
  client_recorded_at timestamptz null,
  dispute_state text not null default 'none' check (dispute_state in ('none','open','resolved')),
  review_is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.beauty_visit_feedback enable row level security;
revoke all on table public.beauty_visit_feedback from anon;
revoke insert, update, delete on table public.beauty_visit_feedback from authenticated;
grant select on table public.beauty_visit_feedback to authenticated;

drop policy if exists beauty_visit_feedback_participant_select on public.beauty_visit_feedback;
create policy beauty_visit_feedback_participant_select
on public.beauty_visit_feedback
for select
to authenticated
using (
  public.go_irl_auth_user_key() = client_user_key
  or public.go_irl_owns_beauty_profile(profile_id)
);

create or replace function public.go_irl_record_professional_visit_detail(
  p_booking_id uuid,
  p_detail text,
  p_note text default null
)
returns public.beauty_visit_feedback
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_booking public.beauty_bookings%rowtype;
  v_feedback public.beauty_visit_feedback%rowtype;
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;
  if p_detail not in ('served_on_time','served_client_late','client_no_show','problem') then
    raise exception 'invalid professional visit detail' using errcode = '22023';
  end if;

  select * into v_booking from public.beauty_bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if not public.go_irl_owns_beauty_profile(v_booking.profile_id) then
    raise exception 'current professional profile ownership required' using errcode = '42501';
  end if;
  if v_booking.status not in ('completed','no_show') then
    raise exception 'booking must already be completed or no_show' using errcode = '22023';
  end if;
  if v_booking.status = 'completed' and p_detail = 'client_no_show' then
    raise exception 'client_no_show conflicts with completed booking' using errcode = '22023';
  end if;
  if v_booking.status = 'no_show' and p_detail in ('served_on_time','served_client_late') then
    raise exception 'served detail conflicts with no_show booking' using errcode = '22023';
  end if;

  insert into public.beauty_visit_feedback (
    booking_id, profile_id, client_user_key,
    professional_detail, professional_note, professional_actor_user_key, professional_recorded_at,
    updated_at
  ) values (
    v_booking.id, v_booking.profile_id, v_booking.client_user_key,
    p_detail, nullif(btrim(p_note), ''), v_actor, now(), now()
  )
  on conflict (booking_id) do update set
    professional_detail = excluded.professional_detail,
    professional_note = excluded.professional_note,
    professional_actor_user_key = excluded.professional_actor_user_key,
    professional_recorded_at = excluded.professional_recorded_at,
    updated_at = now()
  returning * into v_feedback;

  insert into public.beauty_booking_events (
    booking_id,event_type,actor_user_key,from_status,to_status,payload,deduplication_key
  ) values (
    v_booking.id,'visit_professional_detail_recorded',v_actor,v_booking.status,v_booking.status,
    jsonb_build_object('detail',p_detail),
    'beauty-visit-professional:' || v_booking.id::text || ':' || extract(epoch from v_feedback.professional_recorded_at)::bigint::text
  );

  return v_feedback;
end;
$$;

create or replace function public.go_irl_submit_client_visit_feedback(
  p_booking_id uuid,
  p_confirmation text,
  p_rating smallint default null,
  p_review_text text default null
)
returns public.beauty_visit_feedback
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_booking public.beauty_bookings%rowtype;
  v_dispute text;
  v_public boolean;
  v_feedback public.beauty_visit_feedback%rowtype;
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;
  if p_confirmation not in ('happened','did_not_happen','problem') then
    raise exception 'invalid client confirmation' using errcode = '22023';
  end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'rating must be between 1 and 5' using errcode = '22023';
  end if;
  if p_confirmation <> 'happened' and (p_rating is not null or nullif(btrim(p_review_text), '') is not null) then
    raise exception 'rating/review requires happened confirmation' using errcode = '22023';
  end if;

  select * into v_booking from public.beauty_bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if v_booking.client_user_key is distinct from v_actor then
    raise exception 'booking client required' using errcode = '42501';
  end if;
  if v_booking.status not in ('completed','no_show') then
    raise exception 'booking is not eligible for post-visit feedback' using errcode = '22023';
  end if;

  v_dispute := case
    when v_booking.status = 'completed' and p_confirmation = 'happened' then 'none'
    when v_booking.status = 'no_show' and p_confirmation = 'did_not_happen' then 'none'
    else 'open'
  end;
  v_public := v_booking.status = 'completed'
    and p_confirmation = 'happened'
    and p_rating is not null
    and v_dispute = 'none';

  insert into public.beauty_visit_feedback (
    booking_id, profile_id, client_user_key,
    client_confirmation, rating, review_text, client_actor_user_key, client_recorded_at,
    dispute_state, review_is_public, updated_at
  ) values (
    v_booking.id, v_booking.profile_id, v_booking.client_user_key,
    p_confirmation, p_rating, nullif(btrim(p_review_text), ''), v_actor, now(),
    v_dispute, v_public, now()
  )
  on conflict (booking_id) do update set
    client_confirmation = excluded.client_confirmation,
    rating = excluded.rating,
    review_text = excluded.review_text,
    client_actor_user_key = excluded.client_actor_user_key,
    client_recorded_at = excluded.client_recorded_at,
    dispute_state = excluded.dispute_state,
    review_is_public = excluded.review_is_public,
    updated_at = now()
  returning * into v_feedback;

  insert into public.beauty_booking_events (
    booking_id,event_type,actor_user_key,from_status,to_status,payload,deduplication_key
  ) values (
    v_booking.id,'visit_client_feedback_submitted',v_actor,v_booking.status,v_booking.status,
    jsonb_build_object('confirmation',p_confirmation,'rating',p_rating,'disputeState',v_dispute),
    'beauty-visit-client:' || v_booking.id::text || ':' || extract(epoch from v_feedback.client_recorded_at)::bigint::text
  );

  return v_feedback;
end;
$$;

revoke all on function public.go_irl_record_professional_visit_detail(uuid,text,text) from public;
revoke all on function public.go_irl_submit_client_visit_feedback(uuid,text,smallint,text) from public;
grant execute on function public.go_irl_record_professional_visit_detail(uuid,text,text) to authenticated;
grant execute on function public.go_irl_submit_client_visit_feedback(uuid,text,smallint,text) to authenticated;

alter table public.event_notifications drop constraint if exists event_notifications_kind_check;
alter table public.event_notifications add constraint event_notifications_kind_check check (kind in (
  'join_confirmed','join_pending','join_waitlisted','request_approved','request_rejected','event_changed','event_cancelled',
  'social.favorited','social.favorite_organizer_event_created',
  'services.booking_requested','services.booking_confirmed','services.booking_declined','services.booking_cancelled','services.booking_rescheduled',
  'services.waitlist_slot_available','services.booking_reminder_24h','services.booking_reminder_3h','services.booking_visit_confirmation_24h'
));

create or replace function public.go_irl_queue_beauty_visit_confirmation_24h()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.beauty_bookings%rowtype;
  v_profile public.beauty_professional_profiles%rowtype;
  v_due_at timestamptz;
  v_delivery_key text;
begin
  if new.event_type <> 'status_changed' or new.to_status not in ('completed','no_show') then return new; end if;
  select * into v_booking from public.beauty_bookings where id = new.booking_id;
  if not found or v_booking.client_user_key is null then return new; end if;
  select * into v_profile from public.beauty_professional_profiles where id = v_booking.profile_id;
  if not found then return new; end if;

  v_due_at := coalesce(v_booking.completed_at, v_booking.service_ends_at) + interval '24 hours';
  v_delivery_key := 'beauty:booking:' || v_booking.id::text || ':visit-confirmation:24h';

  insert into public.event_notifications (
    user_key,activity_id,kind,payload,status,next_attempt_at,provider,delivery_key
  ) values (
    v_booking.client_user_key,null,'services.booking_visit_confirmation_24h',
    jsonb_build_object(
      'subjectType','beauty_booking','bookingId',v_booking.id,'profileId',v_booking.profile_id,
      'serviceId',v_booking.service_id,'title',v_booking.service_name_snapshot,
      'date',to_char(v_booking.starts_at at time zone 'Europe/Prague','YYYY-MM-DD'),
      'time',to_char(v_booking.starts_at at time zone 'Europe/Prague','HH24:MI:SS'),
      'counterpartName',v_profile.display_name,'bookingStatus',v_booking.status,
      'sourceEventId',new.id,'openPath','/services'
    ),
    'scheduled',v_due_at,'telegram',v_delivery_key
  ) on conflict (delivery_key) do nothing;

  return new;
end;
$$;

revoke execute on function public.go_irl_queue_beauty_visit_confirmation_24h() from public, anon, authenticated;
drop trigger if exists beauty_booking_events_queue_visit_confirmation_24h on public.beauty_booking_events;
create trigger beauty_booking_events_queue_visit_confirmation_24h
after insert on public.beauty_booking_events
for each row execute function public.go_irl_queue_beauty_visit_confirmation_24h();

notify pgrst, 'reload schema';
commit;
