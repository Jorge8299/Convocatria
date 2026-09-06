export interface Club {
  id: string;
  nombre: string;
  slug: string;
  logo: string;
  color_principal: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}
export const OLIVA_CLUB_ID = 'ud-oliva';
export const INITIAL_CLUB: Club = {
  id: OLIVA_CLUB_ID, nombre: 'UD Oliva', slug: 'ud-oliva',
  logo: '/escudo-ud-oliva.jpg', color_principal: '#0b2344', activo: true,
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
};
export function validClubEdit(value: unknown): boolean {
  const c = value as Partial<Club> | null;
  return !!c && typeof c.nombre === 'string' && !!c.nombre.trim() && c.nombre.length <= 120 &&
    typeof c.logo === 'string' && c.logo.length <= 500000 &&
    (/^\/(?!\/)[\w./-]+$/.test(c.logo) || /^https:\/\/[^\s]+$/.test(c.logo) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(c.logo)) &&
    typeof c.color_principal === 'string' && /^#[0-9a-f]{6}$/i.test(c.color_principal);
}
export function slugifyClub(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
}
