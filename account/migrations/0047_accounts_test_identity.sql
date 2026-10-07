-- migration 0047_accounts_test_identity
-- Mark sol pbc's own test sign-ins so operator tooling can tell them from customers.
-- Set at creation by the pre-approve path for test addresses; the four ids below
-- are the pre-existing test sign-ins.

ALTER TABLE accounts ADD COLUMN test_identity INTEGER NOT NULL DEFAULT 0;

UPDATE accounts SET test_identity = 1 WHERE id IN (
  '64a503ac-5daf-40f8-9c3f-bd9a5f49030b',
  '377825c8-1f8b-4513-bb8c-913886b597a7',
  '528c21a1-cc7a-4ebd-9499-d3165647f682',
  'd0e093ee-4fdf-4b7d-a778-b7ab94532393'
);
