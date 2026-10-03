-- ============================================================
-- Batched email reminders for unread conversation messages, delivered
-- through notification_jobs (20261001000000). At most one digest per person
-- per day; the dispatcher re-counts unread messages at send time and skips
-- the email if they were read in the meantime.
-- ============================================================

-- Queue a digest for everyone in the edition with a message from someone else
-- that has been unread for at least p_min_age. Returns the number queued.
create or replace function public.queue_chat_digests(p_edition text, p_min_age interval)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  insert into public.notification_jobs (edition_slug, registration_id, kind, dedup_key)
  select r.edition_slug, r.id, 'chat_unread_digest',
         format('chat_unread_digest:%s:%s', r.id, to_char(now() at time zone 'Europe/Sofia', 'YYYY-MM-DD'))
  from public.registrations r
  where r.edition_slug = p_edition
    and exists (
      select 1
      from public.list_conversations(r.id) c
      join public.conversation_messages m on m.conversation_id = c.conversation_id
      where c.unread > 0
        and m.author_id <> r.id
        and m.hidden_at is null
        and m.created_at <= now() - p_min_age
        and m.id > coalesce(
          (select cr.last_read_message_id from public.conversation_reads cr
           where cr.conversation_id = c.conversation_id and cr.registration_id = r.id), 0)
    )
  on conflict (dedup_key) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.queue_chat_digests(text, interval) from public, anon, authenticated;
