import { ApiRequest, ApiResponse, fail, getSession, getSessionImpersonator, getSql, mapAccount, publicAccount } from './_lib/server.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const session = await getSession(req);
    const impersonator = session ? await getSessionImpersonator(req) : null;
    const sql = getSql();
    const accountRows = session && ['admin','superadmin'].includes(session.role)
      ? await sql`SELECT * FROM club_accounts ORDER BY created_at`
      : await sql`SELECT * FROM club_accounts WHERE active=TRUE ORDER BY created_at`;
    const accounts = accountRows.map((row) => publicAccount(mapAccount(row)));
    if (!session) { res.status(200).json({ accounts, session: null, impersonator: null }); return }
    const stores = session.role === 'entrenador'
      ? await sql`SELECT account_id,area,data FROM club_stores WHERE account_id=${session.id} OR (area='team' AND account_id IN (SELECT id FROM club_accounts WHERE role='entrenador' AND active=TRUE))`
      : session.role === 'coordinador'
        ? await sql`SELECT account_id,area,data FROM club_stores WHERE area IN ('team','stats','rivals','agenda')`
        : await sql`SELECT account_id,area,data FROM club_stores WHERE area IN ('team','rivals')`;
    res.status(200).json({ accounts, session: publicAccount(session), impersonator: impersonator ? publicAccount(impersonator) : null, stores });
  } catch (error) { fail(res, error) }
}
