const CAPTION_ITEM_SELECTOR = '.nMcdL.bj4p3b';
const SPEAKER_SELECTOR = '.NWpY1d';
const TEXT_SELECTOR = '.ygicle.VbkSUe';

let capturing = false;
let startedAt = 0;
let segments = [];
let activeBySpeaker = new Map();
let lastSavedTextBySpeaker = new Map();
let observer;
let scanQueued = false;
let checkpointTimer;

function pageKey() {
  return `${location.origin}${location.pathname}`;
}

function scheduleCheckpoint() {
  clearTimeout(checkpointTimer);
  checkpointTimer = setTimeout(() => {
    chrome.runtime.sendMessage({
      type: 'MEETWISE_CAPTURE_CHECKPOINT',
      state: capturing
        ? {
            pageKey: pageKey(),
            capturing,
            startedAt,
            segments,
            activeBySpeaker: [...activeBySpeaker.entries()],
            lastSavedTextBySpeaker: [...lastSavedTextBySpeaker.entries()]
          }
        : null
    });
  }, 250);
}

function elapsed() {
  return Math.max(0, Date.now() - startedAt);
}

function meetingTitle() {
  const title = document.title.replace(/\s*[-–|]\s*Google Meet.*$/i, '').trim();
  return title && title !== 'Google Meet'
    ? title
    : `Google Meet ${new Date().toLocaleString('th-TH')}`;
}

function startCapture() {
  if (capturing) return false;
  capturing = true;
  startedAt = Date.now();
  segments = [];
  activeBySpeaker = new Map();
  lastSavedTextBySpeaker = new Map();
  updateIndicator();
  scanCaptions();
  scheduleCheckpoint();
  return true;
}

function commitSpeaker(speaker) {
  const active = activeBySpeaker.get(speaker);
  if (!active?.text) return;
  const previousText = lastSavedTextBySpeaker.get(speaker);
  if (active.text !== previousText) {
    segments.push({ ...active, endMs: Math.max(active.endMs, active.startMs + 300) });
    lastSavedTextBySpeaker.set(speaker, active.text);
  }
  activeBySpeaker.delete(speaker);
  scheduleCheckpoint();
}

function observeCaption(speaker, text) {
  const cleanSpeaker = speaker.trim() || 'ไม่ทราบชื่อ';
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (!cleanText) return;
  const now = elapsed();
  const active = activeBySpeaker.get(cleanSpeaker);

  if (!active) {
    activeBySpeaker.set(cleanSpeaker, {
      id: crypto.randomUUID(),
      speaker: cleanSpeaker,
      text: cleanText,
      startMs: now,
      endMs: now
    });
    return;
  }

  if (cleanText === active.text || cleanText.startsWith(active.text)) {
    active.text = cleanText;
    active.endMs = now;
    return;
  }

  commitSpeaker(cleanSpeaker);
  activeBySpeaker.set(cleanSpeaker, {
    id: crypto.randomUUID(),
    speaker: cleanSpeaker,
    text: cleanText,
    startMs: now,
    endMs: now
  });
}

function scanCaptions() {
  scanQueued = false;
  if (!capturing) return;
  const items = document.querySelectorAll(CAPTION_ITEM_SELECTOR);
  if (items.length) {
    items.forEach((item) => {
      const speaker = item.querySelector(SPEAKER_SELECTOR)?.textContent || '';
      const text = item.querySelector(TEXT_SELECTOR)?.textContent || '';
      observeCaption(speaker, text);
    });
  } else {
    document.querySelectorAll(TEXT_SELECTOR).forEach((textElement) => {
      const container = textElement.closest('[role="region"], [role="group"], div');
      const speaker = container?.querySelector(SPEAKER_SELECTOR)?.textContent || 'ไม่ทราบชื่อ';
      observeCaption(speaker, textElement.textContent || '');
    });
  }
  updateIndicator();
  scheduleCheckpoint();
}

function queueScan() {
  if (scanQueued || !capturing) return;
  scanQueued = true;
  requestAnimationFrame(scanCaptions);
}

async function stopAndSend() {
  if (!capturing) return { ok: false, error: 'ยังไม่ได้เริ่มจับคำบรรยาย' };
  capturing = false;
  for (const speaker of [...activeBySpeaker.keys()]) commitSpeaker(speaker);
  updateIndicator('กำลังส่ง…');
  const endedAt = new Date();
  const payload = {
    title: meetingTitle(),
    source: 'google-meet-caption',
    startedAt: new Date(startedAt).toISOString(),
    endedAt: endedAt.toISOString(),
    segments
  };
  if (!segments.length) {
    updateIndicator('ไม่พบคำบรรยาย');
    scheduleCheckpoint();
    return { ok: false, error: 'ไม่พบคำบรรยายสำหรับอัปโหลด' };
  }
  const response = await chrome.runtime.sendMessage({ type: 'MEETWISE_IMPORT', payload });
  scheduleCheckpoint();
  updateIndicator(response.ok ? `เข้าคิวแล้ว ${segments.length} ช่วง` : 'เพิ่มเข้าคิวไม่สำเร็จ');
  return response;
}

function updateIndicator(text) {
  const indicator = document.getElementById('meetwise-capture-indicator');
  if (!indicator) return;
  indicator.textContent =
    text ||
    (capturing
      ? `Meetwise กำลังจับ · ${segments.length + activeBySpeaker.size} ช่วง`
      : 'Meetwise หยุดแล้ว');
  indicator.dataset.capturing = String(capturing);
}

function installIndicator() {
  if (document.getElementById('meetwise-capture-indicator')) return;
  const indicator = document.createElement('div');
  indicator.id = 'meetwise-capture-indicator';
  Object.assign(indicator.style, {
    position: 'fixed',
    right: '18px',
    top: '18px',
    zIndex: '2147483647',
    padding: '8px 12px',
    borderRadius: '8px',
    background: '#10251d',
    color: '#fff',
    font: '600 12px system-ui, sans-serif',
    boxShadow: '0 5px 20px rgba(0,0,0,.2)',
    pointerEvents: 'none'
  });
  document.body.append(indicator);
  updateIndicator();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'MEETWISE_START') {
    if (!startCapture())
      return sendResponse({ ok: false, error: 'มี capture session ที่กำลังทำงานอยู่แล้ว' });
    sendResponse({
      ok: true,
      status: { capturing, count: segments.length + activeBySpeaker.size }
    });
  } else if (message.type === 'MEETWISE_STOP') {
    stopAndSend().then(sendResponse);
    return true;
  } else if (message.type === 'MEETWISE_STATUS') {
    sendResponse({
      ok: true,
      status: { capturing, count: segments.length + activeBySpeaker.size }
    });
  }
});

observer = new MutationObserver(queueScan);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
installIndicator();

chrome.runtime.sendMessage({ type: 'MEETWISE_CAPTURE_RESTORE' }).then((response) => {
  const state = response?.state;
  if (!state?.capturing || state.pageKey !== pageKey()) return;
  capturing = true;
  startedAt = state.startedAt;
  segments = Array.isArray(state.segments) ? state.segments : [];
  activeBySpeaker = new Map(Array.isArray(state.activeBySpeaker) ? state.activeBySpeaker : []);
  lastSavedTextBySpeaker = new Map(
    Array.isArray(state.lastSavedTextBySpeaker) ? state.lastSavedTextBySpeaker : []
  );
  updateIndicator('กู้ capture session แล้ว');
  scanCaptions();
});
