import { randomUUID } from 'node:crypto';
import type { getSql } from './server.js';

export type ManualPlayerInput = {
  accountId?: unknown;
  name?: unknown;
  number?: unknown;
  role?: unknown;
};

export type DeletePlayerInput = {
  accountId?: unknown;
  playerId?: unknown;
};

export async function addAdminPlayer(
  clubId: string | null,
  input: ManualPlayerInput,
  sql: ReturnType<typeof getSql>,
) {
  const accountId = typeof input.accountId === 'string' ? input.accountId : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const number = typeof input.number === 'string' ? input.number.trim() : '';
  const role = input.role === 'portero' ? 'portero' : input.role === 'jugador' ? 'jugador' : '';
  if (!clubId || !accountId || !name || name.length > 120 || number.length > 10 || !role) {
    throw new Error('Revisa el nombre, el dorsal y el tipo de jugador.');
  }
  const coach = (await sql`SELECT id,club_id,team_label FROM club_accounts WHERE id=${accountId} AND club_id=${clubId} AND role='entrenador' AND active=TRUE`)[0];
  if (!coach) throw new Error('El equipo seleccionado no es válido.');
  const player = { id: randomUUID(), name, number, role, group: 'plantilla', active: true, ownerCoachId: coach.id };
  const encoded = JSON.stringify(player);
  await sql`INSERT INTO club_stores(account_id,club_id,area,data)
    VALUES(${coach.id},${clubId},'team',jsonb_build_object('name',${coach.team_label}::text,'season','','players',jsonb_build_array(${encoded}::jsonb)))
    ON CONFLICT(account_id,area) DO UPDATE SET
      data=jsonb_set(club_stores.data,'{players}',COALESCE(club_stores.data->'players','[]'::jsonb)||${encoded}::jsonb),updated_at=NOW()`;
  return player;
}

export async function deleteAdminPlayer(
  clubId: string | null,
  input: DeletePlayerInput,
  sql: ReturnType<typeof getSql>,
) {
  const accountId = typeof input.accountId === 'string' ? input.accountId : '';
  const playerId = typeof input.playerId === 'string' ? input.playerId : '';
  if (!clubId || !accountId || !playerId || playerId.length > 200) {
    throw new Error('No se pudo identificar al jugador.');
  }
  const coach = (await sql`SELECT id FROM club_accounts WHERE id=${accountId} AND club_id=${clubId} AND role='entrenador' AND active=TRUE`)[0];
  if (!coach) throw new Error('El equipo seleccionado no es válido.');
  const rows = await sql`UPDATE club_stores
    SET data=jsonb_set(
      data,
      '{players}',
      COALESCE((SELECT jsonb_agg(player) FROM jsonb_array_elements(COALESCE(data->'players','[]'::jsonb)) AS player WHERE player->>'id'<>${playerId}),'[]'::jsonb),
      TRUE
    ),updated_at=NOW()
    WHERE account_id=${accountId} AND club_id=${clubId} AND area='team'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(data->'players','[]'::jsonb)) AS player WHERE player->>'id'=${playerId})
    RETURNING account_id`;
  if (!rows.length) throw new Error('El jugador ya no está en esta plantilla.');
  return { id: playerId };
}
