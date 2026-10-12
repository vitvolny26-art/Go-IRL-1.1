-- Activ020: atomic activation of a Telegram-confirmed invite-only draft.
-- Source migration only. Apply to production only after a separate approval.
-- Invocation is restricted to service_role; the Edge caller must also validate
-- its authenticated owner before calling this function.
create or replace function public.activ020_publish_sent_invite_draft(p_draft_id uuid, p_organizer_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft public.activity_invite_drafts%rowtype;
  payload jsonb;
  published_id uuid;
  actor_name text;
begin
  select * into draft
    from public.activity_invite_drafts
    where id = p_draft_id
    for update;

  if not found or draft.organizer_key is distinct from p_organizer_key then
    raise exception 'activ020_draft_not_found';
  end if;
  if draft.state = 'published' then
    return draft.activity_id;
  end if;
  if draft.state <> 'sent' or draft.expires_at <= now() or draft.prepared_message_id is null then
    raise exception 'activ020_draft_not_confirmed';
  end if;

  payload := draft.activity_payload;
  if coalesce(payload->>'visibility', '') <> 'invite'
    or length(coalesce(payload->>'activityText', '')) not between 1 and 200
    or length(coalesce(payload->>'descriptionText', '')) > 5000
    or length(coalesce(payload->>'address', '')) not between 1 and 500
    or coalesce(payload->>'date', '') !~ '^\\d{4}-\\d{2}-\\d{2}$'
    or coalesce(payload->>'time', '') !~ '^\\d{2}:\\d{2}$'
    or coalesce(payload->>'capacity', '') !~ '^\\d+$'
    or coalesce(payload->>'price', '') !~ '^\\d+$'
  then
    raise exception 'activ020_draft_payload_invalid';
  end if;

  actor_name := coalesce(nullif(left(payload->>'organizer', 200), ''), 'GO IRL');

  insert into public.activities (
    id, category_id, activity_ru, activity_cs, title_ru, title_cs,
    description_ru, description_cs, event_date, event_time, city_id,
    address, location_url, participant_note, activity_type, metadata,
    price, capacity, organizer, organizer_key, visibility
  ) values (
    draft.activity_id, payload->>'categoryId',
    payload->>'activityText', payload->>'activityText',
    coalesce(nullif(payload->>'titleText', ''), payload->>'activityText'),
    coalesce(nullif(payload->>'titleText', ''), payload->>'activityText'),
    coalesce(payload->>'descriptionText', ''), coalesce(payload->>'descriptionText', ''),
    (payload->>'date')::date, (payload->>'time')::time,
    coalesce(nullif(payload->>'cityId', ''), 'olomouc'),
    payload->>'address', nullif(payload->>'locationUrl', ''),
    nullif(payload->>'participantNote', ''),
    coalesce(nullif(payload->>'type', ''), 'custom'),
    coalesce(payload->'metadata', '{}'::jsonb),
    (payload->>'price')::integer, (payload->>'capacity')::integer,
    actor_name, draft.organizer_key, 'invite'
  );

  insert into public.activity_members (activity_id, user_key, display_name, status)
    values (draft.activity_id, draft.organizer_key, actor_name, 'joined');

  update public.activity_invite_drafts
    set state = 'published', updated_at = now()
    where id = draft.id and state = 'sent'
    returning activity_id into published_id;

  if published_id is null then
    raise exception 'activ020_draft_transition_conflict';
  end if;
  return published_id;
end;
$$;

revoke all on function public.activ020_publish_sent_invite_draft(uuid, text) from public, anon, authenticated;
grant execute on function public.activ020_publish_sent_invite_draft(uuid, text) to service_role;
