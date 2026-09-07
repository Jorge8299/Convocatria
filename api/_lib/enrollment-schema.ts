import type { getSql } from './server.js';
export async function ensureEnrollmentSchema(sql:ReturnType<typeof getSql>) {
  await sql`CREATE TABLE IF NOT EXISTS enrollment_campaigns (
    id TEXT PRIMARY KEY,club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,season_year INTEGER NOT NULL,total_cents INTEGER NOT NULL CHECK(total_cents>=50),
    parts JSONB NOT NULL,categories JSONB NOT NULL,terms TEXT NOT NULL,
    published BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS enrollments (
    id TEXT PRIMARY KEY,club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL REFERENCES enrollment_campaigns(id) ON DELETE CASCADE,
    child_name TEXT NOT NULL,birth_date DATE NOT NULL,category TEXT NOT NULL,
    guardian_name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,
    payment_mode TEXT NOT NULL CHECK(payment_mode IN ('full','parts')),
    consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),terms_snapshot TEXT NOT NULL,
    confirmed_at TIMESTAMPTZ,assigned_account_id TEXT REFERENCES club_accounts(id) ON DELETE SET NULL,
    duplicate_key TEXT NOT NULL UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS enrollments_club_idx ON enrollments(club_id,campaign_id)`;
  await sql`CREATE TABLE IF NOT EXISTS enrollment_dues (
    id TEXT PRIMARY KEY,enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>=50),due_date DATE NOT NULL,
    token TEXT NOT NULL UNIQUE,paid_at TIMESTAMPTZ,stripe_session TEXT UNIQUE,stripe_account TEXT,
    checkout_url TEXT,checkout_expires BIGINT,
    receipt_sent_at TIMESTAMPTZ,receipt_error TEXT,
    UNIQUE(enrollment_id,ordinal))`;
  await sql`CREATE TABLE IF NOT EXISTS enrollment_mail (
    id TEXT PRIMARY KEY,due_id TEXT NOT NULL REFERENCES enrollment_dues(id) ON DELETE CASCADE,
    request_key TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'pending',provider_id TEXT,error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
}
