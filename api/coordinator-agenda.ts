import { randomUUID } from 'node:crypto';
import { ApiRequest, ApiResponse, fail, getSession, getSql, jsonBody, methodNotAllowed } from './_lib/server.js';

const MATCH_TYPES = new Set(['liga', 'amistoso', 'torneo']);
const HOME_FIELDS = new Set(['El Morer', 'Campo C', 'Polideportivo']);
const TRAINING_FIELDS: Record<string, { name: string; zones: Set<string> }> = {
  'campo-c': { name: 'Campo C', zones: new Set(['c-1', 'c-2']) },
  'el-morer': { name: 'El Morer', zones: new Set(['m-1', 'm-2', 'm-3', 'm-4']) },
  polideportivo: { name: 'Polideportivo', zones: new Set(['p-1', 'p-2', 'p-3', 'p-4']) },
};
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

interface MatchInput {
  date?: string;
  startTime?: string;
  callupTime?: string;
  callupPlace?: string;
  kit?: string;
  homeLockerRoom?: string;
  awayLockerRoom?: string;
  notes?: string;
  playInWhite?: boolean;
  matchType?: string;
  home?: boolean;
  rivalId?: string;
  rivalName?: string;
  field?: string;
}

interface TrainingSlotInput {
  weekday?: number;
  startTime?: string;
  endTime?: string;
  fieldId?: string;
  zoneIds?: string[];
  notes?: string;
}

interface TrainingInput {
  fromDate?: string;
  toDate?: string;
  slots?: TrainingSlotInput[];
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const session = await getSession(req);
    if (!session) { res.status(401).json({ error: 'Sesión caducada.' }); return }
    const sql = getSql();

    if (req.method === 'POST') {
      if (session.role !== 'coordinador') { res.status(403).json({ error: 'Solo coordinación puede asignar actividades.' }); return }
      const body = jsonBody<{ accountId?: string; match?: MatchInput; training?: TrainingInput }>(req);
      if (!body.accountId) { res.status(400).json({ error: 'Selecciona un equipo.' }); return }
      const targets = await sql`SELECT id FROM club_accounts WHERE id=${body.accountId} AND role='entrenador' AND active=TRUE LIMIT 1`;
      if (!targets[0]) { res.status(404).json({ error: 'El entrenador seleccionado no está disponible.' }); return }

      if (body.training) {
        const training = body.training;
        const slots = Array.isArray(training.slots) ? training.slots : [];
        if (!DATE_PATTERN.test(training.fromDate || '') || !DATE_PATTERN.test(training.toDate || '') || training.fromDate! > training.toDate! || !slots.length) {
          res.status(400).json({ error: 'Indica el periodo y al menos un día habitual.' }); return;
        }
        if (slots.some((slot) => !Number.isInteger(slot.weekday) || slot.weekday! < 0 || slot.weekday! > 6 || !TIME_PATTERN.test(slot.startTime || '') || !TIME_PATTERN.test(slot.endTime || '') || slot.startTime! >= slot.endTime! || !slot.fieldId || !TRAINING_FIELDS[slot.fieldId] || !Array.isArray(slot.zoneIds) || !slot.zoneIds.length || slot.zoneIds.some((zone) => !TRAINING_FIELDS[slot.fieldId!].zones.has(zone)))) {
          res.status(400).json({ error: 'Revisa días, horarios, campo y zonas de entrenamiento.' }); return;
        }
        const start = new Date(`${training.fromDate}T12:00:00Z`);
        const end = new Date(`${training.toDate}T12:00:00Z`);
        if ((end.getTime() - start.getTime()) / 86400000 > 550) { res.status(400).json({ error: 'El periodo no puede superar 18 meses.' }); return }
        const seriesId = randomUUID();
        const assignedAt = new Date().toISOString();
        const events: Array<Record<string, unknown>> = [];
        for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
          const date = cursor.toISOString().slice(0, 10);
          for (const slot of slots.filter((item) => item.weekday === cursor.getUTCDay())) {
            events.push({
              id: randomUUID(), type: 'training', date,
              startTime: slot.startTime, endTime: slot.endTime,
              notes: String(slot.notes || '').trim().slice(0, 500),
              fieldId: slot.fieldId, fieldName: TRAINING_FIELDS[slot.fieldId!].name,
              zoneIds: slot.zoneIds, seriesId, recurrenceLabel: 'Horario habitual',
              assignedByCoordinator: true, assignedByName: session.name,
              assignedAt, exceptionStatus: 'scheduled',
            });
          }
        }
        if (!events.length) { res.status(400).json({ error: 'El periodo no contiene ninguno de los días elegidos.' }); return }
        await sql`INSERT INTO club_stores (account_id,area,data)
          VALUES (${body.accountId},'agenda',${JSON.stringify(events)}::jsonb)
          ON CONFLICT (account_id,area) DO UPDATE
          SET data=COALESCE(club_stores.data,'[]'::jsonb) || EXCLUDED.data,updated_at=NOW()`;
        res.status(201).json({ events }); return;
      }

