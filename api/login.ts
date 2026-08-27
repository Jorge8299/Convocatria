import { ApiRequest, ApiResponse, clearFailedLogins, createSession, fail, getSql, hashPin, isRateLimited, jsonBody, loginAttemptKey, mapAccount, methodNotAllowed, publicAccount, recordFailedLogin, ensureSchema } from './_lib/server.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  try {
    await ensureSchema();
    const { accountId, pin } = jsonBody<{ accountId?: string; pin?: string }>(req);
    if (!/^\d{4}$/.test(pin || '')) { res.status(400).json({ error: 'Introduce un PIN de 4 números.' }); return }
    const sql = getSql();
    const attemptKey=loginAttemptKey(req,accountId || 'superadmin');
    if(await isRateLimited(attemptKey)){res.status(429).json({error:'Demasiados intentos. Espera 15 minutos.'});return}
    const rows = accountId
      ? await sql`SELECT * FROM club_accounts WHERE id=${accountId} AND active=TRUE LIMIT 1`
      : await sql`SELECT * FROM club_accounts WHERE role IN ('admin','superadmin') AND active=TRUE`;
    const account = rows.map((row) => mapAccount(row)).find((item) => item.pinHash === hashPin(pin!)) || null;
    if (!account) { await recordFailedLogin(attemptKey); res.status(401).json({ error: 'El PIN no es correcto.' }); return }
    await clearFailedLogins(attemptKey);
    await createSession(account.id, res);
    res.status(200).json({ account: publicAccount(account) });
  } catch (error) { fail(res, error) }
}
