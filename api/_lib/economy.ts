import { randomUUID } from 'node:crypto';
import { getSql, getSessionImpersonator, jsonBody, type AccountRow, type ApiRequest, type ApiResponse } from './server.js';
import { providerStatus } from './enrollment-payments.js';
import { ensureEnrollmentSchema } from './enrollment-schema.js';

export async function economy(req: ApiRequest, res: ApiResponse, session: AccountRow | null) {
  res.setHeader('Cache-Control','private, no-store');
  if (!session || (session.role !== 'superadmin' && !(session.role === 'admin' && (await getSessionImpersonator(req))?.role === 'superadmin'))) {res.status(403).json({error:'Acceso restringido.'});return}
  const sql=getSql();
  // Club campaign previews remain entirely inside the global superadmin session.
  if (typeof req.query?.previewClub === 'string') {
    if (session.role !== 'superadmin') {res.status(403).json({error:'Acceso restringido.'});return}
    const club = (await sql`SELECT id FROM clubs WHERE id=${req.query.previewClub} AND activo=TRUE`)[0];
    if (!club) {res.status(404).json({error:'Club no encontrado.'});return}
    session = {...session, role:'admin', club_id:club.id};
  }
  await ensureEconomySchema(sql);
  if(req.method==='POST') {
    const b=jsonBody<Record<string,any>>(req);
    if(b.action==='commission') {
      if(session.role!=='superadmin'){res.status(403).json({error:'Solo el superadmin puede cambiar comisiones.'});return}
      const scope=b.club_id || 'global';
      if(scope!=='global' && !(await sql`SELECT id FROM clubs WHERE id=${scope}`).length){res.status(400).json({error:'Club no válido.'});return}
      if(b.rate===null && scope!=='global') await sql`DELETE FROM economy_settings WHERE scope=${scope}`;
      else {
        if(!Number.isInteger(b.rate)||b.rate<0||b.rate>10000){res.status(400).json({error:'Porcentaje no válido.'});return}
        await sql`INSERT INTO economy_settings(scope,rate) VALUES(${scope},${b.rate}) ON CONFLICT(scope) DO UPDATE SET rate=EXCLUDED.rate,updated_at=NOW()`;
      }
    } else if(b.action==='campaign' && session.role==='admin') {
      const parts=b.installments;
      if(typeof b.name!=='string'||!b.name.trim()||b.name.length>120||!Number.isSafeInteger(b.total_cents)||b.total_cents<1||b.total_cents>10000000||!Array.isArray(parts)||!parts.length||parts.length>24||parts.some((p:any,i:number)=>!Number.isSafeInteger(p.amount)||p.amount<1||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||!Number.isFinite(Date.parse(p.date))||new Date(p.date).toISOString().slice(0,10)!==p.date||(i>0&&p.date<=parts[i-1].date))||parts.reduce((n:number,p:any)=>n+p.amount,0)!==b.total_cents){res.status(400).json({error:'Revisa el nombre, las fechas y que los plazos sumen la cuota total.'});return}
      // Snapshot the effective commission in the same statement that creates the campaign.
      await sql`INSERT INTO economy_campaigns(id,club_id,name,total_cents,installments,fee_bps) VALUES(${randomUUID()},${session.club_id},${b.name.trim()},${b.total_cents},${JSON.stringify(parts)}::jsonb,COALESCE((SELECT rate FROM economy_settings WHERE scope=${session.club_id}),(SELECT rate FROM economy_settings WHERE scope='global'),300))`;
    } else {res.status(400).json({error:'Operación no válida.'});return}
  } else if(req.method!=='GET'){res.status(405).json({error:'Método no permitido.'});return}
  const settings=await sql`SELECT scope,rate FROM economy_settings WHERE scope='global' OR scope=${session.club_id} OR ${session.role==='superadmin'}`;
  const campaigns=await sql`SELECT c.*,cl.nombre AS club_name FROM economy_campaigns c JOIN clubs cl ON cl.id=c.club_id WHERE ${session.role==='superadmin'} OR c.club_id=${session.club_id} ORDER BY c.created_at DESC`;
  const rawClubs=await sql`SELECT id,nombre,slug FROM clubs WHERE activo=TRUE AND (${session.role==='superadmin'} OR id=${session.club_id}) ORDER BY nombre`;
  const clubs=rawClubs.map(c=>({id:c.id,nombre:c.nombre}));
  let clubStatus:any[]=[];
  if(session.role==='superadmin'){
    await ensureEnrollmentSchema(sql);
    const ids=rawClubs.map(c=>c.id);
    const campaignRows=await sql`SELECT DISTINCT ON (club_id) club_id,name,total_cents,published,payment_required FROM enrollment_campaigns WHERE club_id=ANY(${ids}::text[]) ORDER BY club_id,created_at DESC`;
    const countRows=await sql`SELECT club_id,count(*) FILTER (WHERE confirmed_at IS NOT NULL) AS confirmed,count(*) FILTER (WHERE confirmed_at IS NULL) AS pending FROM enrollments WHERE club_id=ANY(${ids}::text[]) GROUP BY club_id`;
    const adminRows=await sql`SELECT club_id,id FROM club_accounts WHERE club_id=ANY(${ids}::text[]) AND role='admin' AND active=TRUE`;
    const latest=Object.fromEntries(campaignRows.map(r=>[r.club_id,r]));
    const counts=Object.fromEntries(countRows.map(r=>[r.club_id,r]));
    const admins=Object.fromEntries(adminRows.map(r=>[r.club_id,r.id]));
    clubStatus=rawClubs.map(c=>({id:c.id,nombre:c.nombre,slug:c.slug,providers:{payments:providerStatus(c.id).payments,email:providerStatus(c.id).email,ready:providerStatus(c.id).ready},campaign:latest[c.id]||null,confirmed:Number(counts[c.id]?.confirmed)||0,pending:Number(counts[c.id]?.pending)||0,adminId:admins[c.id]||''}));
  }
  res.status(200).json({settings,campaigns,clubs,clubStatus});
}

export async function ensureEconomySchema(sql: ReturnType<typeof getSql>) {
  await sql`CREATE TABLE IF NOT EXISTS economy_settings (scope TEXT PRIMARY KEY, rate INTEGER NOT NULL CHECK(rate BETWEEN 0 AND 10000), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS economy_campaigns (id TEXT PRIMARY KEY, club_id TEXT NOT NULL REFERENCES clubs(id), name TEXT NOT NULL, total_cents INTEGER NOT NULL CHECK(total_cents>0), installments JSONB NOT NULL, fee_bps INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
}
