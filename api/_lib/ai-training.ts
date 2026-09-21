import type { getSql } from './server.js';
import { validateTrainingAISession, type TrainingAIContext, type TrainingAIExercise, type TrainingAISession } from '../../src/trainingAI.js';

type Sql = ReturnType<typeof getSql>;
export type AITrainingAction = 'session' | 'exercise' | 'adapt';
export interface AITrainingRequest { action: AITrainingAction; context: TrainingAIContext; category: string; format: 'F8'|'F11'; currentSession?: TrainingAISession; exercise?: TrainingAIExercise; instruction?: string }
export interface AITrainingProvider { name: string; model: string; generate(input: AITrainingRequest): Promise<unknown> }

const sessionSchema = {
  type: 'object', required: ['title','category','format','players','goalkeepers','objectives','totalMaterial','summary','exercises'],
  properties: {
    title:{type:'string'}, category:{type:'string'}, format:{type:'string',enum:['F8','F11']}, players:{type:'integer'}, goalkeepers:{type:'integer'},
    objectives:{type:'array',items:{type:'string'}}, totalMaterial:{type:'array',items:{type:'string'}}, summary:{type:'string'},
    exercises:{type:'array',minItems:1,maxItems:12,items:{type:'object',required:['block','name','duration','objective','players','space','material','organization','development','instructions','variants','coachingPoints'],properties:{
      block:{type:'string'},name:{type:'string'},duration:{type:'integer'},objective:{type:'string'},players:{type:'integer'},space:{type:'string'},material:{type:'array',items:{type:'string'}},organization:{type:'string'},development:{type:'string'},instructions:{type:'array',items:{type:'string'}},variants:{type:'array',items:{type:'string'}},coachingPoints:{type:'array',items:{type:'string'}}
    }}}
  }
};

const SYSTEM_PROMPT = `Eres el asistente de planificación de fútbol base de CONVO. Diseña sesiones seguras, realistas y apropiadas para la edad. Prioriza participación alta, poco tiempo de espera, mucho contacto con balón, diversión en edades tempranas, toma de decisiones y situaciones parecidas al juego. Evita tareas demasiado complejas. La suma de minutos debe coincidir con la duración solicitada (tolerancia máxima 5 minutos). Usa español claro para entrenadores. Cada ejercicio debe poder realizarse con los jugadores, porteros, espacio y material indicados. No incluyas explicaciones fuera del objeto JSON.`;

function userPrompt(input: AITrainingRequest) {
  const base = `Categoría: ${input.category}. Formato: ${input.format}. Jugadores: ${input.context.players}, porteros: ${input.context.goalkeepers}. Duración: ${input.context.duration} minutos. Nivel: ${input.context.level}. Modalidad: ${input.context.mode}. Objetivos: ${input.context.objectives.join(', ')}. Material: ${input.context.material.join(', ') || 'no indicado'}. Campo: ${input.context.fieldSize || 'no indicado'}. Intensidad: ${input.context.intensity}. Observaciones: ${input.context.observations || 'ninguna'}.`;
  if (input.action === 'exercise') return `Regenera únicamente el ejercicio indicado dentro de la sesión, pero devuelve la sesión completa conservando todos los demás ejercicios sin cambios. ${base}\nSesión actual: ${JSON.stringify(input.currentSession)}\nEjercicio a cambiar: ${JSON.stringify(input.exercise)}\nPetición: ${input.instruction || 'Propón una alternativa equivalente.'}`;
  if (input.action === 'adapt') return `Adapta la sesión existente conservando objetivos, duración y estructura siempre que sea viable. Modifica grupos, espacios, reglas o ejercicios solo cuando sea necesario. ${base}\nSesión actual: ${JSON.stringify(input.currentSession)}\nPetición: ${input.instruction || 'Adapta la sesión al nuevo contexto.'}`;
  return `Genera una sesión completa con bloques cronológicos flexibles. ${base}`;
}

export class GeminiTrainingProvider implements AITrainingProvider {
  name = 'gemini';
  model: string;
  constructor(private apiKey: string, model = process.env.AI_MODEL || 'gemini-3.5-flash-lite') { this.model = model }
  async generate(input: AITrainingRequest) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
          method:'POST', signal:controller.signal, headers:{'Content-Type':'application/json','x-goog-api-key':this.apiKey},
          body:JSON.stringify({ systemInstruction:{parts:[{text:SYSTEM_PROMPT}]}, contents:[{role:'user',parts:[{text:userPrompt(input)}]}], generationConfig:{responseMimeType:'application/json',responseJsonSchema:sessionSchema,thinkingConfig:{thinkingLevel:'low'}} })
        });
        if (response.status >= 500 && attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 750));
          continue;
        }
        if (!response.ok) throw new Error(response.status === 429 ? 'limit' : response.status >= 500 ? 'unavailable' : `provider_${response.status}`);
        const payload = await response.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>};
        const raw = payload.candidates?.[0]?.content?.parts?.map(part=>part.text || '').join('') || '';
        if (!raw) throw new Error('empty');
        try { return JSON.parse(raw); } catch { throw new Error('invalid_json') }
      }
      throw new Error('unavailable');
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw new Error('timeout');
      throw error;
    } finally { clearTimeout(timeout) }
  }
}

export class AITrainingService {
  constructor(private provider: AITrainingProvider) {}
  async generate(input: AITrainingRequest) {
    const raw = await this.provider.generate(input);
    const session = validateTrainingAISession(raw,{players:input.context.players,duration:input.context.duration});
    if (!session) throw new Error('invalid_response');
    return session;
  }
  metadata(){ return {provider:this.provider.name,model:this.provider.model} }
}

export async function ensureAITrainingSchema(sql:Sql){
  await sql`CREATE TABLE IF NOT EXISTS ai_generation_logs (
    id BIGSERIAL PRIMARY KEY,account_id TEXT NOT NULL REFERENCES club_accounts(id) ON DELETE CASCADE,
    club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,event_id TEXT NOT NULL,generation_type TEXT NOT NULL,
    provider TEXT NOT NULL,model TEXT NOT NULL,success BOOLEAN NOT NULL,error_code TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS ai_generation_logs_daily_idx ON ai_generation_logs(account_id,created_at DESC)`;
}

export async function logAIGeneration(sql:Sql,input:{accountId:string;clubId:string;eventId:string;type:string;provider:string;model:string;success:boolean;error?:string}){
  await sql`INSERT INTO ai_generation_logs(account_id,club_id,event_id,generation_type,provider,model,success,error_code) VALUES (${input.accountId},${input.clubId},${input.eventId},${input.type},${input.provider},${input.model},${input.success},${input.error?.slice(0,80)||null})`;
}
