-- Private messaging storage. Apply once, after 001 and 002, as the backend's
-- database owner. This migration does not backfill conversations or messages.
-- Existing accepted connections can open their conversation lazily in the API.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.conversations (
  id                       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  collaboration_request_id integer NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT conversations_request_key UNIQUE (collaboration_request_id),
  CONSTRAINT conversations_request_fk
    FOREIGN KEY (collaboration_request_id)
    REFERENCES public.collaboration_requests (id) ON DELETE CASCADE
);

CREATE TABLE public.messages (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id   integer NOT NULL,
  sender_id         integer NOT NULL,
  client_message_id uuid NOT NULL,
  body              text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT messages_conversation_fk
    FOREIGN KEY (conversation_id) REFERENCES public.conversations (id) ON DELETE CASCADE,
  CONSTRAINT messages_sender_fk
    FOREIGN KEY (sender_id) REFERENCES public.users (id) ON DELETE CASCADE,
  -- The client reuses its UUID when retrying the same send. The API must return
  -- the existing message (or reject a changed body), rather than inserting twice.
  CONSTRAINT messages_client_message_key
    UNIQUE (conversation_id, sender_id, client_message_id),
  CONSTRAINT messages_body_length CHECK (char_length(body) BETWEEN 1 AND 2000),
  CONSTRAINT messages_body_not_blank CHECK (body ~ '[^[:space:]]')
);

-- Supports bounded history queries within a conversation, including older pages.
CREATE INDEX messages_conversation_history_idx
  ON public.messages (conversation_id, id DESC);
-- Also supports the API's per-sender sliding-window send limit.
CREATE INDEX messages_sender_idx ON public.messages (sender_id, created_at DESC);

CREATE FUNCTION public.messaging_guard_conversation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  request_status text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'conversation identity and creation time cannot be changed'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'conversations_immutable';
    END IF;
    RETURN NEW;
  END IF;

  SELECT r.status INTO request_status
  FROM public.collaboration_requests r
  WHERE r.id = NEW.collaboration_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'collaboration request does not exist'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'conversations_request_fk';
  END IF;
  IF request_status <> 'accepted' THEN
    RAISE EXCEPTION 'a conversation requires an accepted collaboration request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conversations_accepted_request_required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER conversations_guard_trg
  BEFORE INSERT OR UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.messaging_guard_conversation();

CREATE FUNCTION public.messaging_guard_message() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  request_sender integer;
  request_recipient integer;
  request_status text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'messages cannot be edited or reassigned'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'messages_immutable';
    END IF;
    RETURN NEW;
  END IF;

  SELECT r.sender_id, r.recipient_id, r.status
    INTO request_sender, request_recipient, request_status
  FROM public.conversations c
  JOIN public.collaboration_requests r ON r.id = c.collaboration_request_id
  WHERE c.id = NEW.conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation does not exist'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'messages_conversation_fk';
  END IF;
  IF request_status <> 'accepted' OR NEW.sender_id NOT IN (request_sender, request_recipient) THEN
    RAISE EXCEPTION 'only participants in an accepted connection can send messages'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'messages_sender_is_participant';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_guard_trg
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messaging_guard_message();

-- Express uses server-side sessions and the table-owner database connection.
-- Supabase JWT roles cannot represent those sessions. Do not expose these tables
-- through the Supabase Data API: RLS has no client policies, and grants inherited
-- from Supabase's default privileges are explicitly revoked on these objects.
-- The owner still has access; API participant checks are required for every read
-- and write. No SECURITY DEFINER function is introduced.
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.conversations, public.messages FROM PUBLIC;
REVOKE ALL ON FUNCTION public.messaging_guard_conversation(), public.messaging_guard_message() FROM PUBLIC;

DO $$
DECLARE
  api_role text;
  identity_sequence text;
BEGIN
  FOR identity_sequence IN
    SELECT pg_get_serial_sequence('public.conversations', 'id')
    UNION ALL
    SELECT pg_get_serial_sequence('public.messages', 'id')
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', identity_sequence);
  END LOOP;

  -- These roles exist on Supabase but need not exist in ordinary PostgreSQL.
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.conversations, public.messages FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON FUNCTION public.messaging_guard_conversation(), public.messaging_guard_message() FROM %I', api_role);
    FOR identity_sequence IN
      SELECT pg_get_serial_sequence('public.conversations', 'id')
      UNION ALL
      SELECT pg_get_serial_sequence('public.messages', 'id')
    LOOP
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM %I', identity_sequence, api_role);
    END LOOP;
  END LOOP;
END;
$$;

COMMIT;
