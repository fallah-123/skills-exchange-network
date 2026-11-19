-- Evidence review only; no account is promoted by this migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.users ADD COLUMN role text NOT NULL DEFAULT 'developer'
  CONSTRAINT users_role_valid CHECK (role IN ('developer','admin'));

CREATE TABLE public.skill_verification_requests (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  skill_id integer NOT NULL REFERENCES public.skills(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked','withdrawn')),
  contribution text NOT NULL CHECK (char_length(btrim(contribution)) BETWEEN 50 AND 1500),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  sealed boolean NOT NULL DEFAULT false,
  changed_by integer NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  feedback text NOT NULL DEFAULT '' CHECK (char_length(feedback) <= 1000),
  rubric jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rubric) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX skill_verification_one_active ON public.skill_verification_requests(user_id,skill_id)
  WHERE status IN ('pending','approved');
CREATE INDEX skill_verification_owner_history ON public.skill_verification_requests(user_id,created_at DESC,id DESC);
CREATE INDEX skill_verification_queue ON public.skill_verification_requests(status,created_at,id);
CREATE INDEX skill_verification_skill ON public.skill_verification_requests(skill_id);

CREATE TABLE public.skill_verification_evidence (
  request_id integer NOT NULL REFERENCES public.skill_verification_requests(id) ON DELETE RESTRICT,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
  url text NOT NULL CHECK (char_length(url) BETWEEN 1 AND 1000 AND url ~ '^https://[^[:space:]]+$'),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 300),
  PRIMARY KEY (request_id,position), UNIQUE(request_id,url)
);
CREATE TABLE public.skill_verification_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id integer NOT NULL REFERENCES public.skill_verification_requests(id) ON DELETE RESTRICT,
  request_version integer NOT NULL CHECK (request_version > 0),
  actor_id integer NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('submitted','approved','rejected','revoked','withdrawn')),
  note text NOT NULL CHECK (char_length(note) <= 1000),
  rubric jsonb NOT NULL CHECK (jsonb_typeof(rubric) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(request_id,request_version)
);
CREATE INDEX skill_verification_event_actor ON public.skill_verification_events(actor_id,created_at DESC);

CREATE FUNCTION public.verification_guard_request() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'verification history cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.version <> 1 OR NEW.sealed OR NEW.changed_by <> NEW.user_id
      OR NEW.feedback <> '' OR NEW.rubric <> '{}'::jsonb THEN
      RAISE EXCEPTION 'invalid initial verification' USING ERRCODE='23514';
    END IF;
  ELSE
    IF (NEW.id,NEW.user_id,NEW.skill_id,NEW.contribution,NEW.created_at)
      IS DISTINCT FROM (OLD.id,OLD.user_id,OLD.skill_id,OLD.contribution,OLD.created_at) THEN
      RAISE EXCEPTION 'verification identity and evidence explanation are immutable' USING ERRCODE='23514';
    END IF;
    IF NOT OLD.sealed AND NEW.sealed AND
      (to_jsonb(NEW) - 'sealed') = (to_jsonb(OLD) - 'sealed') THEN
      IF NOT EXISTS (SELECT 1 FROM public.skill_verification_evidence WHERE request_id=NEW.id) THEN
        RAISE EXCEPTION 'evidence is required' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END IF;
    IF NOT OLD.sealed OR NOT NEW.sealed OR NEW.version <> OLD.version+1 OR NOT (
      (OLD.status='pending' AND NEW.status IN ('approved','rejected','withdrawn')) OR
      (OLD.status='approved' AND NEW.status IN ('revoked','withdrawn'))) THEN
      RAISE EXCEPTION 'invalid verification transition' USING ERRCODE='23514';
    END IF;
    IF NEW.status IN ('approved','rejected','revoked') THEN
      IF NEW.changed_by=NEW.user_id OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=NEW.changed_by AND role='admin') THEN
        RAISE EXCEPTION 'independent administrator required' USING ERRCODE='23514';
      END IF;
      IF char_length(btrim(NEW.feedback)) < 1 THEN
        RAISE EXCEPTION 'review feedback is required' USING ERRCODE='23514';
      END IF;
      IF NEW.status='approved' AND NOT (NEW.rubric @> '{"accessible":true,"relevant":true,"contribution":true,"substantial":true,"credible":true}'::jsonb) THEN
        RAISE EXCEPTION 'complete approval rubric required' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.changed_by <> NEW.user_id OR (OLD.status='approved' AND pg_trigger_depth() < 2) THEN
      RAISE EXCEPTION 'withdrawal requires owner; approved withdrawal requires skill removal' USING ERRCODE='23514';
    END IF;
    NEW.updated_at := clock_timestamp();
  END IF;
  IF NEW.status IN ('pending','approved') AND NOT EXISTS (
    SELECT 1 FROM public.developer_skills WHERE user_id=NEW.user_id AND skill_id=NEW.skill_id AND skill_type='offered'
  ) THEN RAISE EXCEPTION 'offered skill required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER verification_request_guard BEFORE INSERT OR UPDATE OR DELETE ON public.skill_verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.verification_guard_request();

