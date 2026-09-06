import { useId } from 'react';
import type { BoardElement } from './model';

// Vector miniature: the number, kit, gloves, lighting and selection are live SVG.
export function Piece({ element, selected = false, moving = false }: { element: BoardElement; selected?: boolean; moving?: boolean }) {
  const id = useId().replace(/:/g, '');
  const keeper = element.kind.includes('keeper');
  const rival = element.kind.startsWith('away');
  return <g className={`tactic-piece-art${selected ? ' is-selected' : ''}${moving ? ' is-moving' : ''}`}>
    <defs>
      <linearGradient id={`${id}-kit`} x1="0" y1="0" x2="1" y2=".5"><stop stopColor="#09182a" /><stop offset=".24" stopColor={element.color} /><stop offset=".62" stopColor={element.color} /><stop offset="1" stopColor="#09182a" /></linearGradient>
      <radialGradient id={`${id}-skin`} cx=".35" cy=".25" r=".8"><stop stopColor="#ffdfb5" /><stop offset=".68" stopColor="#dab28a" /><stop offset="1" stopColor="#99765c" /></radialGradient>
      <linearGradient id={`${id}-hair`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#7c6c5f" /><stop offset=".24" stopColor="#342d2b" /><stop offset=".65" stopColor="#151c22" /><stop offset="1" stopColor="#535256" /></linearGradient>
      <linearGradient id={`${id}-base`} x2="0" y2="1"><stop stopColor="#5d7277" /><stop offset=".3" stopColor="#243b42" /><stop offset="1" stopColor="#071419" /></linearGradient>
      <radialGradient id={`${id}-ball`} cx=".3" cy=".2"><stop stopColor="#fff" /><stop offset=".75" stopColor="#d4dddf" /><stop offset="1" stopColor="#768791" /></radialGradient>
    </defs>
    <ellipse cx="32" cy="77" rx="28" ry="7" fill="#00100c" opacity=".45" />
    {selected && <ellipse className="tactic-selection-halo" cx="32" cy="69" rx="32" ry="14" fill="#00d4ee18" stroke="#60edff" strokeWidth="2" />}
    {element.kind === 'ball' ? <g>
      <circle cx="32" cy="55" r="20" fill={`url(#${id}-ball)`} stroke="#13262e" strokeWidth="1.4" />
      <path d="m32 44 9 6-4 11H26l-4-11Z M16 43l8-6 3 8-6 6-7-1 M49 42l-8-5-4 8 6 6 8-1 M18 66l9-5 6 7-3 7 M46 67l-9-6-5 7 3 7" fill="#1a252f" />
      <path d="M23 51l-5 15m23-16 5 17m-14-23-5-7" stroke="#5f6e77" fill="none" />
    </g> : element.kind === 'cone' ? <g>
      <path d="M11 70l21-9 21 9v6l-21 7-21-7Z" fill="#c45712" /><path d="m11 70 21-9 21 9-21 8Z" fill={element.color} />
      <path d="m27 29-11 40q16 9 32 0L37 29q-5-4-10 0Z" fill={element.color} stroke="#a94e11" />
      <path d="m24 40-2 8q10 5 20 0l-2-8q-8 4-16 0m-6 20-2 8q16 8 32 0l-2-8q-14 7-28 0" fill="#f3f1dd" />
      <path d="m28 33-8 34" stroke="#ffca80" strokeWidth="2" opacity=".7" />
    </g> : <g opacity={element.locked ? .65 : 1}>
      <ellipse cx="32" cy="72" rx="28" ry="10" fill={`url(#${id}-base)`} stroke="#09222c" />
      <ellipse cx="32" cy="68" rx="27" ry="9" fill="#13252d" stroke={selected ? '#76f4ff' : rival ? '#ff7770' : keeper ? '#50df90' : '#4eafff'} strokeWidth={selected ? 2.8 : 1.8} />
      <path d="M18 58v9q7 5 13 0v-9m2 0v9q7 5 13 0v-9" fill="#15202a" stroke="#3a4246" />
      <path d="M16 34Q6 40 6 58q1 7 8 5l6-19M48 34q10 6 10 24-1 7-8 5l-6-19" fill={`url(#${id}-kit)`} stroke="#071b2b" />
      <path d="M17 32q15-9 30 0l5 28q-2 13-20 13T12 60Z" fill={`url(#${id}-kit)`} stroke="#0c1a28" strokeWidth="1.3" />
      <path d="m22 29 10 9 10-9" fill="none" stroke={rival || keeper ? '#1b242a' : '#e2edf4'} strokeWidth="4" />
      <path d="M9 48l7 2m32 0 7-2" stroke={rival ? '#19232a' : '#e9f0ee'} strokeWidth="3" />
      {keeper && <g fill="#f2f1df" stroke="#8caaa1" strokeWidth=".8"><path d="M5 51q6-2 9 2l-1 13-5 1-4-5Zm54 0q-6-2-9 2l1 13 5 1 4-5Z" /><path d="m9 57 1 7m45-7-1 7" /></g>}
      <text x="32" y="61" textAnchor="middle" fill="#f1f6f8" fontSize={element.number.length > 2 ? 15 : 23} fontFamily="Arial, sans-serif" fontWeight="800" stroke="#ffffff26" strokeWidth=".4">{element.number}</text>
      <path d="m41 40 4-4h3l-4 4m1-1 4 4h-3l-2-2" fill="#eef8ff" />
      <ellipse cx="32" cy="22" rx="16" ry="18" fill={`url(#${id}-skin)`} stroke="#51433c" strokeWidth=".8" />
      <path d="M15 23Q8 5 26 2q11-5 21 4 7 5 3 19l-5-13Q30 26 18 16Z" fill={`url(#${id}-hair)`} stroke="#746e69" strokeWidth=".7" />
      <path d="M16 14Q30 6 35 3M21 15Q37 13 43 5" fill="none" stroke="#ada195" strokeWidth="1" opacity=".6" />
      {selected && <ellipse cx="32" cy="26" rx="22" ry="27" fill="none" stroke="#65e6ff" strokeWidth="1" opacity=".55" />}
    </g>}
    {element.locked && <g transform="translate(48 65)"><rect width="13" height="11" rx="3" fill="#e8eef2" /><path d="M3 1v-3a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="#e8eef2" strokeWidth="2" /><circle cx="6.5" cy="5" r="1.5" fill="#213541" /></g>}
  </g>;
}
