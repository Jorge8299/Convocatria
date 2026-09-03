import { createHash, randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export type ClubRole = 'entrenador' | 'coordinador' | 'admin' | 'superadmin';
export type FootballStage = 'querubin' | 'prebenjamin' | 'benjamin' | 'alevin';
export type TrainingYear = 'primero' | 'segundo' | 'mixto';
export interface AccountRow { id: string; name: string; role: ClubRole; teamLabel: string; footballStage: FootballStage | null; trainingYear: TrainingYear | null; pinHash: string; active: boolean; createdAt: string }
export interface PublicAccount { id: string; name: string; role: ClubRole; teamLabel: string; footballStage: FootballStage | null; trainingYear: TrainingYear | null; active: boolean; createdAt: string }
export interface ApiRequest { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown; query?: Record<string, string | string[]> }
export interface ApiResponse { status(code: number): ApiResponse; json(value: unknown): void; setHeader(name: string, value: string | string[]): void; end(): void }

const SESSION_COOKIE = 'convo_session';
const SESSION_DAYS = 30;

function sqlClient() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no está configurada');
  return neon(process.env.DATABASE_URL);
}

export async function ensureSchema() {
  const sql = sqlClient();
  await sql`CREATE TABLE IF NOT EXISTS club_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('entrenador','coordinador','admin','superadmin')),
    team_label TEXT NOT NULL DEFAULT '',
    football_stage TEXT,
    training_year TEXT,
    pin_hash TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE club_accounts ADD COLUMN IF NOT EXISTS football_stage TEXT`;
  await sql`ALTER TABLE club_accounts ADD COLUMN IF NOT EXISTS training_year TEXT`;
  await sql`DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='club_accounts_role_check'
          AND pg_get_constraintdef(oid) NOT LIKE '%''admin''%'
      ) THEN
        ALTER TABLE club_accounts DROP CONSTRAINT club_accounts_role_check;
        ALTER TABLE club_accounts ADD CONSTRAINT club_accounts_role_check
          CHECK (role IN ('entrenador','coordinador','admin','superadmin'));
      END IF;
    END
  $$`;
  await sql`CREATE TABLE IF NOT EXISTS club_stores (
    account_id TEXT NOT NULL REFERENCES club_accounts(id) ON DELETE CASCADE,
    area TEXT NOT NULL CHECK (area IN ('team','stats','journeys','rivals','boards','agenda')),
    data JSONB NOT NULL DEFAULT 'null'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, area)
  )`;
  await sql`DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='club_stores_area_check'
          AND pg_get_constraintdef(oid) NOT LIKE '%agenda%'
      ) THEN
        ALTER TABLE club_stores DROP CONSTRAINT club_stores_area_check;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='club_stores_area_check'
      ) THEN
        ALTER TABLE club_stores ADD CONSTRAINT club_stores_area_check
          CHECK (area IN ('team','stats','journeys','rivals','boards','agenda'));
      END IF;
    END
  $$`;
  await sql`CREATE TABLE IF NOT EXISTS club_sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES club_accounts(id) ON DELETE CASCADE,
    impersonator_account_id TEXT REFERENCES club_accounts(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE club_sessions ADD COLUMN IF NOT EXISTS impersonator_account_id TEXT REFERENCES club_accounts(id) ON DELETE SET NULL`;
  await sql`CREATE TABLE IF NOT EXISTS club_login_attempts (
    attempt_key TEXT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS club_login_audit (
    id BIGSERIAL PRIMARY KEY,
    account_id TEXT REFERENCES club_accounts(id) ON DELETE SET NULL,
    account_name TEXT NOT NULL,
    account_role TEXT NOT NULL,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS club_login_audit_logged_at_idx ON club_login_audit (logged_at DESC)`;
  await sql`INSERT INTO club_accounts (id,name,role,team_label,pin_hash,active)
    VALUES ('superadmin','Administrador','admin','Administración','c647f0ac',TRUE)
    ON CONFLICT (id) DO UPDATE SET role='admin'`;
  await sql`INSERT INTO club_accounts (id,name,role,team_label,pin_hash,active)
    VALUES ('platform-superadmin','Superadmin','superadmin','Control de la aplicación','f14e4628',TRUE)
    ON CONFLICT (id) DO UPDATE SET role='superadmin',pin_hash=EXCLUDED.pin_hash,active=TRUE`;
  await sql`DELETE FROM club_sessions WHERE expires_at < NOW()`;
  await sql`DELETE FROM club_login_attempts WHERE attempted_at < NOW()-INTERVAL '1 hour'`;
  await sql`DELETE FROM club_login_audit WHERE logged_at < NOW()-INTERVAL '1 year'`;
}

