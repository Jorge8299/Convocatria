import { randomUUID } from 'node:crypto';
import { ApiRequest, ApiResponse, fail, getSession, getSql, jsonBody, methodNotAllowed } from './_lib/server.js';

const MATCH_TYPES = new Set(['liga', 'amistoso', 'torneo']);
const HOME_FIELDS = new Set(['El Morer', 'Campo C', 'Polideportivo']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

interface MatchInput {
  date?: string;
  startTime?: string;
  notes?: string;
  playInWhite?: boolean;
  matchType?: string;
  home?: boolean;
  rivalId?: string;
  rivalName?: string;
  field?: string;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const session = await getSession(req);
    if (!session) { res.status(401).json({ error: 'Sesión caducada.' }); return }
    const sql = getSql();

    if (req.method === 'POST') {
      if (session.role !== 'coordinador') { res.status(403).json({ error: 'Solo coordinación puede asignar partidos.' }); return }
      const body = jsonBody<{ accountId?: string; match?: MatchInput }>(req);
      const match = body.match || {};
      if (!body.accountId || !DATE_PATTERN.test(match.date || '') || !TIME_PATTERN.test(match.startTime || '') ||
          !MATCH_TYPES.has(match.matchType || '') || typeof match.home !== 'boolean' || !match.rivalId || !match.rivalName?.trim() || !match.field?.trim()) {
        res.status(400).json({ error: 'Completa equipo, fecha, hora, rival y campo.' }); return;
      }
      if (match.home && !HOME_FIELDS.has(match.field)) { res.status(400).json({ error: 'Selecciona un campo local válido.' }); return }

      const targets = await sql`SELECT id FROM club_accounts WHERE id=${body.accountId} AND role='entrenador' AND active=TRUE LIMIT 1`;
      if (!targets[0]) { res.status(404).json({ error: 'El entrenador seleccionado no está disponible.' }); return }
      const rivalRows = await sql`SELECT data FROM club_stores WHERE account_id=${body.accountId} AND area='rivals' LIMIT 1`;
      const rivals = Array.isArray(rivalRows[0]?.data) ? rivalRows[0].data as Array<Record<string, unknown>> : [];
      const rival = rivals.find((item) => String(item.id) === match.rivalId);
      if (!rival || String(rival.nombre).trim() !== match.rivalName.trim()) { res.status(400).json({ error: 'Selecciona un rival guardado para este equipo.' }); return }

      const now = new Date().toISOString();
      const event = {
        id: randomUUID(),
        type: 'match',
        date: match.date,
        startTime: match.startTime,
        notes: String(match.notes || '').trim().slice(0, 500),
        playInWhite: match.playInWhite === true,
        matchType: match.matchType,
        home: match.home,
        rivalId: match.rivalId,
        rivalName: match.rivalName.trim().slice(0, 120),
        field: match.field.trim().slice(0, 160),
        assignedByCoordinator: true,
        assignedByName: session.name,
        assignedAt: now,
        acknowledgedAt: null,
      };
      await sql`INSERT INTO club_stores (account_id,area,data)
        VALUES (${body.accountId},'agenda',jsonb_build_array(${JSON.stringify(event)}::jsonb))
        ON CONFLICT (account_id,area) DO UPDATE
        SET data=COALESCE(club_stores.data,'[]'::jsonb) || EXCLUDED.data,updated_at=NOW()`;
      res.status(201).json({ event }); return;
    }

    if (req.method === 'PATCH') {
      if (session.role !== 'entrenador') { res.status(403).json({ error: 'Solo el entrenador puede confirmar el aviso.' }); return }
      const { eventId } = jsonBody<{ eventId?: string }>(req);
      if (!eventId) { res.status(400).json({ error: 'Partido no válido.' }); return }
      const acknowledgedAt = new Date().toISOString();
      const rows = await sql`UPDATE club_stores
        SET data=(
          SELECT jsonb_agg(
            CASE WHEN item->>'id'=${eventId} AND item->>'assignedByCoordinator'='true'
              THEN item || jsonb_build_object('acknowledgedAt',${acknowledgedAt}::text)
              ELSE item END
          ) FROM jsonb_array_elements(data) AS item
        ),updated_at=NOW()
        WHERE account_id=${session.id} AND area='agenda'
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(data) AS item WHERE item->>'id'=${eventId} AND item->>'assignedByCoordinator'='true')
        RETURNING account_id`;
      if (!rows[0]) { res.status(404).json({ error: 'No se encontró el partido asignado.' }); return }
      res.status(200).json({ ok: true, acknowledgedAt }); return;
    }

    return methodNotAllowed(res);
  } catch (error) { fail(res, error) }
}
