CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(100) NOT NULL,
  resource_id UUID        NOT NULL,
  metadata    JSONB,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id     ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource    ON audit_logs(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp   ON audit_logs(timestamp DESC);
