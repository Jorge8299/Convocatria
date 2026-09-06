import { ApiRequest, ApiResponse, clearFailedLogins, createSession, fail, getSql, hashPin, isRateLimited, jsonBody, loginAttemptKey, mapAccount, methodNotAllowed, publicAccount, recordFailedLogin, ensureSchema } from './_lib/server.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  try {
    await ensureSchema();
    const { accountId, pin, clubSlug='ud-oliva' } = jsonBody<{ accountId?: string; pin?: string;clubSlug?:string }>(req);
    if (!/^\d{4}$/.test(pin || '')) { res.status(400).json({ error: 'Introduce un PIN de 4 números.' }); return }
    const sql = getSql();
    const attemptKey=loginAttemptKey(req,accountId || 'superadmin');
    if(await isRateLimited(attemptKey)){res.status(429).json({error:'Demasiados intentos. Espera 15 minutos.'});return}
    const club=(await sql`SELECT id FROM clubs WHERE slug=${clubSlug} AND activo=TRUE LIMIT 1`)[0];
    if(!club && accountId){res.status(404).json({error:'Club no encontrado.'});return}
    const rows = accountId
      ? await sql`SELECT * FROM club_accounts WHERE id=${accountId} AND club_id=${club.id} AND active=TRUE LIMIT 1`
      : await sql`SELECT * FROM club_accounts WHERE ((role='admin' AND club_id=${club?.id || null}) OR role='superadmin') AND active=TRUE`;
    const account = rows.map((row) => mapAccount(row)).find((item) => item.pinHash === hashPin(pin!)) || null;
    if (!account) { await recordFailedLogin(attemptKey); res.status(401).json({ error: 'El PIN no es correcto.' }); return }
    await clearFailedLogins(attemptKey);
    await sql`INSERT INTO club_login_audit (account_id,account_name,account_role) VALUES (${account.id},${account.name},${account.role})`;
    await createSession(account.id, res);
    res.status(200).json({ account: publicAccount(account) });
  } catch (error) { fail(res, error) }
}
