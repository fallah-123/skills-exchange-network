-- Additive notification storage. Apply once after 003 using the guarded runner.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  collaboration_request_id integer REFERENCES public.collaboration_requests(id) ON DELETE CASCADE,
  conversation_id integer REFERENCES public.conversations(id) ON DELETE CASCADE,
  last_message_id bigint REFERENCES public.messages(id) ON DELETE CASCADE,
  event_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_event_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  read_at timestamptz,
  CONSTRAINT notifications_type_valid CHECK (type IN ('message', 'request_received', 'request_accepted', 'request_rejected')),
  CONSTRAINT notifications_no_self CHECK (recipient_id <> actor_id),
  CONSTRAINT notifications_count_valid CHECK (event_count >= 1),
  CONSTRAINT notifications_reference_shape CHECK (
    (type = 'message' AND conversation_id IS NOT NULL AND last_message_id IS NOT NULL AND collaboration_request_id IS NULL)
    OR (type IN ('request_received', 'request_accepted', 'request_rejected') AND collaboration_request_id IS NOT NULL
      AND conversation_id IS NULL AND last_message_id IS NULL AND event_count = 1)
  )
);

CREATE UNIQUE INDEX notifications_unread_conversation_key ON public.notifications(recipient_id, conversation_id)
  WHERE type = 'message' AND read_at IS NULL;
CREATE UNIQUE INDEX notifications_request_event_key ON public.notifications(recipient_id, collaboration_request_id, type)
  WHERE type <> 'message';
CREATE INDEX notifications_recipient_activity_idx ON public.notifications(recipient_id, last_event_at DESC, id DESC);
CREATE INDEX notifications_recipient_unread_idx ON public.notifications(recipient_id, last_event_at DESC, id DESC) WHERE read_at IS NULL;

-- Foreign keys establish existence; this guard also checks the linked participants.
CREATE FUNCTION public.notifications_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.type = 'message' THEN
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
CREATE TRIGGER notifications_guard_trg BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_guard();

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notifications FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notifications_guard() FROM PUBLIC;
DO $$
DECLARE api_role text; identity_sequence text;
BEGIN
  identity_sequence := pg_get_serial_sequence('public.notifications', 'id');
  EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', identity_sequence);
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.notifications FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM %I', identity_sequence, api_role);
    EXECUTE format('REVOKE ALL ON FUNCTION public.notifications_guard() FROM %I', api_role);
  END LOOP;
END;
$$;
COMMIT;
