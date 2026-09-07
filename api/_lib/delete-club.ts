import { ensureEconomySchema } from './economy.js';
import { getSql } from './server.js';

export async function deleteClub(id: string, confirmation: string, sql = getSql()) {
  await ensureEconomySchema(sql);
  // Lock the confirmed club; every delete is scoped to it. Any failure rolls back all changes.
  const results = await sql.transaction([
    sql`SELECT id FROM clubs WHERE id=${id} AND nombre=${confirmation} FOR UPDATE`,
    sql`DELETE FROM economy_campaigns WHERE club_id IN (SELECT id FROM clubs WHERE id=${id} AND nombre=${confirmation})`,
    sql`DELETE FROM economy_settings WHERE scope<>'global' AND scope IN (SELECT id FROM clubs WHERE id=${id} AND nombre=${confirmation})`,
    sql`DELETE FROM club_login_audit WHERE account_id IN (SELECT id FROM club_accounts WHERE club_id IN (SELECT id FROM clubs WHERE id=${id} AND nombre=${confirmation}))`,
    sql`DELETE FROM club_stores WHERE club_id IN (SELECT id FROM clubs WHERE id=${id} AND nombre=${confirmation})`,
    sql`DELETE FROM club_fields WHERE club_id IN (SELECT id FROM clubs WHERE id=${id} AND nombre=${confirmation})`,
    // Account FKs cascade to sessions and push subscriptions.
    sql`DELETE FROM club_accounts WHERE club_id IN (SELECT id FROM clubs WHERE id=${id} AND nombre=${confirmation})`,
    sql`DELETE FROM clubs WHERE id=${id} AND nombre=${confirmation} RETURNING id`,
  ]);
  return results[results.length - 1].length > 0;
}
