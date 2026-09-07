import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getSql, jsonBody, type ApiRequest, type ApiResponse, type AccountRow } from './server.js';
import { ensureEnrollmentSchema } from './enrollment-schema.js';
import { validateCampaign, validateRegistration } from '../../src/enrollment.js';
import { checkout, providerStatus, paymentEmail, sendEmail, sendReceipt } from './enrollment-payments.js';

export async function enrollmentApi(req:ApiRequest,res:ApiResponse,session:AccountRow|null) {
  const sql=getSql();await ensureEnrollmentSchema(sql);
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');
  const query=req.query||{};const body=jsonBody<any>(req);
  try{
    if(query.public==='1'){
      if(req.method==='GET'){
        const club=(await sql`SELECT id,nombre,logo,color_principal FROM clubs WHERE slug=${String(query.club||'')} AND activo=TRUE`)[0];
        if(!club){res.status(404).json({error:'Club no encontrado.'});return}
        const campaigns=await sql`SELECT id,name,season_year,total_cents,parts,categories,terms FROM enrollment_campaigns WHERE club_id=${club.id} AND published=TRUE ORDER BY created_at DESC`;
        res.status(200).json({club,campaigns,ready:providerStatus(club.id).ready});return;
      }
      if(req.method!=='POST'){res.status(405).json({error:'Método no permitido.'});return}
      // Persist the throttle across serverless invocations, without logging personal form data.
      const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0];
      const key='enrollment:'+createHash('sha256').update(ip).digest('hex')+(body.action==='register'?':register':':payment');
      const attempts=await sql`INSERT INTO club_login_attempts(attempt_key) SELECT ${key} WHERE (SELECT count(*) FROM club_login_attempts WHERE attempt_key=${key} AND attempted_at>NOW()-INTERVAL '1 hour')<${body.action==='register'?20:120} RETURNING attempt_key`;
      if(!attempts.length){res.status(429).json({error:'Demasiados intentos. Vuelve a intentarlo más tarde.'});return}
      if(body.action==='pay'){
        if(typeof body.token!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(body.token))throw new Error('Enlace no válido.');
        res.status(200).json(await checkout(body.token));return;
      }
      if(body.action==='payment-info'){
        const due=(await sql`SELECT d.amount_cents,d.due_date,d.ordinal,d.paid_at,cl.nombre FROM enrollment_dues d JOIN enrollments e ON e.id=d.enrollment_id JOIN clubs cl ON cl.id=e.club_id WHERE d.token=${String(body.token||'')} AND cl.activo=TRUE`)[0];
        if(!due)throw new Error('Enlace no válido.');res.status(200).json({due});return;
      }
      if(body.action!=='register')throw new Error('Operación no válida.');
      const campaign=(await sql`SELECT c.* FROM enrollment_campaigns c JOIN clubs cl ON cl.id=c.club_id WHERE c.id=${String(body.campaign||'')} AND c.published=TRUE AND cl.activo=TRUE`)[0];
      if(!campaign)throw new Error('La inscripción no está abierta.');
      if(!providerStatus(campaign.club_id).ready)throw new Error('El club todavía no ha activado los pagos y los recibos.');
      const category=validateRegistration(body,campaign.categories);
      const duplicate=createHash('sha256').update([campaign.id,body.child_name.trim().toLowerCase().replace(/\s+/g,' '),body.birth_date,body.email.trim().toLowerCase()].join('|')).digest('hex');
      if((await sql`SELECT id FROM enrollments WHERE duplicate_key=${duplicate}`).length)throw new Error('Ya existe una solicitud con estos datos. Contacta con el club para recuperar el enlace de pago.');
      const id=randomUUID();const firstToken=randomBytes(32).toString('base64url');
      const parts=body.mode==='full'?[{amount:campaign.total_cents,date:campaign.parts[0].date}]:campaign.parts;
      await sql.transaction([
        sql`INSERT INTO enrollments(id,club_id,campaign_id,child_name,birth_date,category,guardian_name,email,phone,payment_mode,terms_snapshot,duplicate_key) VALUES(${id},${campaign.club_id},${campaign.id},${body.child_name.trim()},${body.birth_date},${category},${body.guardian_name.trim()},${body.email.trim().toLowerCase()},${body.phone.trim()},${body.mode},${campaign.terms},${duplicate})`,
        ...parts.map((part:any,i:number)=>sql`INSERT INTO enrollment_dues(id,enrollment_id,ordinal,amount_cents,due_date,token) VALUES(${randomUUID()},${id},${i+1},${part.amount},${part.date},${i===0?firstToken:randomBytes(32).toString('base64url')})`),
      ]);
      res.status(201).json({token:firstToken});return;
    }
    if(!session||!['admin','superadmin','coordinador'].includes(session.role)){res.status(403).json({error:'Acceso restringido.'});return}
    const clubId=session.role==='superadmin'?String(query.clubId||''):session.club_id;
    if(!clubId){res.status(400).json({error:'Selecciona un club.'});return}
    if(!(await sql`SELECT id FROM clubs WHERE id=${clubId} AND activo=TRUE`).length)throw new Error('Club no encontrado.');
    const config=providerStatus(clubId);
    if(req.method==='POST'){
      if(session.role==='coordinador'&&body.action!=='assign'){res.status(403).json({error:'Solo administración puede gestionar cuotas.'});return}
      if(body.action==='create-campaign'){
        validateCampaign(body);
        await sql`INSERT INTO enrollment_campaigns(id,club_id,name,season_year,total_cents,parts,categories,terms) VALUES(${randomUUID()},${clubId},${body.name.trim()},${body.year},${body.total},${JSON.stringify(body.parts)}::jsonb,${JSON.stringify(body.categories)}::jsonb,${body.terms.trim()})`;
      }else if(body.action==='publish'){
        if(body.published===true&&!config.ready)throw new Error('Conecta la pasarela y el correo antes de abrir inscripciones.');
        await sql`UPDATE enrollment_campaigns SET published=${body.published===true} WHERE id=${String(body.id)} AND club_id=${clubId}`;
      }else if(body.action==='assign'){
        await assignEnrollment(clubId,String(body.id),String(body.accountId),sql);
      }else if(body.action==='send-links'){
        if(!config.ready)throw new Error('Conecta pagos y correo antes de enviar enlaces.');
        if(!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>50||body.ids.some((id:any)=>typeof id!=='string')||typeof body.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(body.requestId))throw new Error('Selecciona entre 1 y 50 cuotas.');
        const dues=await sql`SELECT d.*,e.child_name,e.email,c.name,cl.nombre FROM enrollment_dues d JOIN enrollments e ON e.id=d.enrollment_id JOIN enrollment_campaigns c ON c.id=e.campaign_id JOIN clubs cl ON cl.id=e.club_id WHERE e.club_id=${clubId} AND d.id=ANY(${body.ids}::text[]) AND d.paid_at IS NULL`;
        let sent=0,failed=0;
        for(const due of dues){
          const requestKey=`link-${body.requestId}-${due.id}`;
          await sql`INSERT INTO enrollment_mail(id,due_id,request_key) VALUES(${randomUUID()},${due.id},${requestKey}) ON CONFLICT DO NOTHING`;
          if((await sql`SELECT id FROM enrollment_mail WHERE request_key=${requestKey} AND status='sent'`).length){sent++;continue}
          if((await sql`SELECT id FROM enrollment_dues WHERE id=${due.id} AND paid_at IS NOT NULL`).length)continue;
          try{const providerId=await sendEmail(due.email,`Cuota pendiente · ${due.nombre}`,paymentEmail(due,config.origin),requestKey);await sql`UPDATE enrollment_mail SET status='sent',provider_id=${providerId},error=NULL WHERE request_key=${requestKey}`;sent++}catch{await sql`UPDATE enrollment_mail SET status='failed',error='El proveedor no confirmó el envío.' WHERE request_key=${requestKey}`;failed++}
        }
        res.status(200).json({sent,failed});return;
      }else if(body.action==='receipt'){
        if(!(await sql`SELECT d.id FROM enrollment_dues d JOIN enrollments e ON e.id=d.enrollment_id WHERE d.id=${String(body.id)} AND e.club_id=${clubId} AND d.paid_at IS NOT NULL`).length)throw new Error('Pago no encontrado.');
        await sendReceipt(String(body.id));
      }else throw new Error('Operación no válida.');
    }else if(req.method!=='GET'){res.status(405).json({error:'Método no permitido.'});return}
    const assignments=session.role==='coordinador';
    const campaigns=assignments?[]:await sql`SELECT * FROM enrollment_campaigns WHERE club_id=${clubId} ORDER BY created_at DESC`;
    const registrations=assignments?await sql`SELECT id,child_name,birth_date,category,confirmed_at,assigned_account_id FROM enrollments WHERE club_id=${clubId} AND confirmed_at IS NOT NULL ORDER BY created_at DESC`:await sql`SELECT * FROM enrollments WHERE club_id=${clubId} ORDER BY created_at DESC`;
    const dues=assignments?[]:await sql`SELECT d.*,e.child_name,e.email,e.category,e.campaign_id,(SELECT status FROM enrollment_mail m WHERE m.due_id=d.id ORDER BY created_at DESC LIMIT 1) AS mail_status FROM enrollment_dues d JOIN enrollments e ON e.id=d.enrollment_id WHERE e.club_id=${clubId} ORDER BY d.due_date,e.child_name`;
    const coaches=await sql`SELECT id,name,team_label,football_stage FROM club_accounts WHERE club_id=${clubId} AND role='entrenador' AND active=TRUE ORDER BY team_label`;
    const club=(await sql`SELECT nombre,slug FROM clubs WHERE id=${clubId}`)[0];
    res.status(200).json({campaigns,registrations,dues,coaches,club,providers:{payments:config.payments,email:config.email,ready:config.ready}});
  }catch(error){res.status(400).json({error:error instanceof Error?error.message:'No se pudo completar la operación.'})}
}

