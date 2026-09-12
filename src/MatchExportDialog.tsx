import {useEffect,useRef} from 'react';
import {Download} from 'lucide-react';
import {matchWeek} from './matchWeek';
import type {CoordinatorScope} from './clubTypes';

export function MatchExportDialog({date,scope,onScope,onClose,onExport}:{date:string;scope:CoordinatorScope;onScope:(scope:CoordinatorScope)=>void;onClose:()=>void;onExport:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const week=matchWeek(date);
  useEffect(()=>{const element=dialog.current!;element.showModal();return()=>element.close();},[]);
  return <dialog ref={dialog} className="match-export-dialog" onCancel={onClose} aria-labelledby="match-export-title">
    <h3 id="match-export-title">Exportar partidos</h3>
    <p>Semana del {week.start.split('-').reverse().join('/')} al {week.end.split('-').reverse().join('/')}</p>
    <label>Equipos a incluir<select autoFocus value={scope} onChange={event=>onScope(event.target.value as CoordinatorScope)}><option value="all">Todo · F8 y F11</option><option value="f8">Solo F8</option><option value="f11">Solo F11</option></select></label>
    <footer><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={onExport}><Download size={17}/> Exportar</button></footer>
  </dialog>;
}
