import { ApiRequest, ApiResponse, getSession, getSessionImpersonator, getSql, jsonBody, readBody, setJsonBody } from './server.js';
import { AITrainingService, ensureAITrainingSchema, GeminiTrainingProvider, logAIGeneration, type AITrainingAction } from './ai-training.js';
import { validateTrainingAIContext, validateTrainingAISession, type TrainingAIExercise } from '../../src/trainingAI.js';

const errorMessage=(code:string)=>code==='limit'?'Se ha alcanzado el límite temporal del servicio de IA. Inténtalo más tarde.':code==='timeout'?'La generación está tardando demasiado. Puedes volver a intentarlo.':code==='invalid_response'||code==='invalid_json'||code==='empty'?'La IA no devolvió una sesión válida. Vuelve a intentarlo.':code==='missing_key'?'La generación con IA todavía no está configurada.':'El servicio de IA no está disponible ahora mismo. Inténtalo de nuevo.';

export async function handleTrainingAI(req:ApiRequest,res:ApiResponse){
  res.setHeader('Cache-Control','private, no-store');
  try{
    if(req.method!=='POST'){res.status(405).json({error:'Método no permitido.'});return}
    const [session,impersonator]=await Promise.all([getSession(req),getSessionImpersonator(req)]);
    if(!session||session.role!=='entrenador'||!session.club_id||impersonator?.role!=='superadmin'){res.status(403).json({error:'Esta función sigue en desarrollo privado.'});return}
    const raw=await readBody(req);if(raw.length>50000){res.status(413).json({error:'La solicitud es demasiado grande.'});return}setJsonBody(req,raw);
    const body=jsonBody<Record<string,unknown>>(req),eventId=String(body.eventId||''),action=String(body.action||'session') as AITrainingAction;
    const context=validateTrainingAIContext(body.context),currentSession=body.currentSession?validateTrainingAISession(body.currentSession):undefined;
    if(!eventId||!['session','exercise','adapt'].includes(action)||!context||(action!=='session'&&!currentSession)){res.status(400).json({error:'Revisa los datos de la sesión.'});return}
    const sql=getSql();await ensureAITrainingSchema(sql);
    const rows=await sql`SELECT e FROM club_stores s,jsonb_array_elements(CASE WHEN jsonb_typeof(s.data)='array' THEN s.data ELSE '[]'::jsonb END)e WHERE s.account_id=${session.id} AND s.club_id=${session.club_id} AND s.area='agenda' AND e->>'id'=${eventId} AND e->>'type'='training' AND e->>'assignedByCoordinator'='true' AND COALESCE(e->>'exceptionStatus','scheduled')='scheduled' LIMIT 1`;
    if(!rows[0]){res.status(404).json({error:'El entrenamiento ya no está disponible.'});return}
    const limit=Math.max(1,Math.min(100,Number(process.env.AI_DAILY_GENERATION_LIMIT)||10));
    const counts=await sql`SELECT COUNT(*)::int count FROM ai_generation_logs WHERE account_id=${session.id} AND created_at>=(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date AT TIME ZONE 'Europe/Madrid'`;
    if(Number(counts[0]?.count||0)>=limit){res.status(429).json({error:'Has alcanzado el límite diario de generaciones de prueba.'});return}
    const key=process.env.GEMINI_API_KEY||'',model=process.env.AI_MODEL||'gemini-3.5-flash-lite',meta={provider:'gemini',model};
    if(!key){await logAIGeneration(sql,{accountId:session.id,clubId:session.club_id,eventId,type:action,...meta,success:false,error:'missing_key'});res.status(503).json({error:errorMessage('missing_key')});return}
    const provider=new GeminiTrainingProvider(key,model),service=new AITrainingService(provider);
    try{
      const category=String(body.category||session.footballStage||'Fútbol base').slice(0,80),format=body.format==='F11'?'F11':'F8';
      const generated=await service.generate({action,context,category,format,currentSession,exercise:body.exercise as TrainingAIExercise|undefined,instruction:String(body.instruction||'').trim().slice(0,600)});
      await logAIGeneration(sql,{accountId:session.id,clubId:session.club_id,eventId,type:action,...service.metadata(),success:true});
      res.status(200).json({session:generated});
    }catch(error){const code=(error as Error).message;await logAIGeneration(sql,{accountId:session.id,clubId:session.club_id,eventId,type:action,...meta,success:false,error:code});res.status(code==='limit'?429:502).json({error:errorMessage(code)});}
  }catch(error){console.error('training_ai_failed',error);res.status(500).json({error:'No se pudo generar el entrenamiento. Inténtalo de nuevo.'})}
}