export async function assignEnrollment(clubId:string,enrollmentId:string,accountId:string,sql=getSql()) {
        const rows=await sql`SELECT e.id,e.child_name,e.birth_date,e.category,a.id AS coach,a.team_label,a.football_stage FROM enrollments e JOIN club_accounts a ON a.id=${accountId} AND a.club_id=e.club_id AND a.active=TRUE AND a.role='entrenador' WHERE e.id=${enrollmentId} AND e.club_id=${clubId} AND e.confirmed_at IS NOT NULL AND e.assigned_account_id IS NULL`;
        const row=rows[0];if(!row)throw new Error('Selecciona una inscripción pagada sin equipo y un entrenador activo del mismo club.');
        if(row.football_stage!==row.category)throw new Error('El equipo debe pertenecer a la categoría del jugador.');
        const player=JSON.stringify({id:row.id,name:row.child_name,birthDate:new Date(row.birth_date).toISOString().slice(0,10),number:'',role:'jugador',group:'plantilla',active:true,ownerCoachId:row.coach});
        // The claim and JSON append are one statement. Concurrent assignments only insert once.
        await sql`WITH claimed AS (UPDATE enrollments SET assigned_account_id=${row.coach} WHERE id=${row.id} AND club_id=${clubId} AND assigned_account_id IS NULL AND confirmed_at IS NOT NULL RETURNING id)
          INSERT INTO club_stores(account_id,club_id,area,data) SELECT ${row.coach},${clubId},'team',jsonb_build_object('name',${row.team_label}::text,'season','','players',jsonb_build_array(${player}::jsonb)) FROM claimed
          ON CONFLICT(account_id,area) DO UPDATE SET data=jsonb_set(club_stores.data,'{players}',COALESCE(club_stores.data->'players','[]'::jsonb)||${player}::jsonb),updated_at=NOW()`;

}
