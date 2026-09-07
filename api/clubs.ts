import { randomUUID } from 'node:crypto';
import { economy } from './_lib/economy.js';
import { deleteClub } from './_lib/delete-club.js';
import { getSession, getSql, hashPin, jsonBody, fail, readBody, setJsonBody, type ApiRequest, type ApiResponse } from './_lib/server.js';
import { slugifyClub, validClubEdit } from '../src/clubs.js';
import { enrollmentApi } from './_lib/enrollment-api.js';
import { ensureEnrollmentSchema } from './_lib/enrollment-schema.js';
import { confirmPayment, verifyStripeEvent } from './_lib/enrollment-payments.js';

export const config = { api: { bodyParser: false }, maxDuration: 60 };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const raw=await readBody(req);
    if(req.query?.section==='payment-webhook'){
      if(req.method!=='POST'||!process.env.STRIPE_WEBHOOK_SECRET){res.status(400).json({error:'Webhook no disponible.'});return}
      let event:any;
      try{event=verifyStripeEvent(raw,String(req.headers['stripe-signature']||''),process.env.STRIPE_WEBHOOK_SECRET)}catch{res.status(400).json({error:'Firma no válida.'});return}
      await ensureEnrollmentSchema(getSql());
      if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))await confirmPayment(event.data.object,event.account||'');
      res.status(200).json({received:true});return;
    }
    setJsonBody(req, raw);
    const session = await getSession(req);
    if(req.query?.section==='enrollment'){await enrollmentApi(req,res,session);return}
    if(req.query?.section==='economy'){await economy(req,res,session);return}
    if (session?.role !== 'superadmin') { res.status(403).json({error:'Solo el superadmin puede gestionar clubes.'}); return }
    const sql = getSql();
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method === 'DELETE') {
      const body = jsonBody<{id?:string;confirmation?:string}>(req);
      if (typeof body.id !== 'string' || typeof body.confirmation !== 'string') {
        res.status(400).json({error:'Escribe el nombre del club para confirmar.'});return;
      }
      if (!await deleteClub(body.id, body.confirmation)) {res.status(400).json({error:'El nombre no coincide o el club ya no existe.'});return}
      res.status(200).json({clubs:await sql`SELECT * FROM clubs ORDER BY created_at`});return;
    }
    if (req.method === 'POST') {
      const body=jsonBody<{nombre:string;logo:string;color_principal:string;admin_name:string;admin_pin:string}>(req);
      const slug=slugifyClub(body.nombre || '');
      if(!slug || !validClubEdit(body) || !body.admin_name?.trim() || body.admin_name.trim().length>120 || !/^\d{4}$/.test(body.admin_pin || '')) { res.status(400).json({error:'Revisa los datos del club y el administrador.'}); return }
      if((await sql`SELECT id FROM clubs WHERE slug=${slug}`).length){res.status(409).json({error:'Ya existe un club con ese enlace.'});return}
      const adminId=randomUUID();
      await sql.transaction([
        sql`INSERT INTO clubs(id,nombre,slug,logo,color_principal,activo) VALUES(${slug},${body.nombre.trim()},${slug},${body.logo},${body.color_principal},TRUE)`,
        sql`INSERT INTO club_accounts(id,name,role,team_label,pin_hash,active,club_id) VALUES(${adminId},${body.admin_name.trim()},'admin','Administración',${hashPin(body.admin_pin)},TRUE,${slug})`,
        sql`INSERT INTO club_fields(club_id,id,nombre,zones) VALUES(${slug},'campo-c','Campo C','["c-1","c-2"]')`,
        sql`INSERT INTO club_fields(club_id,id,nombre,zones) VALUES(${slug},'el-morer','El Morer','["m-1","m-2","m-3","m-4"]')`,
        sql`INSERT INTO club_fields(club_id,id,nombre,zones) VALUES(${slug},'polideportivo','Polideportivo','["p-1","p-2","p-3","p-4"]')`,
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
