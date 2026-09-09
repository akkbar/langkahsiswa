DROP INDEX IF EXISTS refresh_token_session_unique;
CREATE UNIQUE INDEX refresh_token_session_unique ON refresh_tokens(session_id)
 WHERE session_id IS NOT NULL AND revoked_at IS NULL;
