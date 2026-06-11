-- Migration 0006: drop oauth_state (ATProto OAuth login removed)
--
-- The ATProto/Bluesky OAuth login path was removed entirely (email-OTP +
-- passkey only going forward). oauth_state only ever held OAuth transaction
-- state (code_verifier, dpop_private_key, authorization_server) for that
-- flow. No code reads or writes it anymore. The index drops with the table.
DROP TABLE IF EXISTS oauth_state;
