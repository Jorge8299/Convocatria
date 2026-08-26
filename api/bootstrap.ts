import { ApiRequest, ApiResponse, fail, getSession, getSql, mapAccount, publicAccount } from './_lib/server.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const session = await getSession(req);
    const sql = getSql();
    const accountRows = await sql`SELECT * FROM club_accounts WHERE active=TRUE ORDER BY created_at`;
    const accounts = accountRows.map((row) => publicAccount(mapAccount(row)));
    if (!session) { res.status(200).json({ accounts, session: null }); return }
    const stores = session.role === 'entrenador'
      ? await sql`SELECT account_id,area,data FROM club_stores WHERE account_id=${session.id} OR (area='team' AND account_id IN (SELECT id FROM club_accounts WHERE role='entrenador' AND active=TRUE))`
      : session.role === 'coordinador'
        ? await sql`SELECT account_id,area,data FROM club_stores WHERE area IN ('team','stats','rivals','agenda')`
        : await sql`SELECT account_id,area,data FROM club_stores WHERE area IN ('team','rivals')`;
    res.status(200).json({ accounts, session: publicAccount(session), stores });
  } catch (error) { fail(res, error) }
}
