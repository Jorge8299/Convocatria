import { getSql } from './server.js';
import { prepareBoard, type TacticalBoard } from '../../src/tactical/model.js';

export async function saveLegacyBoards(accountId: string, data: unknown, sql = getSql()) {
  const legacy = data && typeof data === 'object' && !Array.isArray(data) ? { ...data as Record<string, unknown> } : {};
  delete legacy.tacticalById;
  await sql`INSERT INTO club_stores (account_id,area,data) VALUES (${accountId},'boards',${JSON.stringify(legacy)}::jsonb)
    ON CONFLICT (account_id,area) DO UPDATE SET data=EXCLUDED.data || jsonb_build_object('tacticalById',COALESCE(club_stores.data->'tacticalById','{}'::jsonb)),updated_at=NOW()`;
}

export async function saveTacticalBoard(accountId: string, author: string, input: TacticalBoard, sql = getSql()) {
  const board = { ...prepareBoard(input), ownerAccountId: accountId, author, revision: input.revision + 1 };
  const document = JSON.stringify({ [board.id]: board });
  const rows = await sql`INSERT INTO club_stores (account_id,area,data)
    SELECT ${accountId},'boards',jsonb_build_object('tacticalById',${document}::jsonb) WHERE ${input.revision}=0
    ON CONFLICT (account_id,area) DO UPDATE SET
      data=COALESCE(club_stores.data,'{}'::jsonb) || jsonb_build_object('tacticalById',COALESCE(club_stores.data->'tacticalById','{}'::jsonb) || ${document}::jsonb),updated_at=NOW()
    WHERE COALESCE((club_stores.data->'tacticalById'->${board.id}->>'revision')::int,0)=${input.revision}
    RETURNING account_id`;
  // For existing documents the INSERT SELECT must also execute with a nonzero revision.
  if (!rows.length && input.revision > 0) {
    const updated = await sql`UPDATE club_stores SET
      data=data || jsonb_build_object('tacticalById',COALESCE(data->'tacticalById','{}'::jsonb) || ${document}::jsonb),updated_at=NOW()
      WHERE account_id=${accountId} AND area='boards' AND (data->'tacticalById'->${board.id}->>'revision')::int=${input.revision}
      RETURNING account_id`;
    return updated.length ? board : null;
  }
  return rows.length ? board : null;
}
