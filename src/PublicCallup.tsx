import {useEffect,useState,type CSSProperties} from 'react';
import {Check,Clock,MapPin,ShieldCheck} from 'lucide-react';
import {callupRequest,type Callup,type AttendancePlayer} from './callups';
import './callups.css';
export default function PublicCallup(){
 const token=location.pathname.split('/')[2]||'';
 const [data,setData]=useState<Callup|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState<AttendancePlayer|null>(null),[answer,setAnswer]=useState<'SI'|'NO'>('SI'),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[success,setSuccess]=useState('');
 useEffect(()=>{let active=true;callupRequest<Callup>(undefined,token).then(c=>{if(active)setData(c);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[token]);
 return <main className="callups-public" style={{'--callups-brand':data?.club.color_principal||'#0b2344'} as CSSProperties}>
 <header className="callups-public-brand">{data?.club.logo?<img src={data.club.logo} alt={'Escudo de '+data.club.nombre}/>:<ShieldCheck size={36}/>}<div><strong>{data?.club.nombre||'Convocatria'}</strong><span>CONFIRMACIÓN DE ASISTENCIA</span></div></header>
 {!data&&!error&&<p role="status">Cargando convocatoria…</p>}{error&&<p role="alert" className="callups-error">{error}</p>}
 {data&&<><section className="callups-card callups-match-hero"><span className="eyebrow">CONVOCATORIA</span><h1>{data.title}</h1><p><Clock size={17}/> {data.match_date.split('-').reverse().join('/')} · {data.match_time}</p><p><MapPin size={17}/> {data.field}</p></section>
 {data.closed?<section className="callups-card"><h2>Convocatoria cerrada</h2><p>El entrenador ha cerrado las respuestas. Para cualquier cambio, contacta con él.</p></section>:<section className="callups-card"><h2>Confirma por tu hijo</h2><p>Busca su dorsal y nombre. Si no puede asistir, puedes indicar el motivo; solo lo verá el entrenador.</p>
 {success&&<p className="callups-success" role="status"><Check size={20}/> ¡Confirmado! {success}</p>}
<ul className="callups-public-roster">{data.players.map(p=><li key={p.jugador_id} className={`response-${p.estado}`}>
  <h3><span className="callups-number">{p.dorsal||'—'}</span>{p.nombre}</h3>
  {p.estado==='SI'&&<span className="callups-answered yes"><Check size={14}/> Confirmado: va al partido</span>}
  {p.estado==='NO'&&<span className="callups-answered no">No puede asistir</span>}
  <div className="callups-answer-actions"><button disabled={busy} className="callups-yes" onClick={()=>{setSelected(p);setAnswer('SI');setReason('');setSuccess('');setError('');}}>SÍ VOY</button><button disabled={busy} className="callups-no" onClick={()=>{setSelected(p);setAnswer('NO');setReason('');setSuccess('');setError('');}}>NO PUEDO</button></div>
 {selected?.jugador_id===p.jugador_id&&<form className="callups-confirm" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{const saved=await callupRequest<{estado:'SI'|'NO';updated_at:string}>({jugador_id:p.jugador_id,estado:answer,motivo:reason},token);setData(current=>current?{...current,players:current.players.map(player=>player.jugador_id===p.jugador_id?{...player,estado:saved.estado,updated_at:saved.updated_at}:player)}:current);setSuccess(p.nombre+' · '+(saved.estado==='SI'?'Sí voy':'No puedo'));setSelected(null);}catch(e){setError((e as Error).message);try{setData(await callupRequest<Callup>(undefined,token));}catch{/* Keep the actionable submit error. */}}finally{setBusy(false);}}}>
 <strong>¿Confirmas que {p.nombre} {answer==='SI'?'va al partido':'no puede asistir'}?</strong>
 {answer==='NO'&&<label>Motivo opcional<input maxLength={160} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ej: fiebre, comunión…" autoComplete="off"/><small>Solo para el entrenador.</small></label>}
 <div className="callups-answer-actions"><button className="primary-button" disabled={busy} type="submit">{busy?'Guardando…':'Confirmar'}</button><button className="secondary-button" disabled={busy} type="button" onClick={()=>setSelected(null)}>Cancelar</button></div></form>}
 </li>)}</ul>{!data.players.length&&<p>El entrenador todavía no ha añadido jugadores.</p>}
 </section>}</>}
 <footer>Convocatria · Confirma únicamente por tu familia. Puedes cambiar tu respuesta mientras la convocatoria esté abierta.</footer>
 </main>;
}