export function hashPin(pin: string) {
  let hash = 2166136261;
  for (const character of `convo-pin:${pin}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const parseCookies = (header: string | string[] | undefined) => Object.fromEntries((Array.isArray(header) ? header.join(';') : header || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((pair) => pair.length === 2));

export async function getSession(req: ApiRequest): Promise<AccountRow | null> {
  await ensureSchema();
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const sql = sqlClient();
  const rows = await sql`SELECT a.id,a.name,a.role,a.team_label,a.football_stage,a.training_year,a.pin_hash,a.active,a.created_at
    FROM club_sessions s JOIN club_accounts a ON a.id=s.account_id
    WHERE s.token_hash=${tokenHash(token)} AND s.expires_at>NOW() AND a.active=TRUE LIMIT 1`;
  return rows[0] ? mapAccount(rows[0]) : null;
}

export async function getSessionImpersonator(req: ApiRequest): Promise<AccountRow | null> {
  await ensureSchema();
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const sql = sqlClient();
  const rows = await sql`SELECT a.*
    FROM club_sessions s JOIN club_accounts a ON a.id=s.impersonator_account_id
    WHERE s.token_hash=${tokenHash(token)} AND s.expires_at>NOW() AND a.active=TRUE LIMIT 1`;
  return rows[0] ? mapAccount(rows[0]) : null;
}

export async function createSession(accountId: string, res: ApiResponse, impersonatorAccountId?: string) {
  const token = randomBytes(32).toString('base64url');
  const sql = sqlClient();
  await sql`INSERT INTO club_sessions (token_hash,account_id,impersonator_account_id,expires_at) VALUES (${tokenHash(token)},${accountId},${impersonatorAccountId || null},NOW()+INTERVAL '30 days')`;
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${SESSION_DAYS * 86400}`);
}

export async function destroySession(req: ApiRequest, res: ApiResponse) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) {
    const sql = sqlClient();
    await sql`DELETE FROM club_sessions WHERE token_hash=${tokenHash(token)}`;
  }
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`);
}

export function publicAccount(account: AccountRow): PublicAccount { const { pinHash: _pinHash, ...safe } = account; return safe }
export function mapAccount(row: Record<string, unknown>): AccountRow { return { id: String(row.id), name: String(row.name), role: row.role as ClubRole, teamLabel: String(row.team_label), footballStage: row.football_stage ? row.football_stage as FootballStage : null, trainingYear: row.training_year ? row.training_year as TrainingYear : null, pinHash: String(row.pin_hash), active: Boolean(row.active), createdAt: new Date(String(row.created_at)).toISOString() } }
export function getSql() { return sqlClient() }
export function loginAttemptKey(req:ApiRequest,accountId:string) { const forwarded=req.headers['x-forwarded-for']; const ip=Array.isArray(forwarded)?forwarded[0]:forwarded?.split(',')[0] || 'unknown'; return createHash('sha256').update(`${ip}:${accountId}`).digest('hex') }
export async function isRateLimited(key:string) { const sql=sqlClient(); const rows=await sql`SELECT COUNT(*)::int AS count FROM club_login_attempts WHERE attempt_key=${key} AND attempted_at>NOW()-INTERVAL '15 minutes'`; return Number(rows[0]?.count || 0)>=6 }
export async function recordFailedLogin(key:string) { const sql=sqlClient(); await sql`INSERT INTO club_login_attempts (attempt_key) VALUES (${key})` }
export async function clearFailedLogins(key:string) { const sql=sqlClient(); await sql`DELETE FROM club_login_attempts WHERE attempt_key=${key}` }
export function jsonBody<T>(req: ApiRequest): T { return (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}) as T }
export function methodNotAllowed(res: ApiResponse) { res.status(405).json({ error: 'Método no permitido' }) }
export function fail(res: ApiResponse, error: unknown) { console.error(error); res.status(500).json({ error: 'No se pudo completar la operación.' }) }
