-- Free v1 turns the old purchase-intent inbox into Founders Club feedback and
-- requests for additional free actions. Historical rows are retained and moved
-- to the closest live meaning before the constraint is replaced.

ALTER TABLE contact_messages
  ADD COLUMN IF NOT EXISTS reply_to TEXT;

ALTER TABLE contact_messages
  DROP CONSTRAINT IF EXISTS contact_messages_kind_check;

UPDATE contact_messages
   SET kind = CASE kind
     WHEN 'subscribe' THEN 'feedback'
     WHEN 'topup' THEN 'more_actions'
     ELSE kind
   END
 WHERE kind IN ('subscribe', 'topup');

ALTER TABLE contact_messages
  ADD CONSTRAINT contact_messages_kind_check
  CHECK (kind IN ('feedback', 'more_actions'));

ALTER TABLE contact_messages
  ADD CONSTRAINT contact_messages_reply_to_length_check
  CHECK (reply_to IS NULL OR char_length(reply_to) BETWEEN 3 AND 254);

COMMENT ON COLUMN contact_messages.reply_to IS
  'Optional reply address supplied with a Founders Club message. Required by the server when the sender is a Guest.';
