import { ApiRequest, ApiResponse, fail, getSession, getSessionImpersonator, getSql, jsonBody, methodNotAllowed, readBody, setJsonBody } from './_lib/server.js';
const AREAS = ['team','stats','journeys','rivals','boards','agenda'];
import { validBoard } from '../src/tactical/model.js';
import { saveLegacyBoards, saveTacticalBoard } from './_lib/tactical-store.js';
import { addAdminPlayer, deleteAdminPlayer } from './_lib/admin-player.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const session = await getSession(req);
    if (!session) { res.status(401).json({error:'Sesión caducada.'}); return }
    if (req.method === 'DELETE') {
      if (session.role !== 'superadmin') { res.status(403).json({error:'Solo el superadmin puede borrar todas las agendas.'}); return }
      const sql = getSql();
      const rows = await sql`WITH targets AS (
        SELECT account_id,
          CASE WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data) ELSE 0 END AS removed
        FROM club_stores WHERE area='agenda' FOR UPDATE
      ), cleared AS (
        UPDATE club_stores AS store
        SET data='[]'::jsonb,updated_at=NOW()
        FROM targets
        WHERE store.account_id=targets.account_id AND store.area='agenda'
        RETURNING targets.removed
      )
      SELECT COALESCE(SUM(removed),0)::int AS removed,COUNT(*)::int AS accounts FROM cleared`;
      res.status(200).json({ok:true,removed:Number(rows[0]?.removed || 0),accounts:Number(rows[0]?.accounts || 0)}); return;
    }
    if (req.method !== 'PUT') return methodNotAllowed(res);
    const raw = await readBody(req);
    setJsonBody(req, raw);
    const { area, data: requestedData } = jsonBody<{area:string;data:unknown}>(req);
    let data = requestedData;
    if (session.role === 'admin' && area === 'team' && data && typeof data === 'object' && (data as {operation?:string}).operation === 'addPlayer') {
      const player = await addAdminPlayer(session.club_id, data as {accountId?:unknown;name?:unknown;number?:unknown;role?:unknown}, getSql());
      res.status(201).json({ok:true,player}); return;
    }
    if (session.role === 'admin' && area === 'team' && data && typeof data === 'object' && (data as {operation?:string}).operation === 'deletePlayer') {
      const player = await deleteAdminPlayer(session.club_id, data as {accountId?:unknown;playerId?:unknown}, getSql());
      res.status(200).json({ok:true,player}); return;
    }
    if (session.role !== 'entrenador' || !AREAS.includes(area)) { res.status(403).json({error:'No autorizado.'}); return }
    const sql = getSql();
    if (area === 'boards' && (data as { operation?: string })?.operation === 'saveTacticalBoard') {
      const board = (data as { board?: unknown }).board;
      if (!validBoard(board) || board.ownerAccountId !== session.id) { res.status(400).json({error:'La pizarra no es válida para esta cuenta.'}); return }
      const saved = await saveTacticalBoard(session.id, session.name, board, sql);
      if (!saved) { res.status(409).json({error:'Esta pizarra ha cambiado en otro dispositivo. Conservamos tu borrador: vuelve a la biblioteca y abre la versión actual antes de guardar.'}); return }
      res.status(200).json({ok:true,board:saved}); return;
    }
    if (area === 'agenda') {
      const impersonator = await getSessionImpersonator(req);
      if (impersonator?.role !== 'superadmin') { res.status(403).json({error:'La preparación de ejercicios todavía no está disponible.'}); return }
      const currentRows = await sql`SELECT data FROM club_stores WHERE account_id=${session.id} AND club_id=${session.club_id} AND area='agenda' LIMIT 1`;
      const current = Array.isArray(currentRows[0]?.data) ? currentRows[0].data as Array<Record<string, unknown>> : [];
      const update = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
      const eventId = String(update.eventId || '');
      const sessionData = update.session;
      const target = current.find((event) => String(event.id) === eventId);
      if (!eventId || !sessionData || typeof sessionData !== 'object' || !target || target.type !== 'training' || target.assignedByCoordinator !== true || (target.exceptionStatus && target.exceptionStatus !== 'scheduled')) {
        res.status(403).json({error:'Solo puedes preparar ejercicios en un entrenamiento vigente asignado por coordinación.'}); return;
      }
      data = current.map((event) => String(event.id) === eventId ? { ...event, session: sessionData } : event);
    }
    if (area === 'boards') {
      // Old iframe saves must never overwrite documents belonging to the new editor.
      await saveLegacyBoards(session.id, data, sql);
      res.status(200).json({ok:true}); return;
    }
    await sql`INSERT INTO club_stores (account_id,area,data) VALUES (${session.id},${area},${JSON.stringify(data)}::jsonb)
      ON CONFLICT (account_id,area) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`;
    res.status(200).json({ok:true});
  } catch(error) { fail(res,error) }
}
