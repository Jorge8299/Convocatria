import { useEffect, useState } from 'react';
import { clubApi } from './api';
import { validClubEdit, type Club } from './clubs';

export function ClubsPanel() {
  const [clubs,setClubs] = useState<Club[]>([]);
  const [draft,setDraft] = useState<Club|null>(null);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  useEffect(() => { let active=true; clubApi.clubs().then(result=>{if(active)setClubs(result.clubs)}).catch(()=>{if(active)setMessage('No se pudieron cargar los clubes.')}); return ()=>{active=false} },[]);
  const save = async () => {
    if (!draft || !validClubEdit(draft)) { setMessage('Revisa el nombre, el escudo y el color.'); return }
    setBusy(true); setMessage('');
    try { const result=await clubApi.updateClub(draft); setClubs(result.clubs); setDraft(null); setMessage('Club guardado.'); }
    catch(error) { setMessage(error instanceof Error?error.message:'No se pudo guardar.'); }
    finally { setBusy(false); }
  };
  return <section className="superadmin-audit" aria-label="Clubes"><div className="superadmin-audit-heading"><h2>Clubes</h2><button type="button" disabled title="Disponible en una próxima fase">Añadir club</button></div>
    {message && <p role="status">{message}</p>}
    {clubs.map(club=><article key={club.id} style={{display:'flex',alignItems:'center',gap:16,padding:16,flexWrap:'wrap'}}><img src={club.logo} alt={`Escudo de ${club.nombre}`} style={{width:56,height:56,objectFit:'contain'}} /><div><strong>{club.nombre}</strong><p>{club.activo?'Activo':'Inactivo'}</p></div><span style={{background:club.color_principal,width:24,height:24,borderRadius:6,border:'1px solid #ccc'}} aria-label={`Color ${club.color_principal}`} /><span>{club.color_principal}</span><button type="button" onClick={()=>{setDraft({...club});setMessage('')}}>Editar club</button></article>)}
    {draft && <form onSubmit={event=>{event.preventDefault();void save()}} style={{display:'grid',gap:12,padding:16}}><label>Nombre<input aria-label="Nombre del club" value={draft.nombre} maxLength={120} onChange={e=>setDraft({...draft,nombre:e.target.value})} required /></label><label>Escudo (URL)<input aria-label="Escudo del club" value={draft.logo} onChange={e=>setDraft({...draft,logo:e.target.value})} /></label><label>Subir escudo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>350000){setMessage('El escudo debe ocupar menos de 350 KB.');return}const reader=new FileReader();reader.onload=()=>setDraft(current=>current?{...current,logo:String(reader.result)}:current);reader.readAsDataURL(file)}} /></label><label>Color principal<input aria-label="Color principal" type="color" value={draft.color_principal} onChange={e=>setDraft({...draft,color_principal:e.target.value})} /></label><div><button disabled={busy} type="submit">{busy?'Guardando…':'Guardar club'}</button><button type="button" disabled={busy} onClick={()=>setDraft(null)}>Cancelar</button></div></form>}
  </section>;
}
