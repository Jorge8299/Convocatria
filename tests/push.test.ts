import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { ensurePushSchema, registerDevice, notifyMatch, validSubscription, type DeviceSubscription } from '../api/_lib/push.ts';

const subscription = (id: string): DeviceSubscription => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, keys: {
  p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url'),
} });
const match = { id: 'match-benjamin', date: '2026-09-12', startTime: '10:00', rivalName: 'Gandía' };

test('rejects arbitrary URLs, invalid keys and push-host lookalikes', () => {
  assert.equal(validSubscription(subscription('valid')), true);
  for (const endpoint of ['http://fcm.googleapis.com/send/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://fcm.googleapis.com.evil.com/a', 'https://fcm.googleapis.com:9999/a', 'https://name:pass@fcm.googleapis.com/a']) {
    assert.equal(validSubscription({ ...subscription('a'), endpoint }), false, endpoint);
  }
  assert.equal(validSubscription({ ...subscription('a'), keys: { auth: 'a', p256dh: 'b' } }), false);
});

test('real PostgreSQL: account isolation, multiple devices, expiry, logout, reassignment and invalid endpoints', async () => {
  const db = new PGlite();
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((result, part, index) => result + (index ? `$${index}` : '') + part, '');
    return (await db.query(query, values)).rows;
  }) as unknown as Parameters<typeof ensurePushSchema>[0];
  try {
    await db.exec(`CREATE TABLE club_accounts (id TEXT PRIMARY KEY, role TEXT, active BOOLEAN);
      CREATE TABLE club_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT REFERENCES club_accounts(id), expires_at TIMESTAMPTZ, impersonator_account_id TEXT);
      INSERT INTO club_accounts VALUES ('benjamin','entrenador',TRUE),('alevin','entrenador',TRUE),('inactive','entrenador',FALSE),('coord','coordinador',TRUE);
      INSERT INTO club_sessions VALUES ('b','benjamin',NOW()+INTERVAL '1 day',NULL),('b2','benjamin',NOW()+INTERVAL '1 day',NULL),
      ('a','alevin',NOW()+INTERVAL '1 day',NULL),('expired','benjamin',NOW()-INTERVAL '1 day',NULL),
      ('impersonated','benjamin',NOW()+INTERVAL '1 day','superadmin'),('i','inactive',NOW()+INTERVAL '1 day',NULL),('c','coord',NOW()+INTERVAL '1 day',NULL);`);
    await ensurePushSchema(sql);
    await ensurePushSchema(sql); // Repeated cold-start migration is safe.
    await registerDevice('benjamin', 'b', subscription('b-phone'), sql);
    await registerDevice('benjamin', 'b2', subscription('b-tablet'), sql);
    await registerDevice('alevin', 'a', subscription('a-phone'), sql);
    await registerDevice('benjamin', 'expired', subscription('expired'), sql);
    await registerDevice('benjamin', 'impersonated', subscription('impersonated'), sql);
    await registerDevice('inactive', 'i', subscription('inactive'), sql);
    await registerDevice('coord', 'c', subscription('coord'), sql);
    const sent: Array<{ endpoint: string; payload: Record<string, string> }> = [];
    const deps = { sql: () => sql, send: (async (sub: DeviceSubscription, payload: string) => { sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); return {} }) as any };
    process.env.WEB_PUSH_PUBLIC_KEY = 'test'; process.env.WEB_PUSH_PRIVATE_KEY = 'test'; process.env.WEB_PUSH_SUBJECT = 'https://convo.example';
    await notifyMatch('benjamin', 'Enric', match, 'created', deps);
    assert.deepEqual(sent.map((item) => item.endpoint).sort(), [subscription('b-phone').endpoint, subscription('b-tablet').endpoint].sort());
    assert.ok(sent.every((item) => item.payload.accountId === 'benjamin' && item.payload.body.includes('Enric te ha asignado')));
    assert.equal(new URL(sent[0].payload.url, 'https://convo.example').searchParams.get('agendaEvent'), match.id);
    sent.length = 0;
    await notifyMatch('inactive', 'Enric', match, 'created', deps);
    await notifyMatch('coord', 'Enric', match, 'created', deps);
    assert.equal(sent.length, 0);
    // Switching the same browser to another coach replaces, rather than duplicates, its owner.
    await registerDevice('alevin', 'a', subscription('b-phone'), sql);
    await notifyMatch('benjamin', 'Enric', match, 'created', deps);
    assert.deepEqual(sent.map((item) => item.endpoint), [subscription('b-tablet').endpoint]);
    sent.length = 0;
    await db.exec("DELETE FROM club_sessions WHERE token_hash='b2'");
    await notifyMatch('benjamin', 'Enric', match, 'created', deps);
    assert.equal(sent.length, 0);
    assert.equal((await db.query("SELECT * FROM club_push_subscriptions WHERE session_token_hash='b2'")).rows.length, 0);
    await notifyMatch('alevin', 'Enric', match, 'created', { sql: () => sql, send: (async () => { throw { statusCode: 410 } }) as any });
    assert.equal((await db.query("SELECT * FROM club_push_subscriptions WHERE account_id='alevin'")).rows.length, 0);
    await registerDevice('alevin', 'a', subscription('retry'), sql);
    await notifyMatch('alevin', 'Enric', match, 'created', { sql: () => sql, send: (async () => { throw { statusCode: 503 } }) as any });
    assert.equal((await db.query("SELECT * FROM club_push_subscriptions WHERE account_id='alevin'")).rows.length, 1);
  } finally { await db.close(); delete process.env.WEB_PUSH_PUBLIC_KEY; delete process.env.WEB_PUSH_PRIVATE_KEY; delete process.env.WEB_PUSH_SUBJECT }
});

