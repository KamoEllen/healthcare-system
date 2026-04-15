CREATE TABLE IF NOT EXISTS doctors (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  specialisation  VARCHAR(100) NOT NULL,
  licence_number  VARCHAR(50)  NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctors_user_id ON doctors(user_id);