      const match = body.match || {};
      if (!body.accountId || !DATE_PATTERN.test(match.date || '') || !TIME_PATTERN.test(match.startTime || '') ||
          !MATCH_TYPES.has(match.matchType || '') || typeof match.home !== 'boolean' || (match.matchType !== 'amistoso' && !match.rivalId) || !match.rivalName?.trim() || !match.field?.trim()) {
        res.status(400).json({ error: 'Completa equipo, fecha, hora, rival y campo.' }); return;
      }
      if (match.callupTime && !TIME_PATTERN.test(match.callupTime)) { res.status(400).json({ error: 'Revisa la hora de citación.' }); return }
      if (match.home && !HOME_FIELDS.has(match.field)) { res.status(400).json({ error: 'Selecciona un campo local válido.' }); return }

      if (match.matchType !== 'amistoso') {
        const rivalRows = await sql`SELECT data FROM club_stores WHERE account_id=${body.accountId} AND area='rivals' LIMIT 1`;
        const rivals = Array.isArray(rivalRows[0]?.data) ? rivalRows[0].data as Array<Record<string, unknown>> : [];
        const rival = rivals.find((item) => String(item.id) === match.rivalId);
        if (!rival || String(rival.nombre).trim() !== match.rivalName.trim()) { res.status(400).json({ error: 'Selecciona un rival guardado para este equipo.' }); return }
      }

