const API_URL = 'http://127.0.0.1:4317';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'MEETWISE_IMPORT') {
    fetch(`${API_URL}/api/meetings/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message.payload)
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        return data;
      })
      .then((meeting) => sendResponse({ ok: true, meeting }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'MEETWISE_HEALTH') {
    fetch(`${API_URL}/api/health`)
      .then((response) => response.json())
      .then((health) => sendResponse({ ok: true, health }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'MEETWISE_OPEN_DASHBOARD') {
    chrome.tabs.create({ url: API_URL });
    sendResponse({ ok: true });
  }
});
