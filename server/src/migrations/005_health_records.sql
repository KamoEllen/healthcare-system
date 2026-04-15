CREATE TABLE IF NOT EXISTS health_records (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id   UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id    UUID        NOT NULL REFERENCES doctors(id)  ON DELETE CASCADE,
  diagnosis    TEXT        NOT NULL,
  prescription TEXT,
  notes        TEXT,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_records_patient_id ON health_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_health_records_doctor_id  ON health_records(doctor_id);
CREATE INDEX IF NOT EXISTS idx_health_records_created_at ON health_records(created_at DESC);
