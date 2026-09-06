import { randomUUID } from 'node:crypto';
import { getSession, getSql, hashPin, jsonBody, fail, type ApiRequest, type ApiResponse } from './_lib/server.js';
import { slugifyClub, validClubEdit } from '../src/clubs.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const session = await getSession(req);
    if (session?.role !== 'superadmin') { res.status(403).json({error:'Solo el superadmin puede gestionar clubes.'}); return }
    const sql = getSql();
    if (req.method === 'POST') {
      const body=jsonBody<{nombre:string;logo:string;color_principal:string;admin_name:string;admin_pin:string}>(req);
      const slug=slugifyClub(body.nombre || '');
      if(!slug || !validClubEdit(body) || !body.admin_name?.trim() || body.admin_name.trim().length>120 || !/^\d{4}$/.test(body.admin_pin || '')) { res.status(400).json({error:'Revisa los datos del club y el administrador.'}); return }
      if((await sql`SELECT id FROM clubs WHERE slug=${slug}`).length){res.status(409).json({error:'Ya existe un club con ese enlace.'});return}
      const adminId=randomUUID();
      await sql.transaction([
        sql`INSERT INTO clubs(id,nombre,slug,logo,color_principal,activo) VALUES(${slug},${body.nombre.trim()},${slug},${body.logo},${body.color_principal},TRUE)`,
        sql`INSERT INTO club_accounts(id,name,role,team_label,pin_hash,active,club_id) VALUES(${adminId},${body.admin_name.trim()},'admin','Administración',${hashPin(body.admin_pin)},TRUE,${slug})`,
      ]);
      res.status(201).json({club:(await sql`SELECT * FROM clubs WHERE id=${slug}`)[0],admin:{id:adminId,name:body.admin_name.trim()},access_path:`/${slug}`});return;
    } else if (req.method === 'PATCH') {
      const body = jsonBody<{id:string;nombre:string;logo:string;color_principal:string}>(req);
      if (!validClubEdit(body) || typeof body.id !== 'string') { res.status(400).json({error:'Revisa el nombre, el escudo y el color.'}); return }
      const rows = await sql`UPDATE clubs SET nombre=${body.nombre.trim()},logo=${body.logo},color_principal=${body.color_principal},updated_at=NOW() WHERE id=${body.id} RETURNING id`;
      if (!rows.length) { res.status(404).json({error:'Club no encontrado.'}); return }
    } else if (req.method !== 'GET') { res.status(405).json({error:'Método no permitido.'}); return }
    res.status(200).json({clubs:await sql`SELECT * FROM clubs ORDER BY created_at`});
  } catch(error) { fail(res,error) }
}
