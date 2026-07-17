const byId = (id) => document.getElementById(id);
const captureToggle = byId('capture-toggle');
const loginForm = byId('login-form');
const sessionPanel = byId('session-panel');
const announcement = byId('announcement');
const captureCard = byId('capture-card');
const captureTitle = byId('capture-title');
const captureStatus = byId('capture-status');
let captureState = { capturing: false, count: 0 };
let elapsedTimer;

function confirmAction(message, confirmLabel) {
  const dialog = byId('confirm-dialog');
  byId('confirm-message').textContent = message;
  byId('confirm-submit').textContent = confirmLabel;
  dialog.showModal();
  return new Promise((resolve) => {
    const cancel = () => finish(false);
    const confirm = () => finish(true);
    const finish = (result) => {
      byId('confirm-cancel').removeEventListener('click', cancel);
      byId('confirm-submit').removeEventListener('click', confirm);
      dialog.removeEventListener('cancel', cancel);
      if (dialog.open) dialog.close();
      resolve(result);
    };
    byId('confirm-cancel').addEventListener('click', cancel);
    byId('confirm-submit').addEventListener('click', confirm);
    dialog.addEventListener('cancel', cancel);
  });
}

function elapsedLabel(startedAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function announce(text, online = false) {
  announcement.querySelector('span').textContent = text;
  announcement.classList.toggle('online', online);
}

function renderCapture(status) {
  captureState = status;
  captureCard.classList.toggle('is-capturing', status.capturing);
  captureTitle.textContent = status.capturing
    ? 'กำลังบันทึกคำบรรยาย'
    : status.canRetry
      ? 'ยังส่งคำบรรยายไม่สำเร็จ'
      : 'พร้อมบันทึกคำบรรยาย';
  captureStatus.textContent = status.capturing
    ? `บันทึกแล้ว ${status.count} ช่วง · ${elapsedLabel(status.startedAt || Date.now())}`
    : status.canRetry
      ? 'ลองส่งอีกครั้งได้โดยข้อมูลที่บันทึกไว้ยังอยู่ครบ'
      : 'เปิดคำบรรยายใน Google Meet แล้วเริ่มบันทึก';
  captureToggle.textContent = status.capturing
    ? 'หยุดและส่ง'
    : status.canRetry
      ? 'ลองส่งอีกครั้ง'
      : 'เริ่มบันทึก';
}

function renderQueue(queue) {
  const list = byId('queue');
  const pending = queue.filter((item) => item.state !== 'uploaded').length;
  const uploaded = queue.length - pending;
  byId('queue-summary').textContent = pending
    ? `ต้องจัดการ ${pending} รายการ${uploaded ? ` · ส่งสำเร็จ ${uploaded}` : ''}`
    : uploaded
      ? `ส่งสำเร็จ ${uploaded} รายการ`
      : 'ไม่มีรายการค้างส่ง';
  list.replaceChildren();
  list.hidden = !queue.length;
  const stateLabels = {
    queued: 'รอส่ง',
    uploading: 'กำลังส่ง',
    failed: 'ส่งไม่สำเร็จ',
    uploaded: 'ส่งสำเร็จ'
  };
  for (const item of queue.slice().reverse()) {
    const li = document.createElement('li');
    li.className = `queue-item ${item.state}`;
    const title = document.createElement('strong');
    title.textContent = item.payload.title;
    const status = document.createElement('span');
    status.textContent = stateLabels[item.state] || item.state;
    li.append(title, status);
    if (item.error) {
      const error = document.createElement('small');
      error.textContent = `${item.error}${item.errorCode ? ` (${item.errorCode})` : ''}${item.requestId ? ` · รหัส ${item.requestId}` : ''}`;
      li.append(error);
    }
    if (item.state === 'failed') {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'ลองส่งอีกครั้ง';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        retry.textContent = 'กำลังส่ง…';
        try {
          const result = await chrome.runtime.sendMessage({
            type: 'MEETWISE_QUEUE_RETRY',
            id: item.id
          });
          if (!result?.ok) throw new Error(result?.error || 'ลองส่งอีกครั้งไม่สำเร็จ');
          await load();
        } catch (error) {
          byId('queue-summary').textContent = error.message;
        } finally {
          retry.disabled = false;
          retry.textContent = 'ลองส่งอีกครั้ง';
        }
      });
      li.append(retry);
    }
    if (item.state === 'failed' || item.state === 'queued') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'ลบรายการ';
      remove.addEventListener('click', async () => {
        if (
          !(await confirmAction(
            `ลบ “${item.payload.title}” ออกจากคิวหรือไม่? ข้อมูลคำบรรยายในเครื่องจะหายและกู้คืนไม่ได้`,
            'ลบรายการจากคิว'
          ))
        )
          return;
        remove.disabled = true;
        try {
          const result = await chrome.runtime.sendMessage({
            type: 'MEETWISE_QUEUE_REMOVE',
            id: item.id
          });
          if (!result?.ok) throw new Error(result?.error || 'ลบรายการไม่สำเร็จ');
          await load();
        } catch (error) {
          byId('queue-summary').textContent = error.message;
          remove.disabled = false;
        }
      });
      li.append(remove);
    }
    list.append(li);
  }
}

