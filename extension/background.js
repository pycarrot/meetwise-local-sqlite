import { BUILD_MODE, DEFAULT_SERVER_URL } from './config.js';
import { createQueueItem, normalizeServerUrl, retryDelayMs } from './lib.js';

const AUTH_KEY = 'meetwiseAuthV1';
const CONFIG_KEY = 'meetwiseConfigV1';
const QUEUE_KEY = 'meetwiseUploadQueueV1';
const CAPTURE_KEY = 'meetwiseCaptureCheckpointV1';
const MAX_QUEUE_ITEMS = 20;
const MAX_QUEUE_BYTES = 20 * 1024 * 1024;
let refreshPromise;
let processing = false;

async function readManagedServerUrl() {
  try {
    return (await chrome.storage.managed.get('serverUrl')).serverUrl;
  } catch {
    return undefined;
  }
}

async function getServerUrl() {
  const managed = await readManagedServerUrl();
  const local = (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY]?.serverUrl;
  return normalizeServerUrl(managed || local || DEFAULT_SERVER_URL, BUILD_MODE === 'production');
}

async function saveServerUrl(value) {
  if (await readManagedServerUrl()) throw new Error('Server URL ถูกกำหนดโดยผู้ดูแลระบบ');
  const serverUrl = normalizeServerUrl(value, BUILD_MODE === 'production');
  const allowed = await chrome.permissions.contains({ origins: [`${serverUrl}/*`] });
  if (!allowed)
    throw new Error(
      'Extension package นี้ไม่ได้รับสิทธิ์สำหรับ server ดังกล่าว กรุณา build ใหม่ด้วย URL นี้'
    );
  await chrome.storage.local.set({ [CONFIG_KEY]: { serverUrl } });
  return serverUrl;
}

async function getAuth() {
  return (await chrome.storage.local.get(AUTH_KEY))[AUTH_KEY] || null;
}
async function setAuth(auth) {
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
}

async function publicRequest(path, init = {}) {
  const response = await fetch(`${await getServerUrl()}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) }
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
  return data;
}

async function refreshAuth() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const auth = await getAuth();
    if (!auth?.refreshToken) throw new Error('กรุณา login ใหม่');
    try {
      const next = await publicRequest('/api/v1/extension/sessions/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: auth.refreshToken, workspaceId: auth.workspace?.id })
      });
      const updated = {
        ...auth,
        ...next,
        workspace: { ...auth.workspace, id: next.workspaceId || auth.workspace.id }
      };
      await setAuth(updated);
      return updated;
    } catch (error) {
      await chrome.storage.local.remove(AUTH_KEY);
      throw error;
    }
  })().finally(() => {
    refreshPromise = undefined;
  });
  return refreshPromise;
}

async function authenticatedRequest(path, init = {}, retry = true) {
  const auth = await getAuth();
  if (!auth?.accessToken) throw new Error('กรุณา login ก่อนส่งข้อมูล');
  const response = await fetch(`${await getServerUrl()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${auth.accessToken}`,
      ...(init.headers || {})
    }
  });
  if (response.status === 401 && retry) {
    await refreshAuth();
    return authenticatedRequest(path, init, false);
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
  return data;
}

async function readQueue() {
  return (await chrome.storage.local.get(QUEUE_KEY))[QUEUE_KEY] || [];
}
async function writeQueue(queue) {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

async function enqueue(payload) {
  const queue = await readQueue();
  const bytes = new TextEncoder().encode(JSON.stringify(queue.map((item) => item.payload))).length;
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (queue.length >= MAX_QUEUE_ITEMS || bytes + payloadBytes > MAX_QUEUE_BYTES) {
    throw new Error('คิวอัปโหลดเต็ม กรุณา retry หรือลบรายการเก่าก่อน');
  }
  const item = createQueueItem(payload);
  queue.push(item);
  await writeQueue(queue);
  void processQueue();
  return item;
}

async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    const queue = await readQueue();
    const item = queue.find(
      (entry) => entry.state !== 'uploaded' && entry.nextAttemptAt <= Date.now()
    );
    if (!item) return;
    item.state = 'uploading';
    await writeQueue(queue);
    try {
      const result = await authenticatedRequest('/api/v1/meetings/ingest', {
        method: 'POST',
        headers: { 'idempotency-key': item.idempotencyKey },
        body: JSON.stringify(item.payload)
      });
      item.state = 'uploaded';
      item.error = null;
      item.meetingId = result.meeting.id;
      item.uploadedAt = Date.now();
    } catch (error) {
      item.attempts += 1;
      item.state = 'failed';
      item.error = error.message.slice(0, 300);
      item.nextAttemptAt = Date.now() + retryDelayMs(item.attempts);
      chrome.alarms.create('meetwise-upload-retry', { when: item.nextAttemptAt });
    }
    await writeQueue(queue);
  } finally {
    processing = false;
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'meetwise-upload-retry') void processQueue();
});
chrome.runtime.onStartup.addListener(() => void processQueue());
chrome.runtime.onInstalled.addListener(() => void processQueue());

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === 'MEETWISE_CONFIG_GET')
      return {
        ok: true,
        serverUrl: await getServerUrl(),
        managed: Boolean(await readManagedServerUrl()),
        auth: await getAuth(),
        queue: await readQueue()
      };
    if (message.type === 'MEETWISE_CONFIG_SAVE')
      return { ok: true, serverUrl: await saveServerUrl(message.serverUrl) };
    if (message.type === 'MEETWISE_LOGIN') {
      const data = await publicRequest('/api/v1/extension/sessions', {
        method: 'POST',
        body: JSON.stringify(message.credentials)
      });
      await setAuth(data);
      return { ok: true, auth: data };
    }
    if (message.type === 'MEETWISE_LOGOUT') {
      try {
        await authenticatedRequest('/api/v1/extension/sessions/current', { method: 'DELETE' });
      } catch {
        /* local revocation still happens */
      }
      await chrome.storage.local.remove(AUTH_KEY);
      return { ok: true };
    }
    if (message.type === 'MEETWISE_IMPORT')
      return { ok: true, queued: await enqueue(message.payload) };
    if (message.type === 'MEETWISE_QUEUE_RETRY') {
      const queue = await readQueue();
      const item = queue.find((entry) => entry.id === message.id);
      if (item) {
        item.nextAttemptAt = Date.now();
        item.state = 'queued';
        item.error = null;
        await writeQueue(queue);
        void processQueue();
      }
      return { ok: true };
    }
    if (message.type === 'MEETWISE_CLEAR_LOCAL_DATA') {
      await chrome.storage.local.remove([QUEUE_KEY, CAPTURE_KEY]);
      return { ok: true };
    }
    if (message.type === 'MEETWISE_CAPTURE_CHECKPOINT') {
      await chrome.storage.local.set({ [CAPTURE_KEY]: message.state });
      return { ok: true };
    }
    if (message.type === 'MEETWISE_CAPTURE_RESTORE')
      return {
        ok: true,
        state: (await chrome.storage.local.get(CAPTURE_KEY))[CAPTURE_KEY] || null
      };
    if (message.type === 'MEETWISE_HEALTH')
      return { ok: true, health: await publicRequest('/api/v1/health') };
    if (message.type === 'MEETWISE_OPEN_DASHBOARD') {
      await chrome.tabs.create({ url: await getServerUrl() });
      return { ok: true };
    }
    throw new Error('Unknown extension message');
  })()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