CREATE FUNCTION public.verification_require_sealed() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.skill_verification_requests WHERE id=NEW.id AND NOT sealed) THEN
    RAISE EXCEPTION 'submission must include sealed evidence' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER verification_submission_complete AFTER INSERT ON public.skill_verification_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.verification_require_sealed();

CREATE FUNCTION public.verification_guard_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP <> 'INSERT' OR EXISTS (SELECT 1 FROM public.skill_verification_requests WHERE id=NEW.request_id AND sealed) THEN
    RAISE EXCEPTION 'submitted evidence is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER verification_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON public.skill_verification_evidence
  FOR EACH ROW EXECUTE FUNCTION public.verification_guard_evidence();

CREATE FUNCTION public.verification_guard_event() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP <> 'INSERT' OR pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'review events are generated and immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER verification_event_guard BEFORE INSERT OR UPDATE OR DELETE ON public.skill_verification_events
  FOR EACH ROW EXECUTE FUNCTION public.verification_guard_event();
CREATE FUNCTION public.verification_record_event() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.version <> OLD.version THEN
    INSERT INTO public.skill_verification_events(request_id,request_version,actor_id,action,note,rubric)
    VALUES (NEW.id,NEW.version,NEW.changed_by,CASE WHEN TG_OP='INSERT' THEN 'submitted' ELSE NEW.status END,NEW.feedback,NEW.rubric);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER verification_request_audit AFTER INSERT OR UPDATE ON public.skill_verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.verification_record_event();

CREATE FUNCTION public.verification_retire_skill() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.skill_type='offered' THEN
    UPDATE public.skill_verification_requests SET status='withdrawn',version=version+1,
      changed_by=OLD.user_id,feedback='Offered skill removed by its owner.',rubric='{}'::jsonb
      WHERE user_id=OLD.user_id AND skill_id=OLD.skill_id AND status IN ('pending','approved');
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER verification_skill_removal BEFORE DELETE ON public.developer_skills
  FOR EACH ROW EXECUTE FUNCTION public.verification_retire_skill();

ALTER TABLE public.skill_verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_verification_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_verification_events ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE object_name text; api_role text;
BEGIN
  FOREACH object_name IN ARRAY ARRAY['skill_verification_requests','skill_verification_evidence','skill_verification_events'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',object_name);
    FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',object_name,api_role);
    END LOOP;
  END LOOP;
  FOR object_name IN SELECT pg_get_serial_sequence('public.'||t,'id') FROM unnest(ARRAY['skill_verification_requests','skill_verification_events']) t LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC',object_name);
    FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM %I',object_name,api_role);
    END LOOP;
  END LOOP;
  FOR object_name IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'verification_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',object_name);
    FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',object_name,api_role);
    END LOOP;
  END LOOP;
END;
$$;
COMMIT;
