import { ApiRequest, ApiResponse, fail, getSession, getSql, jsonBody, methodNotAllowed } from './_lib/server.js';
const AREAS = ['team','stats','journeys','rivals','boards','agenda'];
export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const session = await getSession(req);
    if (!session) { res.status(401).json({error:'Sesión caducada.'}); return }
    if (req.method !== 'PUT') return methodNotAllowed(res);
    const { area, data: requestedData } = jsonBody<{area:string;data:unknown}>(req);
    let data = requestedData;
    if (session.role !== 'entrenador' || !AREAS.includes(area)) { res.status(403).json({error:'No autorizado.'}); return }
    const sql = getSql();
    if (area === 'agenda') {
      const currentRows = await sql`SELECT data FROM club_stores WHERE account_id=${session.id} AND area='agenda' LIMIT 1`;
      const current = Array.isArray(currentRows[0]?.data) ? currentRows[0].data as Array<Record<string, unknown>> : [];
      const incoming = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
      const protectedMatches = current.filter((event) => event.assignedByCoordinator === true);
      const protectedIds = new Set(protectedMatches.map((event) => String(event.id)));
      data = [...incoming.filter((event) => !protectedIds.has(String(event.id))), ...protectedMatches];
    }
    await sql`INSERT INTO club_stores (account_id,area,data) VALUES (${session.id},${area},${JSON.stringify(data)}::jsonb)
      ON CONFLICT (account_id,area) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`;
    res.status(200).json({ok:true});
  } catch(error) { fail(res,error) }
}
