import { ApiRequest, ApiResponse, fail, getSession, getSessionImpersonator, getSql, jsonBody, methodNotAllowed, sessionTokenHash } from './_lib/server.js';
import { ensurePushSchema, pushConfig, registerDevice, validSubscription } from './_lib/push.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const session = await getSession(req);
    if (!session) { res.status(401).json({ error: 'Inicia sesión para activar los avisos.' }); return }
    if (session.role !== 'entrenador' || await getSessionImpersonator(req)) {
      res.status(403).json({ error: 'Activa los avisos entrando con tu propia cuenta de entrenador.' }); return;
    }
    const config = pushConfig();
    if (req.method === 'GET') {
      res.status(200).json({ enabled: Boolean(config), publicKey: config?.publicKey || null, accountId: session.id }); return;
    }
    if (!['POST', 'DELETE'].includes(req.method || '')) return methodNotAllowed(res);
    await ensurePushSchema();
    const body = jsonBody<{ subscription?: unknown; endpoint?: string }>(req);
    if (req.method === 'DELETE') {
      if (typeof body.endpoint !== 'string') { res.status(400).json({ error: 'Dispositivo no válido.' }); return }
      await getSql()`DELETE FROM club_push_subscriptions WHERE endpoint=${body.endpoint} AND account_id=${session.id}`;
      res.status(200).json({ ok: true }); return;
    }
    if (!config) { res.status(503).json({ error: 'Los avisos todavía no están disponibles. Inténtalo más tarde.' }); return }
    if (!validSubscription(body.subscription)) { res.status(400).json({ error: 'La suscripción del móvil no es válida.' }); return }
    const bindingId = await registerDevice(session.id, sessionTokenHash(req)!, body.subscription);
    res.status(200).json({ accountId: session.id, bindingId });
  } catch (error) { fail(res, error) }
}
