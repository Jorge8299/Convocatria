import { accessibleAccounts, accessibleStores } from './_lib/club-access.js';
import { ApiRequest, ApiResponse, fail, getSession, getSessionImpersonator, getSql, mapAccount, publicAccount } from './_lib/server.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    res.setHeader('Cache-Control','private, no-store');
    const savedSession = await getSession(req);
    const sql = getSql();
    const requestedSlug=String(req.query?.club || 'ud-oliva');
    const requestedClub=(await sql`SELECT * FROM clubs WHERE slug=${requestedSlug} AND activo=TRUE LIMIT 1`)[0];
    if(!requestedClub && req.query?.clubAccess==='1'){res.status(404).json({error:'Club no encontrado.'});return}
    // A club link must not reuse a global session or an account from another club.
    // Keep the global session available at the platform's root URL.
    const session = req.query?.clubAccess === '1'
      ? (savedSession?.club_id === requestedClub.id ? savedSession : null)
      : savedSession;
    const impersonator = session ? await getSessionImpersonator(req) : null;
    const accountRows = session ? await accessibleAccounts(session, sql) : await sql`SELECT * FROM club_accounts WHERE active=TRUE AND club_id=${requestedClub?.id || null} ORDER BY created_at`;
    const accounts = accountRows.map((row) => publicAccount(mapAccount(row)));
    if (!session) { res.status(200).json({ accounts,clubs:requestedClub?[requestedClub]:[], session: null, impersonator: null }); return }
    const auditLogs = session.role === 'superadmin'
      ? await sql`SELECT id,account_id,account_name,account_role,logged_at FROM club_login_audit ORDER BY logged_at DESC LIMIT 100`
      : [];
    const clubs = session.role === 'superadmin' ? await sql`SELECT * FROM clubs WHERE activo=TRUE ORDER BY created_at` : await sql`SELECT * FROM clubs WHERE id=${session.club_id}`;
    const fields = session.role === 'superadmin' ? await sql`SELECT * FROM club_fields WHERE club_id IN (SELECT id FROM clubs WHERE activo=TRUE) ORDER BY club_id,id` : await sql`SELECT * FROM club_fields WHERE club_id=${session.club_id} ORDER BY id`;
    const stores = await accessibleStores(session, sql);
    res.status(200).json({ accounts, clubs, fields, session: publicAccount(session), impersonator: impersonator ? publicAccount(impersonator) : null, stores, auditLogs });
  } catch (error) { fail(res, error) }
}
