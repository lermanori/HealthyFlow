-- Native push destinations are separate from Web Push subscriptions because
-- APNs device tokens do not have VAPID endpoint/key material.
CREATE TABLE IF NOT EXISTS native_push_devices (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform     TEXT NOT NULL CHECK (platform IN ('ios')),
    device_token TEXT NOT NULL,
    app_id       TEXT NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (device_token, app_id)
);

CREATE INDEX IF NOT EXISTS native_push_devices_user_idx
    ON native_push_devices (user_id);

ALTER TABLE native_push_devices ENABLE ROW LEVEL SECURITY;
