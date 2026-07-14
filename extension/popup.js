const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const dashboardButton = document.getElementById('dashboard');
const serverStatus = document.getElementById('server-status');
const captureStatus = document.getElementById('capture-status');

async function activeMeetTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('https://meet.google.com/'))
    throw new Error('กรุณาเปิดแท็บ Google Meet');
  return tab;
}

function renderStatus(status) {
  startButton.disabled = status.capturing;
  stopButton.disabled = !status.capturing;
  captureStatus.textContent = status.capturing
    ? `กำลังจับคำบรรยาย · ${status.count} ช่วง`
    : 'พร้อมเริ่มจับคำบรรยาย';
}

async function sendToMeet(type) {
  try {
    const tab = await activeMeetTab();
    const response = await chrome.tabs.sendMessage(tab.id, { type });
    if (!response?.ok) throw new Error(response?.error || 'ส่วนขยายไม่ตอบกลับ');
    if (response.status) renderStatus(response.status);
    else if (type === 'MEETWISE_STOP') {
      renderStatus({ capturing: false, count: 0 });
      captureStatus.textContent = 'บันทึกเข้าแดชบอร์ดแล้ว';
    }
  } catch (error) {
    captureStatus.textContent = error.message;
  }
}

startButton.addEventListener('click', () => sendToMeet('MEETWISE_START'));
stopButton.addEventListener('click', () => sendToMeet('MEETWISE_STOP'));
dashboardButton.addEventListener('click', () =>
  chrome.runtime.sendMessage({ type: 'MEETWISE_OPEN_DASHBOARD' })
);

chrome.runtime.sendMessage({ type: 'MEETWISE_HEALTH' }).then((response) => {
  serverStatus.classList.toggle('online', Boolean(response?.health?.ollama?.connected));
  serverStatus.querySelector('span').textContent = response?.health?.ollama?.connected
    ? `Ollama พร้อม · ${response.health.ollama.model}`
    : response?.ok
      ? 'เซิร์ฟเวอร์พร้อม · Ollama ยังไม่เชื่อมต่อ'
      : 'เปิดเซิร์ฟเวอร์ Meetwise ก่อน';
});

activeMeetTab()
  .then((tab) => chrome.tabs.sendMessage(tab.id, { type: 'MEETWISE_STATUS' }))
  .then((response) => renderStatus(response.status))
  .catch(() => renderStatus({ capturing: false, count: 0 }));
