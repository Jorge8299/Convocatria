import {randomBytes,createHash} from 'node:crypto';
import type {getSql,AccountRow,ApiRequest,ApiResponse} from './server.js';
import {getSession,readBody,setJsonBody,jsonBody} from './server.js';
import {ensureCallupSchema} from './callup-schema.js';
import {sortAttendancePlayers,DEFAULT_CONFIRMATION_TEXT} from '../../src/callups.js';
type Sql=ReturnType<typeof getSql>;
type Owner=Pick<AccountRow,'id'|'club_id'|'role'>;
type Row=Record<string,any>;
export class CallupError extends Error {constructor(message:string,public status=400){super(message);}}
function ownerCheck(owner:Owner){if(owner.role!=='entrenador'||!owner.club_id)throw new CallupError('Solo el entrenador puede gestionar sus convocatorias.',403);}
const eventJoin=`LEFT JOIN LATERAL (
 SELECT e FROM club_stores s,CROSS_PLACEHOLDER jsonb_array_elements(CASE WHEN jsonb_typeof(s.data)='array' THEN s.data ELSE '[]'::jsonb END) e
 WHERE s.account_id=c.account_id AND s.club_id=c.club_id AND s.area='agenda' AND e->>'id'=c.event_id AND e->>'type'='match' LIMIT 1
) a ON true`.replace('CROSS_PLACEHOLDER ','');
const projection=`SELECT c.*,cl.nombre AS club_name,cl.logo,cl.color_principal,a.e AS event,
 (c.closed_at IS NOT NULL) AS closed
 FROM club_callups c JOIN clubs cl ON cl.id=c.club_id AND cl.activo=TRUE
 JOIN club_accounts coach ON coach.id=c.account_id AND coach.active=TRUE AND coach.club_id=c.club_id
 ${eventJoin}`;
async function present(sql:Sql,row:Row,privateView:boolean){
 const players=await sql.query(`SELECT jugador_id,nombre,dorsal${privateView?',estado,motivo,updated_at':',estado'} FROM convocatoria_respuestas WHERE convocatoria_id=$1`,[row.id]);
 const e=row.event;
 return {id:row.id,event_id:row.event_id,token:row.token,title:e?(e.home?row.club_name+' vs '+e.rivalName:e.rivalName+' vs '+row.club_name):row.title,
 message:privateView?row.message:'',prompt:row.prompt,match_date:e?.date||row.match_date,match_time:e?.startTime||row.match_time,field:e?.field||row.field,
 closed:row.closed,created_at:row.created_at,club:{nombre:row.club_name,logo:row.logo,color_principal:row.color_principal},
 players:sortAttendancePlayers(players as any[])};
}
export async function listCallups(sql:Sql,owner:Owner){
 ownerCheck(owner);
 const rows=await sql.query(projection+' WHERE c.account_id=$1 AND c.club_id=$2 ORDER BY c.created_at DESC LIMIT 100',[owner.id,owner.club_id]);
 return Promise.all(rows.map(row=>present(sql,row,true)));
}
export async function publicCallup(sql:Sql,token:string){
 if(!/^[a-f0-9]{48}$/.test(token))throw new CallupError('Este enlace no está disponible.',404);
 const rows=await sql.query(projection+' WHERE c.token=$1',[token]);
 if(!rows[0])throw new CallupError('Este enlace no está disponible.',404);
 return present(sql,rows[0],false);
}
export async function createCallup(sql:Sql,owner:Owner,input:Row){
 ownerCheck(owner);
 if(typeof input.eventId!=='string'||input.eventId.length>200||typeof input.message!=='string'||!input.message.trim()||input.message.length>12000)throw new CallupError('Completa el mensaje del partido.');
 const prompt=typeof input.prompt==='string'&&input.prompt.trim()?input.prompt.trim().replace(/\s*\n\s*/g,' '):DEFAULT_CONFIRMATION_TEXT;
 if(prompt.length>200)throw new CallupError('El texto de confirmación supera los 200 caracteres.');
 const rows=await sql.query(`SELECT e,cl.nombre FROM club_stores s JOIN clubs cl ON cl.id=s.club_id,
 jsonb_array_elements(CASE WHEN jsonb_typeof(s.data)='array' THEN s.data ELSE '[]'::jsonb END) e
 WHERE s.account_id=$1 AND s.club_id=$2 AND s.area='agenda' AND e->>'id'=$3 AND e->>'type'='match' AND COALESCE(e->>'rest','false')<>'true'`,[owner.id,owner.club_id,input.eventId]);
 if(!rows[0])throw new CallupError('El partido ya no está en tu agenda.',404);
 const event=rows[0].e as Row;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(event.date)||!/^\d{2}:\d{2}$/.test(event.startTime))throw new CallupError('El partido necesita fecha y hora.');
