-- =============================================================================
-- Skills Developers Network - Migration 001: initial schema
-- PostgreSQL 14+ (developed and verified on 16)
--
-- Tables: users, developer_profiles, skills, developer_skills,
--         collaboration_requests
--
-- Conventions
--   * snake_case names, plural table names
--   * integer identity primary keys (except developer_skills: composite key)
--   * all timestamps are timestamptz, default now()
--   * emails are stored lower-cased and trimmed; the CHECK constraint rejects
--     anything else, so the backend MUST normalise before INSERT
--   * enum-like columns use text + CHECK (simpler to migrate than CREATE TYPE)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Shared trigger function: keep updated_at honest
-- -----------------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 1. users - account and authentication data
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  display_name   text        NOT NULL,
  email          text        NOT NULL,
  password_hash  text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_display_name_trimmed CHECK (display_name = btrim(display_name)),
  CONSTRAINT users_display_name_length  CHECK (char_length(display_name) BETWEEN 2 AND 50),
  CONSTRAINT users_email_normalised     CHECK (email = lower(btrim(email))),
  CONSTRAINT users_email_length         CHECK (char_length(email) BETWEEN 3 AND 254),
  -- Deliberately loose shape check; the backend does the real validation.
  CONSTRAINT users_email_shape          CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT users_email_key            UNIQUE (email),
  CONSTRAINT users_password_hash_present CHECK (char_length(password_hash) > 0)
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. developer_profiles - exactly one per user
--    The row is created together with the user (inside the registration
--    transaction), so every user always has a profile. bio and
--    experience_level are NULL until the user completes the profile form;
--    the backend enforces "required on save", the database enforces
--    "valid if present".
-- -----------------------------------------------------------------------------
CREATE TABLE developer_profiles (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           integer     NOT NULL,
  bio               text,
  experience_level  text,
  interests         text,
  github_url        text,
  portfolio_url     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT developer_profiles_user_id_key UNIQUE (user_id),
  CONSTRAINT developer_profiles_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,

  CONSTRAINT developer_profiles_bio_length
    CHECK (bio IS NULL OR char_length(bio) <= 500),
  CONSTRAINT developer_profiles_experience_level_valid
    CHECK (experience_level IS NULL
           OR experience_level IN ('beginner', 'intermediate', 'advanced')),
  CONSTRAINT developer_profiles_interests_length
    CHECK (interests IS NULL OR char_length(interests) <= 300),
  CONSTRAINT developer_profiles_github_url_valid
    CHECK (github_url IS NULL
           OR (github_url ~ '^https?://[^[:space:]]+$' AND char_length(github_url) <= 255)),
  CONSTRAINT developer_profiles_portfolio_url_valid
    CHECK (portfolio_url IS NULL
           OR (portfolio_url ~ '^https?://[^[:space:]]+$' AND char_length(portfolio_url) <= 255))
);

CREATE TRIGGER developer_profiles_set_updated_at
  BEFORE UPDATE ON developer_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. skills - the standardised catalogue (seeded; users pick, never type)
--    Case-insensitive uniqueness: "React" and "react" cannot both exist.
-- -----------------------------------------------------------------------------
CREATE TABLE skills (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT skills_name_trimmed CHECK (name = btrim(name)),
  CONSTRAINT skills_name_length  CHECK (char_length(name) BETWEEN 1 AND 50)
);

CREATE UNIQUE INDEX skills_name_lower_key ON skills (lower(name));

-- -----------------------------------------------------------------------------
-- 4. developer_skills - user <-> skill, split by skill_type
--    Composite primary key (user_id, skill_id, skill_type):
--      * blocks duplicate assignment within the same category
--      * still allows the same skill as BOTH 'offered' and 'wanted'
--    No surrogate id is needed: nothing references a single row.
-- -----------------------------------------------------------------------------
CREATE TABLE developer_skills (
  user_id     integer     NOT NULL,
  skill_id    integer     NOT NULL,
  skill_type  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT developer_skills_pkey PRIMARY KEY (user_id, skill_id, skill_type),
  CONSTRAINT developer_skills_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  -- RESTRICT: a catalogue skill that someone uses cannot be silently deleted.
  CONSTRAINT developer_skills_skill_fk
    FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE RESTRICT,
  CONSTRAINT developer_skills_skill_type_valid
    CHECK (skill_type IN ('offered', 'wanted'))
);

-- Matching asks "who offers / wants skill X?". The primary key already covers
-- "what skills does user U have?" (leading column user_id).
CREATE INDEX developer_skills_skill_type_idx
  ON developer_skills (skill_id, skill_type);

-- -----------------------------------------------------------------------------
-- 5. collaboration_requests
--    Status model: pending -> accepted | rejected (terminal).
-- -----------------------------------------------------------------------------
CREATE TABLE collaboration_requests (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_id     integer     NOT NULL,
  recipient_id  integer     NOT NULL,
  message       text,
  status        text        NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT collaboration_requests_sender_fk
    FOREIGN KEY (sender_id)    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT collaboration_requests_recipient_fk
    FOREIGN KEY (recipient_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT collaboration_requests_no_self_request
    CHECK (sender_id <> recipient_id),
  CONSTRAINT collaboration_requests_status_valid
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  CONSTRAINT collaboration_requests_message_length
    CHECK (message IS NULL OR char_length(message) <= 500)
);

-- One live request per PAIR of developers, in either direction.
-- LEAST/GREATEST makes (A->B) and (B->A) the same pair.
--   * pending  : blocks a second request while the first awaits an answer
--   * accepted : the pair is already connected; no new request is needed
--   * rejected : not listed, so the sender may try again later
-- (Decision: this is slightly stricter than FR-08, which only requires
--  blocking duplicate pending requests. Drop 'accepted' from the list below
--  if you prefer the literal spec behaviour.)
CREATE UNIQUE INDEX collaboration_requests_one_live_per_pair_key
  ON collaboration_requests (LEAST(sender_id, recipient_id),
                             GREATEST(sender_id, recipient_id))
  WHERE status IN ('pending', 'accepted');

-- Query patterns: "my incoming requests" / "my outgoing requests", newest first.
CREATE INDEX collaboration_requests_recipient_idx
  ON collaboration_requests (recipient_id, created_at DESC);
CREATE INDEX collaboration_requests_sender_idx
  ON collaboration_requests (sender_id, created_at DESC);

-- Database-level guard for the state machine (the backend checks too):
--   * sender and recipient can never be changed after creation
--   * a decided request (accepted / rejected) can never change status again
--   * the only legal change is pending -> accepted | rejected
CREATE FUNCTION collaboration_requests_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.sender_id <> OLD.sender_id OR NEW.recipient_id <> OLD.recipient_id THEN
    RAISE EXCEPTION 'sender and recipient of a request cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status <> OLD.status AND OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER collaboration_requests_guard_trg
  BEFORE UPDATE ON collaboration_requests
  FOR EACH ROW EXECUTE FUNCTION collaboration_requests_guard();

CREATE TRIGGER collaboration_requests_set_updated_at
  BEFORE UPDATE ON collaboration_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
