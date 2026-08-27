import { ApiRequest, ApiResponse, createSession, destroySession, fail, getSession, getSessionImpersonator, getSql, jsonBody, mapAccount, methodNotAllowed, publicAccount } from './_lib/server.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method === 'POST') {
      const superadmin = await getSession(req);
      if (superadmin?.role !== 'superadmin') {
        res.status(403).json({ error: 'Solo el superadmin puede entrar como otro usuario.' });
        return;
      }
      const { accountId } = jsonBody<{ accountId?: string }>(req);
      const sql = getSql();
      const rows = await sql`SELECT * FROM club_accounts WHERE id=${accountId || ''} AND role<>'superadmin' AND active=TRUE LIMIT 1`;
      const target = rows[0] ? mapAccount(rows[0]) : null;
      if (!target) {
        res.status(404).json({ error: 'El usuario no está disponible.' });
        return;
      }
      await destroySession(req, res);
      await createSession(target.id, res, superadmin.id);
      res.status(200).json({ account: publicAccount(target), impersonator: publicAccount(superadmin) });
      return;
    }

    if (req.method === 'DELETE') {
      const superadmin = await getSessionImpersonator(req);
      if (!superadmin || superadmin.role !== 'superadmin') {
        res.status(403).json({ error: 'No hay una sesión de superadmin activa.' });
        return;
      }
      await destroySession(req, res);
      await createSession(superadmin.id, res);
      res.status(200).json({ account: publicAccount(superadmin) });
      return;
    }

    return methodNotAllowed(res);
  } catch (error) {
    fail(res, error);
  }
}
