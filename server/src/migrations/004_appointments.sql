CREATE TABLE IF NOT EXISTS appointments (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id   UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id    UUID        NOT NULL REFERENCES doctors(id)  ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite index for slot-availability check: WHERE doctor_id=$1 AND scheduled_at=$2
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_doctor_scheduled
  ON appointments(doctor_id, scheduled_at)
  WHERE status != 'cancelled';

CREATE INDEX IF NOT EXISTS idx_appointments_patient_id   ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id    ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status       ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
