import type {getSql} from './server.js';
export const callupMigration = [
 `CREATE TABLE IF NOT EXISTS club_callups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id text NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 account_id text NOT NULL REFERENCES club_accounts(id) ON DELETE CASCADE,event_id text NOT NULL,
 token text UNIQUE NOT NULL, title text NOT NULL,message text NOT NULL,
match_date text NOT NULL,match_time text NOT NULL,field text NOT NULL,
  prompt text NOT NULL DEFAULT '',closed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,event_id))`,
  `ALTER TABLE club_callups ADD COLUMN IF NOT EXISTS prompt text NOT NULL DEFAULT ''`,
 `CREATE TABLE IF NOT EXISTS convocatoria_respuestas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),convocatoria_id uuid NOT NULL REFERENCES club_callups(id) ON DELETE CASCADE,
 jugador_id text NOT NULL,nombre text NOT NULL,dorsal text NOT NULL DEFAULT '',
 estado text NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','SI','NO')),
 motivo text CHECK(char_length(motivo)<=160),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz,
 UNIQUE(convocatoria_id,jugador_id))`,
 `CREATE TABLE IF NOT EXISTS callup_request_limits (key text PRIMARY KEY,window_start timestamptz NOT NULL DEFAULT now(),attempts integer NOT NULL DEFAULT 1)`,
 `ALTER TABLE club_callups ENABLE ROW LEVEL SECURITY`,
 `ALTER TABLE convocatoria_respuestas ENABLE ROW LEVEL SECURITY`,
 `ALTER TABLE callup_request_limits ENABLE ROW LEVEL SECURITY`,
 `REVOKE ALL ON club_callups,convocatoria_respuestas,callup_request_limits FROM PUBLIC`,
 `CREATE INDEX IF NOT EXISTS club_callups_owner_date ON club_callups(account_id,created_at DESC)`
];
let ready:Promise<unknown>|undefined;
export function ensureCallupSchema(sql:ReturnType<typeof getSql>){
 if(!ready)ready=sql.transaction([sql`SELECT pg_advisory_xact_lock(718209)`,...callupMigration.map(statement=>sql.query(statement,[]))]).catch(error=>{ready=undefined;throw error;});
 return ready;
}
