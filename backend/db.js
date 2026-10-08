import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  database: process.env.PG_DATABASE || 'medivault',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
})

export async function query(text, values) {
  return pool.query(text, values)
}

export async function initializeDatabase() {
  await query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  await query(`
    CREATE TABLE IF NOT EXISTS doctors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      specialization VARCHAR(150),
      phone VARCHAR(30),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS patients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) NOT NULL,
      email VARCHAR(255) UNIQUE,
      password_hash TEXT NOT NULL,
      phone VARCHAR(30) NOT NULL,
      age INTEGER NOT NULL CHECK (age > 0 AND age < 150),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await query('ALTER TABLE patients ADD COLUMN IF NOT EXISTS password_hash TEXT')
  await query("UPDATE patients SET password_hash = '' WHERE password_hash IS NULL")
  await query('ALTER TABLE patients ALTER COLUMN password_hash SET NOT NULL')
  await query(`
    CREATE TABLE IF NOT EXISTS reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id VARCHAR(60) NOT NULL UNIQUE,
      doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
      patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
      report_type VARCHAR(150) NOT NULL,
      original_file_name TEXT NOT NULL,
      file_key TEXT NOT NULL UNIQUE,
      storage_provider VARCHAR(20) NOT NULL DEFAULT 'local' CHECK (storage_provider IN ('local', 's3')),
      mime_type VARCHAR(100) NOT NULL,
      file_size BIGINT CHECK (file_size IS NULL OR file_size >= 0),
      comments TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await query('CREATE INDEX IF NOT EXISTS idx_patients_name_phone ON patients (name, phone)')
  await query('CREATE INDEX IF NOT EXISTS idx_reports_doctor_patient ON reports (doctor_id, patient_id)')
  await query('CREATE INDEX IF NOT EXISTS idx_reports_patient ON reports (patient_id)')
  await query('CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC)')
}

export { pool }
