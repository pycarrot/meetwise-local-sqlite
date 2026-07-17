const CAPTION_ITEM_SELECTOR = '.nMcdL.bj4p3b';
const SPEAKER_SELECTOR = '.NWpY1d';
const TEXT_SELECTOR = '.ygicle.VbkSUe';

let capturing = false;
let startedAt = 0;
let segments = [];
let activeBySpeaker = new Map();
let pendingPayload;
let observer;
let scanQueued = false;
let checkpointTimer;
let indicatorTimer;

function pageKey() {
  return `${location.origin}${location.pathname}`;
}

function scheduleCheckpoint() {
  clearTimeout(checkpointTimer);
  checkpointTimer = setTimeout(() => {
    chrome.runtime.sendMessage({
      type: 'MEETWISE_CAPTURE_CHECKPOINT',
      state:
        capturing || pendingPayload
          ? {
              pageKey: pageKey(),
              capturing,
              startedAt,
              segments,
              activeBySpeaker: [...activeBySpeaker.entries()],
              pendingPayload
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
  pendingPayload = undefined;
  updateIndicator();
  scanCaptions();
  scheduleCheckpoint();
  return true;
}

function commitSpeaker(speaker) {
  const active = activeBySpeaker.get(speaker);
  if (!active?.text) return;
  segments.push({ ...active, endMs: Math.max(active.endMs, active.startMs + 300) });
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
  const latestBySpeaker = new Map();
  if (items.length) {
    items.forEach((item) => {
      const speaker = item.querySelector(SPEAKER_SELECTOR)?.textContent || '';
      const text = item.querySelector(TEXT_SELECTOR)?.textContent || '';
      latestBySpeaker.set(speaker, text);
    });
  } else {
    document.querySelectorAll(TEXT_SELECTOR).forEach((textElement) => {
      const container = textElement.closest('[role="region"], [role="group"], div');
      const speaker = container?.querySelector(SPEAKER_SELECTOR)?.textContent || 'ไม่ทราบชื่อ';
      latestBySpeaker.set(speaker, textElement.textContent || '');
    });
  }
  for (const speaker of activeBySpeaker.keys()) {
    if (!latestBySpeaker.has(speaker)) commitSpeaker(speaker);
  }
  latestBySpeaker.forEach((text, speaker) => observeCaption(speaker, text));
  updateIndicator();
  scheduleCheckpoint();
}

function queueScan() {
  if (scanQueued || !capturing) return;
  scanQueued = true;
  requestAnimationFrame(scanCaptions);
}

async function stopAndSend() {
  if (!capturing && !pendingPayload) return { ok: false, error: 'ยังไม่ได้เริ่มจับคำบรรยาย' };
  if (capturing) {
    capturing = false;
    for (const speaker of [...activeBySpeaker.keys()]) commitSpeaker(speaker);
    const endedAt = new Date();
    pendingPayload = {
      title: meetingTitle(),
      source: 'google-meet-caption',
      startedAt: new Date(startedAt).toISOString(),
      endedAt: endedAt.toISOString(),
      segments
    };
  }
  updateIndicator('กำลังส่ง…');
  if (!pendingPayload.segments.length) {
    pendingPayload = undefined;
    updateIndicator('ไม่พบคำบรรยาย');
    scheduleCheckpoint();
    return { ok: false, error: 'ไม่พบคำบรรยายสำหรับอัปโหลด' };
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'MEETWISE_IMPORT',
      payload: pendingPayload
    });
    if (!response?.ok) throw new Error(response?.error || 'เพิ่มเข้าคิวไม่สำเร็จ');
    pendingPayload = undefined;
    scheduleCheckpoint();
    updateIndicator(`เข้าคิวแล้ว ${segments.length} ช่วง`);
    return { ...response, status: { capturing: false, count: segments.length, startedAt } };
  } catch (error) {
    scheduleCheckpoint();
    updateIndicator(`ส่งไม่สำเร็จ · ${error.message}`);
    return {
      ok: false,
      error: error.message,
      status: { capturing: false, count: segments.length, canRetry: true, startedAt }
    };
  }
}

function updateIndicator(text) {
  const indicator = document.getElementById('meetwise-capture-indicator');
  if (!indicator) return;
  clearTimeout(indicatorTimer);
  if (!text && !capturing) {
    indicator.hidden = true;
    return;
  }
  indicator.hidden = false;
  indicator.textContent =
    text || `Meetwise กำลังบันทึก · ${segments.length + activeBySpeaker.size} ช่วง`;
  indicator.dataset.capturing = String(capturing);
  indicator.style.pointerEvents = text?.startsWith('ส่งไม่สำเร็จ') ? 'auto' : 'none';
  if (text && !text.startsWith('ส่งไม่สำเร็จ'))
    indicatorTimer = setTimeout(() => {
      if (!capturing) indicator.hidden = true;
    }, 4_000);
}

function installIndicator() {
  if (document.getElementById('meetwise-capture-indicator')) return;
  const indicator = document.createElement('div');
  indicator.id = 'meetwise-capture-indicator';
  Object.assign(indicator.style, {
    position: 'fixed',
    right: '18px',
    bottom: '84px',
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
  indicator.addEventListener('click', () => {
    if (!capturing) indicator.hidden = true;
  });
  updateIndicator();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'MEETWISE_START') {
    if (!startCapture())
      return sendResponse({ ok: false, error: 'มี capture session ที่กำลังทำงานอยู่แล้ว' });
    sendResponse({
      ok: true,
      status: { capturing, count: segments.length + activeBySpeaker.size, startedAt }
    });
  } else if (message.type === 'MEETWISE_STOP') {
    stopAndSend()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  } else if (message.type === 'MEETWISE_STATUS') {
    sendResponse({
      ok: true,
      status: {
        capturing,
        count: segments.length + activeBySpeaker.size,
        canRetry: Boolean(pendingPayload),
        startedAt
      }
    });
  }
});

observer = new MutationObserver(queueScan);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
installIndicator();

chrome.runtime.sendMessage({ type: 'MEETWISE_CAPTURE_RESTORE' }).then((response) => {
  const state = response?.state;
  if ((!state?.capturing && !state?.pendingPayload) || state.pageKey !== pageKey()) return;
  capturing = Boolean(state.capturing);
  startedAt = state.startedAt;
  segments = Array.isArray(state.segments) ? state.segments : [];
  activeBySpeaker = new Map(Array.isArray(state.activeBySpeaker) ? state.activeBySpeaker : []);
  pendingPayload = state.pendingPayload;
  updateIndicator(capturing ? 'กู้ capture session แล้ว' : 'มีรายการที่ยังส่งไม่สำเร็จ');
  if (capturing) scanCaptions();
});
