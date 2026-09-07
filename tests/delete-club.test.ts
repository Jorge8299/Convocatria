import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { deleteClub } from '../api/_lib/delete-club.ts';

test('permanent deletion confirms the name, isolates clubs and rolls back on failure', async () => {
  const db = new PGlite();
  const client = (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    return { query, values, then: (resolve: any, reject: any) => db.query(query, values).then(result => result.rows).then(resolve, reject) };
  };
  const sql = Object.assign(client, {
    transaction: (queries: ReturnType<typeof client>[]) => db.transaction(async tx => {
      const results = [];
      for (const query of queries) results.push((await tx.query(query.query, query.values)).rows);
      return results;
    }),
  }) as unknown as NonNullable<Parameters<typeof deleteClub>[2]>;
  try {
    await db.exec(`
      CREATE TABLE clubs(id TEXT PRIMARY KEY, nombre TEXT);
      CREATE TABLE club_accounts(id TEXT PRIMARY KEY, club_id TEXT REFERENCES clubs(id));
      CREATE TABLE club_stores(account_id TEXT REFERENCES club_accounts(id), club_id TEXT REFERENCES clubs(id));
      CREATE TABLE club_fields(club_id TEXT REFERENCES clubs(id));
      CREATE TABLE club_login_audit(account_id TEXT REFERENCES club_accounts(id));
      CREATE TABLE club_sessions(account_id TEXT REFERENCES club_accounts(id) ON DELETE CASCADE);
      CREATE TABLE club_push_subscriptions(account_id TEXT REFERENCES club_accounts(id) ON DELETE CASCADE);
      INSERT INTO clubs VALUES('one','One'),('two','Two');
      INSERT INTO club_accounts VALUES('a','one'),('b','two');
      INSERT INTO club_stores VALUES('a','one'),('b','two');
      INSERT INTO club_fields VALUES('one'),('two');
      INSERT INTO club_login_audit VALUES('a'),('b');
      INSERT INTO club_sessions VALUES('a'),('b');
      INSERT INTO club_push_subscriptions VALUES('a'),('b');
    `);
    assert.equal(await deleteClub('one', 'Wrong name', sql), false);
    await db.exec(`
      INSERT INTO economy_settings(scope,rate) VALUES('global',100),('one',200),('two',300);
      INSERT INTO economy_campaigns(id,club_id,name,total_cents,installments,fee_bps)
        VALUES('c1','one','First',100,'[]',200),('c2','two','Second',100,'[]',300);
      CREATE TABLE deletion_blocker(club_id TEXT REFERENCES clubs(id));
      INSERT INTO deletion_blocker VALUES('one');
    `);
    await assert.rejects(deleteClub('one', 'One', sql), /foreign key/);
    for (const table of ['clubs', 'club_accounts', 'club_stores', 'club_fields', 'club_login_audit', 'club_sessions', 'club_push_subscriptions', 'economy_campaigns']) {
      assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length, 2, `${table} must survive rollback`);
    }
    await db.exec('DROP TABLE deletion_blocker');
    assert.equal(await deleteClub('one', 'One', sql), true);
    for (const table of ['clubs', 'club_accounts', 'club_stores', 'club_fields', 'club_login_audit', 'club_sessions', 'club_push_subscriptions', 'economy_campaigns']) {
      assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length, 1, `${table} must preserve the other club`);
    }
    assert.deepEqual((await db.query('SELECT scope FROM economy_settings ORDER BY scope')).rows, [{scope:'global'}, {scope:'two'}]);
    assert.equal(await deleteClub('one', 'One', sql), false);
  } finally {
    await db.close();
  }
});
