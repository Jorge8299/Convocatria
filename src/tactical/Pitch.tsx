import { useId } from 'react';
import type { FieldType } from './model';

export function Pitch({ fieldType }: { fieldType: FieldType }) {
  const prefix = useId().replace(/:/g, '');
  const penalty = fieldType === 'F11' ? 155 : 125;
  return <g className="tactic-pitch" aria-hidden="true">
    <defs>
      <linearGradient id={`${prefix}-rim`} x2="0" y2="1"><stop stopColor="#425d63" /><stop offset=".1" stopColor="#0a1d24" /><stop offset=".9" stopColor="#09171b" /><stop offset="1" stopColor="#476468" /></linearGradient>
      <radialGradient id={`${prefix}-grass`}><stop stopColor="#397321" /><stop offset=".65" stopColor="#245918" /><stop offset="1" stopColor="#153f1d" /></radialGradient>
      <pattern id={`${prefix}-stripes`} width="140" height="570" patternUnits="userSpaceOnUse"><rect width="70" height="570" fill="#89ab43" opacity=".105" /></pattern>
      <pattern id={`${prefix}-blades`} width="11" height="13" patternUnits="userSpaceOnUse"><path d="M1 3l1-2M6 9l1-2M10 5l-1 3M4 12l-1-2" stroke="#b1c65e" strokeWidth=".55" opacity=".24" /><path d="M3 6l1 2M8 1l1 2M8 12l1-2" stroke="#082e18" strokeWidth=".9" opacity=".35" /></pattern>
      <pattern id={`${prefix}-net`} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#c7d8d1" strokeWidth=".65" opacity=".65" /></pattern>
    </defs>
    <rect x="8" y="8" width="1084" height="704" rx="44" fill={`url(#${prefix}-rim)`} stroke="#59777b" strokeWidth="2" />
    <rect x="21" y="21" width="1058" height="678" rx="35" fill="#0b2525" stroke="#273d3e" />
    <rect x="50" y="65" width="1000" height="590" rx="12" fill={`url(#${prefix}-grass)`} />
    <rect x="50" y="65" width="1000" height="590" rx="12" fill={`url(#${prefix}-stripes)`} />
    <rect x="50" y="65" width="1000" height="590" rx="12" fill={`url(#${prefix}-blades)`} />
    <g stroke="#e1efcb" strokeWidth="2.3" fill="none" opacity=".92">
      <rect x="60" y="75" width="980" height="570" /><path d="M550 75V645" /><circle cx="550" cy="360" r="81" />
      <path d={`M60 190h${penalty}v340H60M1040 190h-${penalty}v340h${penalty}`} />
      <path d="M60 280h52v160H60M1040 280h-52v160h52" />
      <path d={`M${60 + penalty} 290q73 70 0 140M${1040 - penalty} 290q-73 70 0 140`} />
      <path d="M60 94a19 19 0 0 0 19-19M1021 75a19 19 0 0 0 19 19M60 626a19 19 0 0 1 19 19M1021 645a19 19 0 0 1 19-19" />
    </g>
    <g fill="#ecf4d7"><circle cx="550" cy="360" r="3.8" /><circle cx="165" cy="360" r="3" /><circle cx="935" cy="360" r="3" /></g>
    <g fill={`url(#${prefix}-net)`} stroke="#c0cfca" strokeWidth="2"><path d="M60 313H31v94h29Z" /><path d="M1040 313h29v94h-29Z" /></g>
    <g fill="#f8b72f"><path d="M57 75v-13l10 7Z" /><path d="M1043 75v-13l-10 7Z" /><path d="M57 645v13l10-7Z" /><path d="M1043 645v13l-10-7Z" /></g>
    <path d="M57 42l12-13h11L67 42h-10m16-3 12 12h-10l-7-7" fill="#00d1a2" />
    <text x="96" y="47" fill="#c7d7d8" fontSize="20" fontWeight="700" letterSpacing="4">CONVO</text>
    <text x="1037" y="43" textAnchor="end" fill="#86a19d" fontSize="10" letterSpacing="3">ENTRENA. PLANIFICA. EVOLUCIONA.</text>
    <text x="60" y="681" fill="#829d97" fontSize="10" letterSpacing="3">EL JUEGO EN TUS IDEAS</text>
    <path d="M480 680h40m15 0h50m15 0h40" stroke="#00cfa0" strokeWidth="2" />
    <text x="1040" y="683" textAnchor="end" fill="#b8cfca" fontSize="12" letterSpacing="2">{fieldType === 'F8' ? 'FÚTBOL 8' : 'FÚTBOL 11'}</text>
  </g>;
}