test('service worker suppresses another coach and old-session pushes; opens only the bound match', async () => {
  const handlers: Record<string, Function> = {};
  let binding: { accountId: string; bindingId: string } | null = { accountId: 'benjamin', bindingId: 'current' };
  const displayed: any[] = [], opened: string[] = [];
  let serverAccount = 'benjamin';
  const context = vm.createContext({ URL,
    caches: { open: async () => ({ match: async () => binding ? { json: async () => binding } : null }) },
    fetch: async () => ({ ok: true, json: async () => ({ accountId: serverAccount }) }),
    self: { addEventListener: (name: string, handler: Function) => { handlers[name] = handler }, location: { origin: 'https://convo.example' },
      registration: { showNotification: async (title: string, options: unknown) => { displayed.push({ title, options }) } },
      clients: { matchAll: async () => [], openWindow: async (url: string) => { opened.push(url) } } },
  });
  vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  const dispatch = async (name: string, event: object) => { let promise; handlers[name]({ ...event, waitUntil: (value: Promise<unknown>) => { promise = value } }); await promise };
  const payload = { accountId: 'benjamin', bindingId: 'current', title: 'Nuevo partido', body: 'Enric te ha asignado un partido', url: '/?agendaEvent=match-benjamin&agendaAccount=benjamin' };
  await dispatch('push', { data: { json: () => ({ ...payload, accountId: 'alevin' }) } });
  await dispatch('push', { data: { json: () => ({ ...payload, bindingId: 'old' }) } });
  assert.equal(displayed.length, 0);
  await dispatch('push', { data: { json: () => payload } });
  assert.equal(displayed.length, 1);
  await dispatch('notificationclick', { notification: { data: displayed[0].options.data, close() {} } });
  assert.equal(new URL(opened[0]).searchParams.get('agendaEvent'), 'match-benjamin');
  serverAccount = 'alevin';
  await dispatch('push', { data: { json: () => payload } });
  assert.equal(displayed.length, 1);
  binding = null;
  await dispatch('push', { data: { json: () => payload } });
  await dispatch('notificationclick', { notification: { data: displayed[0].options.data, close() {} } });
  assert.equal(displayed.length, 1); assert.equal(opened.length, 1);
});
