CREATE TABLE IF NOT EXISTS patients (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth     DATE,
  blood_type        VARCHAR(5),
  emergency_contact VARCHAR(255),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);
