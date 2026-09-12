import { matchWeek } from '../../src/matchWeek.js';
import { getSql } from './server.js';

// The conflict predicate is evaluated while PostgreSQL holds the store row lock.
export async function saveScheduledMatch(sql: ReturnType<typeof getSql>, accountId: string, event: Record<string, unknown>, eventId = '') {
  const week = matchWeek(String(event.date));
  if (eventId) {
    const rows = await sql`UPDATE club_stores SET
      data=(SELECT jsonb_agg(CASE WHEN item->>'id'=${eventId} THEN item || ${JSON.stringify(event)}::jsonb ELSE item END) FROM jsonb_array_elements(data) item),updated_at=NOW()
      WHERE account_id=${accountId} AND area='agenda'
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(data) item WHERE item->>'id'=${eventId})
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(data) item WHERE item->>'type'='match' AND item->>'rest'='true' AND item->>'id'<>${eventId} AND item->>'date'>=${week.start} AND item->>'date'<=${week.end}) RETURNING account_id`;
    return rows.length > 0;
  }
  const rows = await sql`INSERT INTO club_stores (account_id,area,data)
    VALUES (${accountId},'agenda',jsonb_build_array(${JSON.stringify(event)}::jsonb))
    ON CONFLICT (account_id,area) DO UPDATE SET
      data=CASE WHEN ${eventId}='' THEN COALESCE(club_stores.data,'[]'::jsonb) || EXCLUDED.data
        ELSE (SELECT jsonb_agg(CASE WHEN item->>'id'=${eventId} THEN item || ${JSON.stringify(event)}::jsonb ELSE item END) FROM jsonb_array_elements(club_stores.data) item) END,
      updated_at=NOW()
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(club_stores.data) item
      WHERE item->>'type'='match' AND item->>'id'<>${eventId}
        AND item->>'date'>=${week.start} AND item->>'date'<=${week.end}
        AND (${event.rest === true} OR item->>'rest'='true'))
    RETURNING account_id`;
  return rows.length > 0;
}
