import { randomUUID } from 'node:crypto';
import webpush from 'web-push';
import { getSql } from './server.js';

export interface DeviceSubscription { endpoint: string; keys: { p256dh: string; auth: string } }

// Only browser push services are accepted: never turn subscription registration into an SSRF proxy.
export function validSubscription(value: unknown): value is DeviceSubscription {
  if (!value || typeof value !== 'object') return false;
  const sub = value as DeviceSubscription;
  try {
    const url = new URL(sub.endpoint);
    const trusted = url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com' ||
      url.hostname.endsWith('.push.services.mozilla.com') || url.hostname === 'web.push.apple.com' ||
      url.hostname.endsWith('.notify.windows.com');
    return trusted && url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash &&
      sub.endpoint.length <= 2048 && /^[\w-]+={0,2}$/.test(sub.keys?.p256dh || '') &&
      Buffer.from(sub.keys.p256dh, 'base64url').length === 65 &&
      /^[\w-]+={0,2}$/.test(sub.keys?.auth || '') && Buffer.from(sub.keys.auth, 'base64url').length === 16;
  } catch { return false }
}

export function pushConfig() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export async function ensurePushSchema(sql = getSql()) {
  await sql`CREATE TABLE IF NOT EXISTS club_push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES club_accounts(id) ON DELETE CASCADE,
    session_token_hash TEXT NOT NULL REFERENCES club_sessions(token_hash) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    binding_id TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}

export async function registerDevice(accountId: string, sessionHash: string, subscription: DeviceSubscription, sql = getSql()) {
  const bindingId = randomUUID();
  await sql`INSERT INTO club_push_subscriptions (endpoint,account_id,session_token_hash,subscription,binding_id)
    VALUES (${subscription.endpoint},${accountId},${sessionHash},${JSON.stringify(subscription)}::jsonb,${bindingId})
    ON CONFLICT (endpoint) DO UPDATE SET account_id=EXCLUDED.account_id,
      session_token_hash=EXCLUDED.session_token_hash,subscription=EXCLUDED.subscription,
      binding_id=EXCLUDED.binding_id,updated_at=NOW()`;
  return bindingId;
}

export interface MatchNotice { id: string; date: string; startTime: string; rivalName: string }
export function matchNotice(accountId: string, coordinator: string, match: MatchNotice, kind: 'created' | 'updated' | 'cancelled' = 'created') {
  const action = kind === 'created' ? 'te ha asignado un partido' : kind === 'cancelled' ? 'ha cancelado tu partido' : 'ha actualizado tu partido';
  return {
    title: kind === 'created' ? 'CONVO · Nuevo partido' : kind === 'cancelled' ? 'CONVO · Partido cancelado' : 'CONVO · Partido actualizado',
    body: `${coordinator} ${action}. ${match.rivalName} · ${match.date.split('-').reverse().join('/')} · ${match.startTime}`,
    accountId, eventId: match.id,
    url: `/?agendaEvent=${encodeURIComponent(match.id)}&agendaAccount=${encodeURIComponent(accountId)}`,
    tag: `match-${match.id}`,
  };
}

export async function notifyMatch(accountId: string, coordinator: string, match: MatchNotice, kind: 'created' | 'updated' | 'cancelled' = 'created', dependencies = { sql: getSql, send: webpush.sendNotification }) {
  // Saving the match must succeed even if the push provider is temporarily unavailable.
  const config = pushConfig();
  if (!config) return;
  try {
    const sql = dependencies.sql();
    await ensurePushSchema(sql);
    const devices = await sql`SELECT p.endpoint,p.subscription,p.binding_id FROM club_push_subscriptions p
      JOIN club_accounts a ON a.id=p.account_id
      JOIN club_sessions s ON s.token_hash=p.session_token_hash AND s.account_id=p.account_id
      WHERE p.account_id=${accountId} AND a.active=TRUE AND a.role='entrenador'
        AND s.expires_at>NOW() AND s.impersonator_account_id IS NULL`;
    await Promise.all(devices.map(async (device) => {
      const subscription = device.subscription as DeviceSubscription;
      if (!validSubscription(subscription)) return;
      try {
        await dependencies.send(subscription, JSON.stringify({ ...matchNotice(accountId, coordinator, match, kind), bindingId: device.binding_id }), {
          vapidDetails: config, TTL: 3600, urgency: 'normal', timeout: 5000,
        });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await sql`DELETE FROM club_push_subscriptions WHERE endpoint=${String(device.endpoint)} AND binding_id=${String(device.binding_id)}`;
        } else console.warn('push_delivery_failed', { status: status || 'network' });
      }
    }));
  } catch { console.warn('push_delivery_unavailable') }
}
