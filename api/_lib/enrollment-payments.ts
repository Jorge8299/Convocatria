import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSql } from './server.js';

export function providerStatus(clubId:string) {
  let account='';try{account=JSON.parse(process.env.STRIPE_CLUB_ACCOUNTS||'{}')[clubId]||''}catch{}
  const origin=process.env.APP_ORIGIN||'';
  const payments=Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET&&/^acct_[a-zA-Z0-9]+$/.test(account)&&/^https:\/\/[^/]+$/.test(origin));
  const email=Boolean(process.env.RESEND_API_KEY&&process.env.ENROLLMENT_FROM_EMAIL);
  return {payments,email,ready:payments&&email,account,origin};
}
async function stripe(path:string,account:string,body?:URLSearchParams,key?:string) {
  const response=await fetch(`https://api.stripe.com/v1/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'Stripe-Account':account,...(body?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':key!}:{})},body,signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok)throw new Error('La pasarela no está disponible. Inténtalo de nuevo más tarde.');return result;
}
export async function checkout(token:string) {
  const sql=getSql();
  const due=(await sql`SELECT d.*,e.club_id,e.email,c.name FROM enrollment_dues d JOIN enrollments e ON e.id=d.enrollment_id JOIN enrollment_campaigns c ON c.id=e.campaign_id JOIN clubs cl ON cl.id=e.club_id WHERE d.token=${token} AND cl.activo=TRUE`)[0];
  if(!due)throw new Error('Enlace de pago no válido.');
  if(due.paid_at)return {paid:true};
  const config=providerStatus(due.club_id);if(!config.ready)throw new Error('El club todavía no ha activado los pagos y los recibos.');
  // Reuse a live session: repeated clicks must not open independent charges.
  if(due.stripe_session){
    const existing=await stripe(`checkout/sessions/${encodeURIComponent(due.stripe_session)}`,due.stripe_account);
    if(existing.payment_status==='paid'){await confirmPayment(existing,due.stripe_account);return {paid:true}}
    if(existing.status==='complete')throw new Error('El pago se está procesando. Espera a recibir la confirmación.');
    if(existing.status==='open'&&existing.url)return {url:existing.url};
  }
  const params=new URLSearchParams({mode:'payment','payment_method_types[0]':'card',customer_email:due.email,client_reference_id:due.id,
    'line_items[0][price_data][currency]':'eur','line_items[0][price_data][unit_amount]':String(due.amount_cents),
    'line_items[0][price_data][product_data][name]':`${due.name} · Cuota ${due.ordinal}`,'line_items[0][quantity]':'1',
    'metadata[due_id]':due.id,success_url:`${config.origin}/pago#${token}`,cancel_url:`${config.origin}/pago#${token}`});
  const session=await stripe('checkout/sessions',config.account,params,`due-${due.id}-${due.stripe_session||'first'}`);
  await sql`UPDATE enrollment_dues SET stripe_session=${session.id},stripe_account=${config.account},checkout_url=${session.url},checkout_expires=${session.expires_at} WHERE id=${due.id} AND paid_at IS NULL`;
  return {url:session.url};
}
export function verifyStripeEvent(raw:Buffer,signature:string,secret:string,now=Date.now()) {
  const parts=signature.split(',');const timestamp=parts.find(p=>p.startsWith('t='))?.slice(2)||'';
  if(!/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)throw new Error('Firma caducada.');
  const expected=createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest();
  if(!parts.filter(p=>p.startsWith('v1=')).some(p=>{const hex=p.slice(3);if(!/^[a-f0-9]{64}$/.test(hex))return false;return timingSafeEqual(expected,Buffer.from(hex,'hex'))}))throw new Error('Firma no válida.');
  return JSON.parse(raw.toString('utf8'));
}
export async function confirmPayment(session:any,account:string,sql=getSql()) {
  if(session.payment_status!=='paid'||session.currency!=='eur'||session.mode!=='payment')return;
  const id=session.metadata?.due_id;if(typeof id!=='string')return;
  const stored=(await sql`SELECT stripe_session FROM enrollment_dues WHERE id=${id}`)[0];
  if(stored&&!stored.stripe_session)throw new Error('Checkout todavía en preparación; reintentar confirmación.');
  // Match the stored checkout, recipient account and server-side amount; no client assertion can mark a payment.
  const results=await sql.transaction([
    sql`UPDATE enrollment_dues SET paid_at=COALESCE(paid_at,NOW()) WHERE id=${id} AND stripe_session=${session.id} AND stripe_account=${account} AND amount_cents=${session.amount_total} RETURNING enrollment_id`,
    sql`UPDATE enrollments e SET confirmed_at=COALESCE(confirmed_at,NOW()) WHERE EXISTS(SELECT 1 FROM enrollment_dues d WHERE d.enrollment_id=e.id AND d.id=${id} AND d.stripe_session=${session.id} AND d.stripe_account=${account} AND d.amount_cents=${session.amount_total} AND d.paid_at IS NOT NULL AND d.ordinal=1)`,
  ]);
  if(results[0].length)await sendReceipt(id,sql);
}
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function sendEmail(to:string,subject:string,html:string,key:string) {
  if(!process.env.RESEND_API_KEY||!process.env.ENROLLMENT_FROM_EMAIL)throw new Error('Conecta el servicio de correo para realizar envíos.');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:process.env.ENROLLMENT_FROM_EMAIL,to:[to],subject,html}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('El servicio de correo ha rechazado el envío.');return (await response.json()).id as string;
}
export async function sendReceipt(id:string,sql=getSql()) {
  const row=(await sql`SELECT d.*,e.child_name,e.email,c.name,cl.nombre FROM enrollment_dues d JOIN enrollments e ON e.id=d.enrollment_id JOIN enrollment_campaigns c ON c.id=e.campaign_id JOIN clubs cl ON cl.id=e.club_id WHERE d.id=${id} AND d.paid_at IS NOT NULL AND d.receipt_sent_at IS NULL`)[0];
  if(!row)return;
  try{
    await sendEmail(row.email,`Recibo de pago · ${row.nombre}`,`<h1>Pago recibido</h1><p>${escapeHtml(row.nombre)} · ${escapeHtml(row.name)}</p><p>Jugador: ${escapeHtml(row.child_name)}</p><p>Cuota ${row.ordinal}: <strong>${(row.amount_cents/100).toFixed(2)} EUR</strong></p><p>Referencia: ${escapeHtml(row.id)}</p><p>La asignación del equipo la realiza el club. Conserva este justificante de pago.</p>`,`receipt-${row.id}`);
    await sql`UPDATE enrollment_dues SET receipt_sent_at=NOW(),receipt_error=NULL WHERE id=${id}`;
  }catch{await sql`UPDATE enrollment_dues SET receipt_error='No se pudo enviar el recibo. Reintenta desde Cobros.' WHERE id=${id}`;throw new Error('Recibo pendiente de envío.');}
}
export function paymentEmail(row:any,origin:string) {
  return `<h1>Cuota pendiente · ${escapeHtml(row.nombre)}</h1><p>${escapeHtml(row.child_name)} · ${escapeHtml(row.name)}</p><p>Cuota ${row.ordinal}: ${(row.amount_cents/100).toFixed(2)} EUR.</p><p>Vencimiento: ${escapeHtml(new Date(row.due_date).toISOString().slice(0,10))}</p><p><a href="${origin}/pago#${row.token}">Pagar cuota</a></p><p>No necesitas crear una cuenta. Recibirás un justificante cuando se confirme el pago.</p>`;
}