function renderAuth(auth) {
  const authenticated = Boolean(auth);
  loginForm.hidden = authenticated;
  sessionPanel.hidden = !authenticated;
  byId('identity').hidden = !authenticated;
  byId('logout').hidden = !authenticated;
  byId('clear-data').hidden = !authenticated;
  byId('settings-label').textContent = authenticated ? 'การตั้งค่า' : 'ตั้งค่า Server';
  if (auth) {
    byId('current-user').textContent = auth.user.displayName;
    byId('current-workspace').textContent = `${auth.workspace.name} · ${auth.workspace.role}`;
    byId('user-avatar').textContent = auth.user.displayName.trim().charAt(0).toUpperCase() || 'M';
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
  announce(health.ok ? 'เชื่อมต่อแล้ว' : health.error, health.ok);
}

byId('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = byId('save-server');
  button.disabled = true;
  button.textContent = 'กำลังบันทึก…';
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'MEETWISE_CONFIG_SAVE',
      serverUrl: byId('server-url').value
    });
    if (!result?.ok) throw new Error(result?.error || 'บันทึก Server URL ไม่สำเร็จ');
    await load();
    announce('บันทึก Server URL แล้ว', true);
  } catch (error) {
    announce(error.message);
  } finally {
    button.disabled = byId('server-url').disabled;
    button.textContent = 'บันทึก Server URL';
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'กำลังเข้าสู่ระบบ…';
  announce('กำลังเข้าสู่ระบบ…');
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'MEETWISE_LOGIN',
      credentials: { email: byId('email').value, password: byId('password').value }
    });
    if (!result?.ok) throw new Error(result?.error || 'เข้าสู่ระบบไม่สำเร็จ');
    await load();
    announce('เข้าสู่ระบบแล้ว', true);
  } catch (error) {
    announce(error.message);
  } finally {
    byId('password').value = '';
    button.disabled = false;
    button.textContent = 'เข้าสู่ระบบ';
  }
});

byId('logout').addEventListener('click', async () => {
  const button = byId('logout');
  button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'MEETWISE_LOGOUT' });
    if (!result?.ok) throw new Error(result?.error || 'ออกจากระบบไม่สำเร็จ');
    byId('settings').open = false;
    await load();
  } catch (error) {
    announce(error.message);
  } finally {
    button.disabled = false;
  }
});

byId('dashboard').addEventListener('click', async () => {
  const button = byId('dashboard');
  button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'MEETWISE_OPEN_DASHBOARD' });
    if (!result?.ok) throw new Error(result?.error || 'เปิดแดชบอร์ดไม่สำเร็จ');
  } catch (error) {
    announce(error.message);
  } finally {
    button.disabled = false;
  }
});

byId('clear-data').addEventListener('click', async () => {
  if (
    !(await confirmAction(
      'ลบข้อมูลคำบรรยายและคิวอัปโหลดใน Extension หรือไม่? ข้อมูลนี้อยู่ในเครื่องและกู้คืนไม่ได้',
      'ล้างข้อมูลในเครื่อง'
    ))
  )
    return;
  const button = byId('clear-data');
  button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'MEETWISE_CLEAR_LOCAL_DATA' });
    if (!result?.ok) throw new Error(result?.error || 'ลบข้อมูลใน Extension ไม่สำเร็จ');
    await load();
  } catch (error) {
    announce(error.message);
  } finally {
    button.disabled = false;
  }
});

async function activeMeetTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('https://meet.google.com/'))
    throw new Error('กรุณาเปิดแท็บ Google Meet');
  return tab;
}

async function sendToMeet(type) {
  captureToggle.disabled = true;
  const originalLabel = captureToggle.textContent;
  captureToggle.textContent = type === 'MEETWISE_STOP' ? 'กำลังส่ง…' : 'กำลังเริ่ม…';
  try {
    const tab = await activeMeetTab();
    const result = await chrome.tabs.sendMessage(tab.id, { type });
    if (result?.status) renderCapture(result.status);
    if (!result?.ok) throw new Error(result?.error || 'ส่วนขยายไม่ตอบกลับ');
    if (!result.status) await load();
  } catch (error) {
    captureStatus.textContent = error.message;
  } finally {
    captureToggle.disabled = false;
    if (captureToggle.textContent === 'กำลังส่ง…' || captureToggle.textContent === 'กำลังเริ่ม…')
      captureToggle.textContent = originalLabel;
  }
}

captureToggle.addEventListener('click', () =>
  sendToMeet(captureState.capturing || captureState.canRetry ? 'MEETWISE_STOP' : 'MEETWISE_START')
);

activeMeetTab()
  .then((tab) => chrome.tabs.sendMessage(tab.id, { type: 'MEETWISE_STATUS' }))
  .then((result) => renderCapture(result.status))
  .catch(() => {
    renderCapture({ capturing: false, count: 0 });
    captureToggle.disabled = true;
    captureStatus.textContent = 'เปิดแท็บ Google Meet และเปิดคำบรรยายก่อนเริ่มบันทึก';
  });

elapsedTimer = setInterval(() => {
  if (captureState.capturing) renderCapture(captureState);
}, 1_000);
window.addEventListener('unload', () => clearInterval(elapsedTimer));

void load();
