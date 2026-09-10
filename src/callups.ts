export interface AttendancePlayer {
 jugador_id:string;nombre:string;dorsal:string;estado?:'PENDIENTE'|'SI'|'NO';motivo?:string|null;updated_at?:string|null;
}
export interface Callup {
 id:string;event_id:string;token:string;title:string;message:string;prompt:string;match_date:string;match_time:string;field:string;
 closed:boolean;created_at:string;players:AttendancePlayer[];
 club:{nombre:string;logo:string;color_principal:string};
}
export function sortAttendancePlayers<T extends {dorsal:string;nombre:string}>(players:T[]):T[]{
 const number=(v:string)=>/^\d+$/.test(v.trim())?Number(v):Infinity;
 return [...players].sort((a,b)=>number(a.dorsal)-number(b.dorsal)||a.nombre.localeCompare(b.nombre,'es'));
}
export const DEFAULT_CONFIRMATION_TEXT='Para confirmar la asistencia, pulsa aquí.';
export function confirmationMessage(message:string,url:string,prompt:string=DEFAULT_CONFIRMATION_TEXT){
 const stripped=message.replace(/Si alguien no puede venir, que avise por privado\.\s*/g,'')
 .replace(/\n*✅[^\n]*\nhttps?:\/\/[^\s]*$/,'').trimEnd();
 return stripped+'\n\n✅ '+prompt.trim().replace(/\s*\n\s*/g,' ')+'\n'+url;
}
export async function callupRequest<T>(body?:unknown,token?:string):Promise<T>{
 const response=await fetch('/api/data?section=callups'+(token?'&token='+encodeURIComponent(token):''),{
 credentials:'same-origin',cache:'no-store',method:body?'POST':'GET',
 headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined
 });
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||'No se pudo completar la operación.');
 return data;
}
export async function copyCallupText(text:string){
 if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return;}catch{/* Browser permissions: manual fallback below. */}}
 const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';
 document.body.append(input);input.select();
 try{if(!document.execCommand('copy'))throw new Error('No se pudo copiar. Selecciona el mensaje y cópialo.');}finally{input.remove();}
}
