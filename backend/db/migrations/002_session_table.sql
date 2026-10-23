-- =============================================================================
-- Skills Developers Network - Migration 002: login sessions
--
-- Server-side session storage used by express-session + connect-pg-simple.
-- The three columns (sid, sess, expire) are the layout that library expects.
-- Run this once, after migration 001.
-- =============================================================================

CREATE TABLE user_sessions (
  sid     varchar       NOT NULL,
  sess    json          NOT NULL,
  expire  timestamp(6)  NOT NULL,

  CONSTRAINT user_sessions_pkey PRIMARY KEY (sid)
);

-- Lets the library delete expired sessions without scanning the whole table.
CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);
