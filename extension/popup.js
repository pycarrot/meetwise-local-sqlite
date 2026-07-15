const byId = (id) => document.getElementById(id);
const startButton = byId('start');
const stopButton = byId('stop');
const loginForm = byId('login-form');
const sessionPanel = byId('session-panel');
const announcement = byId('announcement');
const captureStatus = byId('capture-status');

function announce(text, online = false) {
  announcement.querySelector('span').textContent = text;
  announcement.classList.toggle('online', online);
}
function renderCapture(status) {
  startButton.disabled = status.capturing;
  stopButton.disabled = !status.capturing;
  captureStatus.textContent = status.capturing
    ? `กำลังจับคำบรรยาย · ${status.count} ช่วง`
    : 'พร้อมเริ่มจับคำบรรยาย';
}
function renderQueue(queue) {
  const list = byId('queue');
  list.replaceChildren();
  for (const item of queue.slice().reverse()) {
    const li = document.createElement('li');
    li.textContent = `${item.payload.title} · ${item.state}${item.error ? ` · ${item.error}` : ''}`;
    if (item.state === 'failed') {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'ลองใหม่';
      retry.addEventListener('click', () =>
        chrome.runtime.sendMessage({ type: 'MEETWISE_QUEUE_RETRY', id: item.id }).then(load)
      );
      li.append(retry);
    }
    list.append(li);
  }
  if (!queue.length) {
    const li = document.createElement('li');
    li.textContent = 'ไม่มีรายการค้างส่ง';
    list.append(li);
  }
}
function renderAuth(auth) {
  loginForm.hidden = Boolean(auth);
  sessionPanel.hidden = !auth;
  if (auth) {
    byId('current-user').textContent = `${auth.user.displayName} · ${auth.user.email}`;
    byId('current-workspace').textContent =
      `Workspace: ${auth.workspace.name} (${auth.workspace.role})`;
  }
}
async function load() {
  const state = await chrome.runtime.sendMessage({ type: 'MEETWISE_CONFIG_GET' });
  if (!state.ok) return announce(state.error);
  byId('server-url').value = state.serverUrl;
  byId('server-url').disabled = state.managed;
  byId('save-server').disabled = state.managed;
  renderAuth(state.auth);
  renderQueue(state.queue);
  const health = await chrome.runtime.sendMessage({ type: 'MEETWISE_HEALTH' });
  announce(health.ok ? 'เชื่อมต่อ server แล้ว' : health.error, health.ok);
}
byId('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await chrome.runtime.sendMessage({
    type: 'MEETWISE_CONFIG_SAVE',
    serverUrl: byId('server-url').value
  });
  announce(result.ok ? 'บันทึก Server URL แล้ว' : result.error, result.ok);
  if (result.ok) await load();
});
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  announce('กำลังเข้าสู่ระบบ…');
  const result = await chrome.runtime.sendMessage({
    type: 'MEETWISE_LOGIN',
    credentials: { email: byId('email').value, password: byId('password').value }
  });
  byId('password').value = '';
  announce(result.ok ? 'เข้าสู่ระบบแล้ว' : result.error, result.ok);
  if (result.ok) await load();
});
byId('logout').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'MEETWISE_LOGOUT' });
  await load();
});
byId('dashboard').addEventListener('click', () =>
  chrome.runtime.sendMessage({ type: 'MEETWISE_OPEN_DASHBOARD' })
);
byId('clear-data').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'MEETWISE_CLEAR_LOCAL_DATA' });
  await load();
});

async function activeMeetTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('https://meet.google.com/'))
    throw new Error('กรุณาเปิดแท็บ Google Meet');
  return tab;
}
async function sendToMeet(type) {
  try {
    const tab = await activeMeetTab();
    const result = await chrome.tabs.sendMessage(tab.id, { type });
    if (!result?.ok) throw new Error(result?.error || 'ส่วนขยายไม่ตอบกลับ');
    if (result.status) renderCapture(result.status);
    else await load();
  } catch (error) {
    captureStatus.textContent = error.message;
  }
}
startButton.addEventListener('click', () => sendToMeet('MEETWISE_START'));
stopButton.addEventListener('click', () => sendToMeet('MEETWISE_STOP'));
activeMeetTab()
  .then((tab) => chrome.tabs.sendMessage(tab.id, { type: 'MEETWISE_STATUS' }))
  .then((r) => renderCapture(r.status))
  .catch(() => renderCapture({ capturing: false, count: 0 }));
void load();
