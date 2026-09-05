const BINDING_CACHE = 'convo-push-binding-v1';
const BINDING_PATH = '/__convo_push_binding';
export interface PushBinding { accountId: string; bindingId: string }

export const pushSupported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const needsHomeScreen = () => (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
  !matchMedia('(display-mode: standalone)').matches && !(navigator as Navigator & { standalone?: boolean }).standalone;

export async function readPushBinding(): Promise<PushBinding | null> {
  if (!('caches' in window)) return null;
  const response = await (await caches.open(BINDING_CACHE)).match(BINDING_PATH);
  return response ? response.json() : null;
}

async function clearPushBinding() {
  if ('caches' in window) await (await caches.open(BINDING_CACHE)).delete(BINDING_PATH);
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    const notifications = await registration?.getNotifications();
    notifications?.forEach((notification) => notification.close());
  }
}

async function pushRequest<T>(method: string, body?: unknown): Promise<T> {
  const response = await fetch('/api/push', { method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudieron configurar los avisos.');
  return data;
}

export async function disablePush() {
  // Clear the local binding first, so already queued messages cannot cross accounts.
  await clearPushBinding();
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  try { await pushRequest('DELETE', { endpoint: subscription.endpoint }) }
  finally { await subscription.unsubscribe() }
}

export async function enablePush(accountId: string) {
  if (!pushSupported()) throw new Error('Este navegador no admite avisos. Prueba con la app instalada en tu móvil.');
  // Must run directly from the user's button press, before network awaits (Safari).
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permite las notificaciones de Convo en los ajustes del móvil.');
  const config = await pushRequest<{ enabled: boolean; publicKey: string; accountId: string }>('GET');
  if (config.accountId !== accountId) throw new Error('La cuenta ha cambiado. Recarga Convo antes de activar los avisos.');
  if (!config.enabled) throw new Error('Los avisos todavía no están disponibles. Inténtalo más tarde.');
  await navigator.serviceWorker.register('/sw.js');
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  const existing = await readPushBinding();
  if (subscription && existing?.accountId !== accountId) {
    await clearPushBinding();
    await subscription.unsubscribe();
    subscription = null;
  }
  const raw = atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/'));
  const applicationServerKey = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  const binding = await pushRequest<PushBinding>('POST', { subscription: subscription.toJSON() });
  if (binding.accountId !== accountId) { await subscription.unsubscribe(); throw new Error('La cuenta ha cambiado. Vuelve a entrar.'); }
  await (await caches.open(BINDING_CACHE)).put(BINDING_PATH, new Response(JSON.stringify(binding), { headers: { 'Content-Type': 'application/json' } }));
}

export async function hasPush(accountId: string) {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const binding = await readPushBinding();
  const registration = await navigator.serviceWorker.getRegistration();
  return binding?.accountId === accountId && Boolean(await registration?.pushManager.getSubscription());
}
