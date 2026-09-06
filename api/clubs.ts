import { getSession, getSql, jsonBody, fail, type ApiRequest, type ApiResponse } from './_lib/server.js';
import { validClubEdit } from '../src/clubs.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const session = await getSession(req);
    if (session?.role !== 'superadmin') { res.status(403).json({error:'Solo el superadmin puede gestionar clubes.'}); return }
    const sql = getSql();
    if (req.method === 'PATCH') {
      const body = jsonBody<{id:string;nombre:string;logo:string;color_principal:string}>(req);
      if (!validClubEdit(body) || typeof body.id !== 'string') { res.status(400).json({error:'Revisa el nombre, el escudo y el color.'}); return }
      const rows = await sql`UPDATE clubs SET nombre=${body.nombre.trim()},logo=${body.logo},color_principal=${body.color_principal},updated_at=NOW() WHERE id=${body.id} RETURNING id`;
      if (!rows.length) { res.status(404).json({error:'Club no encontrado.'}); return }
    } else if (req.method !== 'GET') { res.status(405).json({error:'Método no permitido.'}); return }
    res.status(200).json({clubs:await sql`SELECT * FROM clubs ORDER BY created_at`});
  } catch(error) { fail(res,error) }
}
