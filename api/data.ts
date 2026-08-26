import { ApiRequest, ApiResponse, fail, getSession, getSql, jsonBody, methodNotAllowed } from './_lib/server.js';
const AREAS = ['team','stats','journeys','rivals','boards','agenda'];
export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const session = await getSession(req);
    if (!session) { res.status(401).json({error:'Sesión caducada.'}); return }
    if (req.method !== 'PUT') return methodNotAllowed(res);
    const { area, data } = jsonBody<{area:string;data:unknown}>(req);
    if (session.role !== 'entrenador' || !AREAS.includes(area)) { res.status(403).json({error:'No autorizado.'}); return }
    const sql = getSql();
    await sql`INSERT INTO club_stores (account_id,area,data) VALUES (${session.id},${area},${JSON.stringify(data)}::jsonb)
      ON CONFLICT (account_id,area) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`;
    res.status(200).json({ok:true});
  } catch(error) { fail(res,error) }
}