const roster=(await sql.query("SELECT data FROM club_stores WHERE account_id=$1 AND club_id=$2 AND area='team'",[owner.id,owner.club_id]))[0]?.data as Row|undefined;
  const allPlayers=Array.isArray(roster?.players)?roster!.players:[];
  const players=allPlayers.filter((p:Row)=>p.active!==false&&p.id&&p.name);
 const title=event.home?rows[0].nombre+' vs '+event.rivalName:event.rivalName+' vs '+rows[0].nombre;
 // One statement creates the callup and roster atomically; repeat shares retain responses and token.
 const result=await sql.query(`WITH c AS (
 INSERT INTO club_callups(club_id,account_id,event_id,token,title,message,match_date,match_time,field,prompt)
 SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
 ON CONFLICT(account_id,event_id) DO UPDATE SET message=EXCLUDED.message,title=EXCLUDED.title,match_date=EXCLUDED.match_date,match_time=EXCLUDED.match_time,field=EXCLUDED.field,prompt=EXCLUDED.prompt,updated_at=now()
 WHERE club_callups.closed_at IS NULL RETURNING *
 ), p AS (
 INSERT INTO convocatoria_respuestas(convocatoria_id,jugador_id,nombre,dorsal)
 SELECT c.id,x.id,x.name,COALESCE(x.number,'') FROM c,jsonb_to_recordset($11::jsonb) x(id text,name text,number text)
 ON CONFLICT(convocatoria_id,jugador_id) DO NOTHING RETURNING id
 ) SELECT c.* FROM c`,[owner.club_id,owner.id,input.eventId,randomBytes(24).toString('hex'),title,input.message,event.date,event.startTime,event.field||'',prompt,JSON.stringify([...new Map(players.map((p:Row)=>[p.id,{id:String(p.id),name:String(p.name),number:String(p.number||'')}])).values()])]);
 if(!result[0])throw new CallupError('La convocatoria está cerrada.',409);
 return (await listCallups(sql,owner)).find(c=>c.id===result[0].id)!;
}
export async function closeCallup(sql:Sql,owner:Owner,id:string){
 ownerCheck(owner);
 if(!/^[a-f0-9-]{36}$/i.test(id))throw new CallupError('Convocatoria no válida.');
 const rows=await sql.query('UPDATE club_callups SET closed_at=now(),updated_at=now() WHERE id=$1 AND account_id=$2 AND club_id=$3 RETURNING id',[id,owner.id,owner.club_id]);
 if(!rows.length)throw new CallupError('Convocatoria no encontrada.',404);
}
export async function deleteCallup(sql:Sql,owner:Owner,id:string){
 ownerCheck(owner);
 if(!/^[a-f0-9-]{36}$/i.test(id))throw new CallupError('Convocatoria no válida.');
 const rows=await sql.query(`WITH deleted AS (
 DELETE FROM club_callups WHERE id=$1 AND account_id=$2 AND club_id=$3 AND closed_at IS NOT NULL RETURNING id
 ), cleaned AS (
 UPDATE club_stores SET data=COALESCE((SELECT jsonb_agg(item) FROM jsonb_array_elements(data) item WHERE COALESCE(item->>'attendanceId','')<>$1::text AND COALESCE(item->>'id','')<>$1::text),'[]'::jsonb)
 WHERE account_id=$2 AND club_id=$3 AND area='journeys' AND EXISTS(SELECT 1 FROM deleted)
 ) SELECT id FROM deleted`,[id,owner.id,owner.club_id]);
 if(!rows.length)throw new CallupError('Solo puedes eliminar una convocatoria cerrada.',404);
}
export async function respondCallup(sql:Sql,token:string,input:Row){
 if(!/^[a-f0-9]{48}$/.test(token)||!input||typeof input.jugador_id!=='string'||input.jugador_id.length>200||!['SI','NO'].includes(input.estado)||typeof (input.motivo??'')!=='string'||(input.motivo??'').length>160)throw new CallupError('Revisa la respuesta y el motivo (máximo 160 caracteres).');
 const rows=await sql.query(`UPDATE convocatoria_respuestas r SET estado=$1,motivo=$2,updated_at=now()
 FROM club_callups c JOIN clubs cl ON cl.id=c.club_id AND cl.activo=TRUE
 JOIN club_accounts coach ON coach.id=c.account_id AND coach.active=TRUE AND coach.club_id=c.club_id
 ${eventJoin}
 WHERE r.convocatoria_id=c.id AND c.token=$3 AND r.jugador_id=$4 AND c.closed_at IS NULL
 RETURNING r.estado,r.updated_at`,[input.estado,input.estado==='NO'?(input.motivo||'').trim():null,token,input.jugador_id]);
 if(!rows[0])throw new CallupError('No se pudo guardar: convocatoria cerrada o jugador no disponible.',409);
 return rows[0];
}
export async function handleCallups(req:ApiRequest,res:ApiResponse,sql:Sql){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
 try{
  const token=typeof req.query?.token==='string'?req.query.token:'';
  // Private operations authenticate before new schema access.
  const owner=token?null:await getSession(req);
  if(!token&&!owner)throw new CallupError('Inicia sesión de nuevo.',401);
  await ensureCallupSchema(sql);
  if(req.method==='GET'){
   res.status(200).json(token?await publicCallup(sql,token):{callups:await listCallups(sql,owner!)});return;
  }
  if(req.method!=='POST'){res.status(405).json({error:'Método no permitido.'});return;}
  const origin=String(req.headers.origin||'');
  if(origin&&new URL(origin).host!==String(req.headers.host||''))throw new CallupError('Origen no permitido.',403);
  const raw=await readBody(req);if(raw.length>16000)throw new CallupError('Petición demasiado grande.');
  setJsonBody(req,raw);const body=jsonBody<Row>(req);
  if(token){
   const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0];
   const key=createHash('sha256').update(ip+':'+token).digest('hex');
   const limited=await sql.query(`INSERT INTO callup_request_limits(key) VALUES($1) ON CONFLICT(key) DO UPDATE SET
   attempts=CASE WHEN callup_request_limits.window_start<now()-interval '10 minutes' THEN 1 ELSE callup_request_limits.attempts+1 END,
   window_start=CASE WHEN callup_request_limits.window_start<now()-interval '10 minutes' THEN now() ELSE callup_request_limits.window_start END RETURNING attempts`,[key]);
   if(Number(limited[0].attempts)>60)throw new CallupError('Demasiados intentos. Espera unos minutos.',429);
   res.status(200).json(await respondCallup(sql,token,body));return;
  }
  if(body.action==='close'){await closeCallup(sql,owner!,String(body.id||''));res.status(200).json({ok:true});return;}
  if(body.action==='delete'){await deleteCallup(sql,owner!,String(body.id||''));res.status(200).json({ok:true});return;}
  if(body.action!=='create')throw new CallupError('Acción no válida.');
  res.status(200).json(await createCallup(sql,owner!,body));
 }catch(e){if(e instanceof CallupError){res.status(e.status).json({error:e.message});}else{console.error('callup_failed',e);res.status(500).json({error:'No se pudo completar la operación. Inténtalo de nuevo.'});}}
}
