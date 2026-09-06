import { accessibleAccounts, accessibleStores } from './_lib/club-access.js';
import { ApiRequest, ApiResponse, fail, getSession, getSessionImpersonator, getSql, mapAccount, publicAccount } from './_lib/server.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const session = await getSession(req);
    const impersonator = session ? await getSessionImpersonator(req) : null;
    const sql = getSql();
    const accountRows = await accessibleAccounts(session, sql);
    const accounts = accountRows.map((row) => publicAccount(mapAccount(row)));
    if (!session) { res.status(200).json({ accounts, session: null, impersonator: null }); return }
    const auditLogs = session.role === 'superadmin'
      ? await sql`SELECT id,account_id,account_name,account_role,logged_at FROM club_login_audit ORDER BY logged_at DESC LIMIT 100`
      : [];
    const clubs = session.role === 'superadmin' ? await sql`SELECT * FROM clubs ORDER BY created_at` : await sql`SELECT * FROM clubs WHERE id=${session.club_id}`;
    const fields = session.role === 'superadmin' ? await sql`SELECT * FROM club_fields ORDER BY club_id,id` : await sql`SELECT * FROM club_fields WHERE club_id=${session.club_id} ORDER BY id`;
    const stores = await accessibleStores(session, sql);
    res.status(200).json({ accounts, clubs, fields, session: publicAccount(session), impersonator: impersonator ? publicAccount(impersonator) : null, stores, auditLogs });
  } catch (error) { fail(res, error) }
}
