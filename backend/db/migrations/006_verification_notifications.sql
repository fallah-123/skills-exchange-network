-- Extend notifications with immutable review-event references. Existing clients opt in.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.notifications ADD COLUMN verification_event_id bigint
  REFERENCES public.skill_verification_events(id) ON DELETE RESTRICT;
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_valid;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_valid CHECK (type IN
  ('message','request_received','request_accepted','request_rejected','verification_approved','verification_rejected','verification_revoked'));
ALTER TABLE public.notifications DROP CONSTRAINT notifications_reference_shape;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_reference_shape CHECK (
 (type='message' AND conversation_id IS NOT NULL AND last_message_id IS NOT NULL AND collaboration_request_id IS NULL AND verification_event_id IS NULL)
 OR (type IN ('request_received','request_accepted','request_rejected') AND collaboration_request_id IS NOT NULL AND conversation_id IS NULL AND last_message_id IS NULL AND verification_event_id IS NULL AND event_count=1)
 OR (type IN ('verification_approved','verification_rejected','verification_revoked') AND verification_event_id IS NOT NULL AND conversation_id IS NULL AND last_message_id IS NULL AND collaboration_request_id IS NULL AND event_count=1)
);
CREATE UNIQUE INDEX notifications_verification_event_key ON public.notifications(recipient_id,verification_event_id)
  WHERE verification_event_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.notifications_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.type IN ('verification_approved','verification_rejected','verification_revoked') THEN
    IF NOT EXISTS (SELECT 1 FROM public.skill_verification_events e
      JOIN public.skill_verification_requests r ON r.id=e.request_id
      WHERE e.id=NEW.verification_event_id AND e.actor_id=NEW.actor_id AND r.user_id=NEW.recipient_id
        AND NEW.type='verification_'||e.action) THEN
      RAISE EXCEPTION 'invalid verification notification' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.type = 'message' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      JOIN public.collaboration_requests r ON r.id = c.collaboration_request_id
      WHERE m.id = NEW.last_message_id AND c.id = NEW.conversation_id
        AND m.sender_id = NEW.actor_id AND r.status = 'accepted'
        AND ((r.sender_id = NEW.actor_id AND r.recipient_id = NEW.recipient_id)
          OR (r.recipient_id = NEW.actor_id AND r.sender_id = NEW.recipient_id))
    ) THEN
      RAISE EXCEPTION 'invalid notification relationship' USING ERRCODE = 'check_violation', CONSTRAINT = 'notifications_relationship_valid';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.collaboration_requests r WHERE r.id = NEW.collaboration_request_id
        AND ((NEW.type = 'request_received' AND r.sender_id = NEW.actor_id AND r.recipient_id = NEW.recipient_id)
          OR (NEW.type IN ('request_accepted', 'request_rejected') AND r.recipient_id = NEW.actor_id AND r.sender_id = NEW.recipient_id
            AND r.status = CASE NEW.type WHEN 'request_accepted' THEN 'accepted' ELSE 'rejected' END))
    ) THEN
      RAISE EXCEPTION 'invalid notification relationship' USING ERRCODE = 'check_violation', CONSTRAINT = 'notifications_relationship_valid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
