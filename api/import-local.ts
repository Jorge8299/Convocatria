import { ApiRequest, ApiResponse, ensureSchema, fail, getSql, hashPin, jsonBody, mapAccount } from './_lib/server.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({error:'Método no permitido'}); return }
  try {
    await ensureSchema();
    const body = jsonBody<{pin:string;accounts:Array<{id:string;name:string;role:string;teamLabel:string;pinHash:string;active:boolean;createdAt:string}>;stores:Array<{accountId:string;area:string;data:unknown}>}>(req);
    const sql = getSql();
    const counts=await sql`SELECT COUNT(*)::int AS count FROM club_accounts`;
    if(Number(counts[0]?.count || 0)>1){res.status(409).json({error:'La base central ya contiene usuarios. La importación inicial está cerrada.'});return}
    const admins = await sql`SELECT * FROM club_accounts WHERE role='superadmin' LIMIT 1`;
    if (!admins[0] || mapAccount(admins[0]).pinHash !== hashPin(body.pin || '')) { res.status(401).json({error:'PIN de superadmin incorrecto.'}); return }
    for (const account of body.accounts || []) {
      if (!['entrenador','coordinador','superadmin'].includes(account.role)) continue;
      await sql`INSERT INTO club_accounts (id,name,role,team_label,pin_hash,active,created_at)
        VALUES (${account.id},${account.name},${account.role},${account.teamLabel || ''},${account.pinHash},${account.active},${account.createdAt})
        ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,role=EXCLUDED.role,team_label=EXCLUDED.team_label,pin_hash=EXCLUDED.pin_hash,active=EXCLUDED.active`;
    }
    for (const store of body.stores || []) {
      if (!['team','stats','journeys','rivals','boards'].includes(store.area)) continue;
      await sql`INSERT INTO club_stores (account_id,area,data) VALUES (${store.accountId},${store.area},${JSON.stringify(store.data)}::jsonb)
        ON CONFLICT (account_id,area) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`;
    }
    res.status(200).json({ok:true,accounts:(body.accounts || []).length,stores:(body.stores || []).length});
  } catch(error) { fail(res,error) }
}
