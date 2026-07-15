const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function normalizeServerUrl(input, production = true) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('กรุณาระบุ Server URL');
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Server URL ไม่ถูกต้อง');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Server URL ต้องใช้ HTTPS');
  if (url.username || url.password) throw new Error('Server URL ต้องไม่มี username หรือ password');
  if (url.search || url.hash) throw new Error('Server URL ต้องไม่มี query หรือ fragment');
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('Server URL ต้องไม่มี path');
  if (url.protocol !== 'https:' && (production || !LOCAL_HOSTS.has(url.hostname))) {
    throw new Error('อนุญาต HTTP เฉพาะ localhost ใน development build');
  }
  return url.origin;
}

export function retryDelayMs(attempt) {
  return Math.min(15 * 60_000, 2_000 * 2 ** Math.max(0, attempt - 1));
}

export function createQueueItem(payload, id = crypto.randomUUID()) {
  return {
    id,
    idempotencyKey: id.replaceAll('-', ''),
    payload,
    attempts: 0,
    state: 'queued',
    createdAt: Date.now(),
    nextAttemptAt: Date.now(),
    error: null
  };
}
