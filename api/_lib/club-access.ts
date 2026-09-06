import type { AccountRow, getSql } from './server.js';

export async function accessibleStores(session: Pick<AccountRow,'id'|'role'|'club_id'>, sql: ReturnType<typeof getSql>) {
  if(session.role==='entrenador') return sql`SELECT account_id,club_id,area,data FROM club_stores WHERE club_id=${session.club_id} AND (account_id=${session.id} OR (area='team' AND account_id IN (SELECT id FROM club_accounts WHERE role='entrenador' AND active=TRUE AND club_id=${session.club_id})))`;
  if(session.role==='coordinador') return sql`SELECT account_id,club_id,area,data FROM club_stores WHERE club_id=${session.club_id} AND area IN ('team','stats','rivals','agenda')`;
  return sql`SELECT account_id,club_id,area,data FROM club_stores WHERE (${session.role==='superadmin'} OR club_id=${session.club_id}) AND area IN ('team','rivals')`;
}
export async function accessibleAccounts(session: Pick<AccountRow,'role'|'club_id'> | null, sql: ReturnType<typeof getSql>) {
  // The public active-user directory is intentionally retained for the existing name + PIN login.
  if(!session) return sql`SELECT * FROM club_accounts WHERE active=TRUE ORDER BY created_at`;
  if(session.role==='superadmin') return sql`SELECT * FROM club_accounts ORDER BY created_at`;
  return sql`SELECT * FROM club_accounts WHERE club_id=${session.club_id} AND (${session.role==='admin'} OR active=TRUE) ORDER BY created_at`;
}