      const now = new Date().toISOString();
      const event = {
        id: randomUUID(),
        type: 'match',
        date: match.date,
        startTime: match.startTime,
        callupTime: match.callupTime || '',
        callupPlace: String(match.callupPlace || '').trim().slice(0, 80),
        kit: String(match.kit || '').trim().slice(0, 40),
        homeLockerRoom: String(match.homeLockerRoom || '').trim().slice(0, 40),
        awayLockerRoom: String(match.awayLockerRoom || '').trim().slice(0, 40),
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
      const body = jsonBody<{ action?: string; accountId?: string; eventId?: string; changes?: Record<string, unknown>; selections?: Array<{ accountId?: string; eventId?: string }>; exceptionStatus?: string; match?: MatchInput; coordinatorStatus?: string }>(req);
      if (session.role === 'coordinador' && body.action === 'batchTrainingStatus') {
        const selections = Array.isArray(body.selections) ? body.selections.slice(0, 100) : [];
        if (!selections.length || !['scheduled', 'holiday', 'cancelled'].includes(body.exceptionStatus || '') || selections.some((item) => !item.accountId || !item.eventId)) {
          res.status(400).json({ error: 'Selecciona entrenamientos y una acción válida.' }); return;
        }
        let updated = 0;
        for (const selection of selections) {
          const rows = await sql`UPDATE club_stores
            SET data=(SELECT jsonb_agg(CASE WHEN item->>'id'=${selection.eventId!} AND item->>'type'='training' AND item->>'assignedByCoordinator'='true' THEN item || jsonb_build_object('exceptionStatus',${body.exceptionStatus!}::text) ELSE item END) FROM jsonb_array_elements(data) AS item),updated_at=NOW()
            WHERE account_id=${selection.accountId!} AND area='agenda'
              AND EXISTS (SELECT 1 FROM jsonb_array_elements(data) AS item WHERE item->>'id'=${selection.eventId!} AND item->>'type'='training' AND item->>'assignedByCoordinator'='true')
            RETURNING account_id`;
          if (rows[0]) updated += 1;
        }
        res.status(200).json({ ok: true, updated }); return;
      }
      if (session.role === 'coordinador' && body.action === 'updateMatch') {
        if (!body.accountId || !body.eventId) { res.status(400).json({ error: 'Partido no válido.' }); return }
        let changes: Record<string, unknown> = {};
        if (body.match) {
          const match = body.match;
          if (!DATE_PATTERN.test(match.date || '') || !TIME_PATTERN.test(match.startTime || '') || !MATCH_TYPES.has(match.matchType || '') || typeof match.home !== 'boolean' || (match.matchType !== 'amistoso' && !match.rivalId) || !match.rivalName?.trim() || !match.field?.trim()) {
            res.status(400).json({ error: 'Completa fecha, hora, rival y campo.' }); return;
          }
          if (match.callupTime && !TIME_PATTERN.test(match.callupTime)) { res.status(400).json({ error: 'Revisa la hora de citación.' }); return }
          if (match.home && !HOME_FIELDS.has(match.field)) { res.status(400).json({ error: 'Selecciona un campo local válido.' }); return }
          changes = {
            date: match.date, startTime: match.startTime, callupTime: match.callupTime || '', callupPlace: String(match.callupPlace || '').trim().slice(0, 80),
            kit: String(match.kit || '').trim().slice(0, 40), homeLockerRoom: String(match.homeLockerRoom || '').trim().slice(0, 40), awayLockerRoom: String(match.awayLockerRoom || '').trim().slice(0, 40),
            notes: String(match.notes || '').trim().slice(0, 500), playInWhite: match.playInWhite === true, matchType: match.matchType, home: match.home,
            rivalId: match.rivalId, rivalName: match.rivalName.trim().slice(0, 120), field: match.field.trim().slice(0, 160),
          };
        }
        if (body.coordinatorStatus) {
          if (!['scheduled', 'cancelled'].includes(body.coordinatorStatus)) { res.status(400).json({ error: 'Estado de partido no válido.' }); return }
          changes.coordinatorStatus = body.coordinatorStatus;
        }
        if (!Object.keys(changes).length) { res.status(400).json({ error: 'No hay cambios para guardar.' }); return }
        const rows = await sql`UPDATE club_stores
          SET data=(SELECT jsonb_agg(CASE WHEN item->>'id'=${body.eventId} AND item->>'type'='match' AND item->>'assignedByCoordinator'='true' THEN item || ${JSON.stringify(changes)}::jsonb ELSE item END) FROM jsonb_array_elements(data) AS item),updated_at=NOW()
          WHERE account_id=${body.accountId} AND area='agenda'
            AND EXISTS (SELECT 1 FROM jsonb_array_elements(data) AS item WHERE item->>'id'=${body.eventId} AND item->>'type'='match' AND item->>'assignedByCoordinator'='true')
          RETURNING account_id`;
        if (!rows[0]) { res.status(404).json({ error: 'No se encontró el partido.' }); return }
        res.status(200).json({ ok: true }); return;
      }
      if (session.role === 'coordinador' && body.action === 'updateTrainingOccurrence') {
        const changes = body.changes || {};
        const fieldId = String(changes.fieldId || '');
        const zoneIds = Array.isArray(changes.zoneIds) ? changes.zoneIds.map(String) : [];
        const exceptionStatus = String(changes.exceptionStatus || 'scheduled');
        if (!body.accountId || !body.eventId || !TIME_PATTERN.test(String(changes.startTime || '')) || !TIME_PATTERN.test(String(changes.endTime || '')) || String(changes.startTime) >= String(changes.endTime) || !TRAINING_FIELDS[fieldId] || !zoneIds.length || zoneIds.some((zone) => !TRAINING_FIELDS[fieldId].zones.has(zone)) || !['scheduled', 'holiday', 'cancelled'].includes(exceptionStatus)) {
          res.status(400).json({ error: 'Revisa la excepción del entrenamiento.' }); return;
        }
        const updated = {
          startTime: String(changes.startTime), endTime: String(changes.endTime),
          fieldId, fieldName: TRAINING_FIELDS[fieldId].name, zoneIds,
          notes: String(changes.notes || '').trim().slice(0, 500), exceptionStatus,
          recurrenceLabel: 'Excepción para este día',
        };
        const rows = await sql`UPDATE club_stores
          SET data=(SELECT jsonb_agg(CASE WHEN item->>'id'=${body.eventId} AND item->>'type'='training' THEN item || ${JSON.stringify(updated)}::jsonb ELSE item END) FROM jsonb_array_elements(data) AS item),updated_at=NOW()
          WHERE account_id=${body.accountId} AND area='agenda'
            AND EXISTS (SELECT 1 FROM jsonb_array_elements(data) AS item WHERE item->>'id'=${body.eventId} AND item->>'type'='training')
          RETURNING account_id`;
        if (!rows[0]) { res.status(404).json({ error: 'No se encontró el entrenamiento.' }); return }
        res.status(200).json({ ok: true }); return;
      }
      if (session.role !== 'entrenador') { res.status(403).json({ error: 'Solo el entrenador puede confirmar el aviso.' }); return }
      const { eventId } = body;
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
