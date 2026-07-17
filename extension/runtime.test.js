// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueueItem, normalizeServerUrl, retryDelayMs } from './lib.js';

const backgroundSource = readFileSync(resolve('extension/background.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .concat('\nreturn { enqueue, processQueue, readQueue, writeQueue };');

const contentSource = readFileSync(resolve('extension/content.js'), 'utf8').concat(
  '\nreturn { startCapture, observeCaption, commitSpeaker, scanCaptions, stopAndSend, cleanup: () => { observer.disconnect(); clearTimeout(checkpointTimer); clearTimeout(indicatorTimer); }, state: () => ({ capturing, segments, pendingPayload }) };'
);

let contentRuntime;
afterEach(() => contentRuntime?.cleanup?.());

function chromeMock(initial = {}) {
  let storage = structuredClone(initial);
  const listeners = [];
  return {
    storage: {
      managed: { get: vi.fn(async () => ({})) },
      local: {
        get: vi.fn(async (key) =>
          typeof key === 'string'
            ? { [key]: structuredClone(storage[key]) }
            : structuredClone(storage)
        ),
        set: vi.fn(async (value) => {
          storage = { ...storage, ...structuredClone(value) };
        }),
        remove: vi.fn(async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        })
      }
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(async () => true),
      onAlarm: { addListener: vi.fn() }
    },
    runtime: {
      onMessage: { addListener: vi.fn((listener) => listeners.push(listener)) },
      onStartup: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      sendMessage: vi.fn(async () => ({ state: null }))
    },
    permissions: { contains: vi.fn(async () => true) },
    tabs: { create: vi.fn() },
    listeners
  };
}

function loadBackground(queue = []) {
  globalThis.chrome = chromeMock({
    meetwiseAuthV1: { accessToken: 'token' },
    meetwiseUploadQueueV1: queue
  });
  return new Function(
    'BUILD_MODE',
    'DEFAULT_SERVER_URL',
    'createQueueItem',
    'normalizeServerUrl',
    'retryDelayMs',
    backgroundSource
  )('development', 'http://127.0.0.1:4317', createQueueItem, normalizeServerUrl, retryDelayMs);
}

function response(ok, body, status = ok ? 200 : 500) {
  return { ok, status, json: vi.fn(async () => body) };
}

describe('extension upload queue runtime', () => {
  it('drains three eligible items sequentially with their original idempotency keys', async () => {
    const queue = ['one', 'two', 'three'].map((id) => createQueueItem({ title: id }, id));
    globalThis.fetch = vi.fn(async (_url, init) =>
      response(true, { meeting: { id: JSON.parse(init.body).title }, replayed: false })
    );
    const runtime = loadBackground(queue);

    await runtime.processQueue();

    const stored = await runtime.readQueue();
    expect(stored.map((item) => item.state)).toEqual(['uploaded', 'uploaded', 'uploaded']);
    expect(fetch.mock.calls.map(([, init]) => init.headers['idempotency-key'])).toEqual(
      queue.map((item) => item.idempotencyKey)
    );
  });

  it('continues after one failure and preserves its error metadata', async () => {
    const queue = ['one', 'two', 'three'].map((id) => createQueueItem({ title: id }, id));
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response(false, { error: { message: 'nope', code: 'UPLOAD_FAILED', requestId: 'req-1' } })
      )
      .mockResolvedValueOnce(response(true, { meeting: { id: 'two' } }))
      .mockResolvedValueOnce(response(true, { meeting: { id: 'three' } }));
    const runtime = loadBackground(queue);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runtime.processQueue();

    const stored = await runtime.readQueue();
    expect(stored.map((item) => item.state)).toEqual(['failed', 'uploaded', 'uploaded']);
    expect(stored[0]).toMatchObject({ errorCode: 'UPLOAD_FAILED', requestId: 'req-1' });
  });

  it('skips future retries and prevents concurrent duplicate uploads', async () => {
    const future = createQueueItem({ title: 'future' }, 'future');
    future.state = 'failed';
    future.nextAttemptAt = Date.now() + 60_000;
    const current = createQueueItem({ title: 'current' }, 'current');
    let release;
    globalThis.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve(response(true, { meeting: { id: 'current' } }));
        })
    );
    const runtime = loadBackground([future, current]);

    const first = runtime.processQueue();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await runtime.processQueue();
    release();
    await first;

    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await runtime.readQueue())[0].state).toBe('failed');
  });

  it('keeps only five uploaded results and schedules the earliest retry', async () => {
    const uploaded = Array.from({ length: 21 }, (_, index) => ({
      ...createQueueItem({ title: `done-${index}` }, `done-${index}`),
      state: 'uploaded',
      uploadedAt: index
    }));
    const failed = [5_000, 2_000, 10_000].map((nextAttemptAt, index) => ({
      ...createQueueItem({ title: `failed-${index}` }, `failed-${index}`),
      state: 'failed',
      nextAttemptAt: Date.now() + nextAttemptAt
    }));
    const runtime = loadBackground();

    await runtime.writeQueue([...uploaded, ...failed]);
    globalThis.fetch = vi.fn(async () => response(true, { meeting: { id: 'new' } }));
    await expect(runtime.enqueue({ title: 'new' })).resolves.toBeDefined();

    const stored = await runtime.readQueue();
    expect(stored.filter((item) => item.state === 'uploaded')).toHaveLength(5);
    expect(stored.filter((item) => item.state === 'failed')).toHaveLength(3);
    expect(chrome.alarms.create).toHaveBeenCalledWith('meetwise-upload-retry', {
      when: failed[1].nextAttemptAt
    });
    expect(
      stored.filter((item) => item.state === 'uploaded').map((item) => item.uploadedAt)
    ).toEqual([16, 17, 18, 19, 20]);
  });

  it('does not postpone an earlier alarm and clears it after all retries succeed', async () => {
    const now = Date.now();
    const early = {
      ...createQueueItem({ title: 'early' }, 'early'),
      state: 'failed',
      nextAttemptAt: now + 2_000
    };
    const later = {
      ...createQueueItem({ title: 'later' }, 'later'),
      state: 'failed',
      nextAttemptAt: now + 8_000
    };
    const runtime = loadBackground();

    await runtime.writeQueue([early]);
    await runtime.writeQueue([early, later]);
    expect(chrome.alarms.create).toHaveBeenLastCalledWith('meetwise-upload-retry', {
      when: early.nextAttemptAt
    });

    early.nextAttemptAt = now - 1;
    later.nextAttemptAt = now - 1;
    await runtime.writeQueue([early, later]);
    globalThis.fetch = vi.fn(async (_url, init) =>
      response(true, { meeting: { id: JSON.parse(init.body).title } })
    );
    await runtime.processQueue();
    await runtime.processQueue();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(chrome.alarms.clear).toHaveBeenLastCalledWith('meetwise-upload-retry');
  });

  it('still rejects twenty pending failures', async () => {
    const failed = Array.from({ length: 20 }, (_, index) => ({
      ...createQueueItem({ title: `failed-${index}` }, `failed-${index}`),
      state: 'failed',
      nextAttemptAt: Date.now() + 60_000
    }));
    const runtime = loadBackground(failed);

    await expect(runtime.enqueue({ title: 'blocked' })).rejects.toThrow('คิวอัปโหลดเต็ม');
  });

  it('removes queued items through the runtime message without touching auth', async () => {
    const runtime = loadBackground([createQueueItem({ title: 'remove me' }, 'remove')]);
    const result = await new Promise((resolve) =>
      chrome.listeners[0]({ type: 'MEETWISE_QUEUE_REMOVE', id: 'remove' }, {}, resolve)
    );
    expect(result).toEqual({ ok: true });
    expect(await runtime.readQueue()).toEqual([]);
    expect((await chrome.storage.local.get('meetwiseAuthV1')).meetwiseAuthV1).toEqual({
      accessToken: 'token'
    });
  });
});

function loadContent(sendMessage = vi.fn(async () => ({ state: null }))) {
  document.body.replaceChildren();
  globalThis.chrome = chromeMock();
  chrome.runtime.sendMessage = sendMessage;
  globalThis.requestAnimationFrame = vi.fn(() => 1);
  contentRuntime = new Function(contentSource)();
  return contentRuntime;
}

describe('caption capture runtime', () => {
  it('deduplicates rescans, extends progressive text, and keeps repeated utterances', async () => {
    const runtime = loadContent();
    runtime.startCapture();
    runtime.observeCaption('A', 'รับทราบ');
    runtime.observeCaption('A', 'รับทราบ');
    runtime.observeCaption('A', 'รับทราบครับ');
    runtime.commitSpeaker('A');
    runtime.observeCaption('B', 'ต่อเลย');
    runtime.commitSpeaker('B');
    runtime.observeCaption('A', 'รับทราบ');
    runtime.commitSpeaker('A');

    expect(runtime.state().segments.map((item) => item.text)).toEqual([
      'รับทราบครับ',
      'ต่อเลย',
      'รับทราบ'
    ]);
  });

  it('treats a caption that disappears and returns as a new utterance', () => {
    const runtime = loadContent();
    runtime.startCapture();
    const item = document.createElement('div');
    item.className = 'nMcdL bj4p3b';
    item.innerHTML = '<span class="NWpY1d">A</span><span class="ygicle VbkSUe">รับทราบ</span>';
    document.body.append(item);
    runtime.scanCaptions();
    item.remove();
    runtime.scanCaptions();
    document.body.append(item);
    runtime.scanCaptions();
    runtime.commitSpeaker('A');

    expect(runtime.state().segments.map((segment) => segment.text)).toEqual(['รับทราบ', 'รับทราบ']);
  });

  it('retains a failed payload for retry and clears it after success', async () => {
    let imports = 0;
    const sendMessage = vi.fn(async (message) => {
      if (message.type === 'MEETWISE_CAPTURE_RESTORE') return { state: null };
      if (message.type === 'MEETWISE_IMPORT') {
        imports += 1;
        if (imports === 1) throw new Error('runtime disconnected');
        return { ok: true };
      }
      return { ok: true };
    });
    const runtime = loadContent(sendMessage);
    runtime.startCapture();
    runtime.observeCaption('A', 'ข้อความสำคัญ');

    const failed = await runtime.stopAndSend();
    expect(failed).toMatchObject({ ok: false, status: { canRetry: true } });
    expect(runtime.state().pendingPayload.segments).toHaveLength(1);

    const retried = await runtime.stopAndSend();
    expect(retried.ok).toBe(true);
    expect(runtime.state().pendingPayload).toBeUndefined();
  });

  it('commits every active speaker when capture stops', async () => {
    const runtime = loadContent(
      vi.fn(async (message) =>
        message.type === 'MEETWISE_IMPORT' ? { ok: true } : { state: null }
      )
    );
    runtime.startCapture();
    runtime.observeCaption('A', 'หนึ่ง');
    runtime.observeCaption('B', 'สอง');

    await runtime.stopAndSend();

    const payload = chrome.runtime.sendMessage.mock.calls.find(
      ([message]) => message.type === 'MEETWISE_IMPORT'
    )[0].payload;
    expect(payload.segments.map((segment) => segment.speaker)).toEqual(['A', 'B']);
  });

  it('restores a checkpoint without duplicating its active segment', async () => {
    const checkpoint = {
      pageKey: `${location.origin}${location.pathname}`,
      capturing: true,
      startedAt: Date.now() - 1_000,
      segments: [],
      activeBySpeaker: [
        ['A', { id: 'active-a', speaker: 'A', text: 'กู้คืน', startMs: 0, endMs: 500 }]
      ]
    };
    const runtime = loadContent(
      vi.fn(async (message) =>
        message.type === 'MEETWISE_CAPTURE_RESTORE'
          ? { state: checkpoint }
          : message.type === 'MEETWISE_IMPORT'
            ? { ok: true }
            : { ok: true }
      )
    );
    await vi.waitFor(() => expect(runtime.state().capturing).toBe(true));

    await runtime.stopAndSend();

    const payload = chrome.runtime.sendMessage.mock.calls.find(
      ([message]) => message.type === 'MEETWISE_IMPORT'
    )[0].payload;
    expect(payload.segments).toEqual([
      expect.objectContaining({ id: 'active-a', speaker: 'A', text: 'กู้คืน' })
    ]);
  });

  it('restores a failed payload after reopening and retries it intact', async () => {
    const pendingPayload = {
      title: 'รายการที่กู้คืน',
      source: 'google-meet-caption',
      startedAt: new Date(Date.now() - 1_000).toISOString(),
      endedAt: new Date().toISOString(),
      segments: [{ id: 'saved', speaker: 'A', text: 'ยังอยู่', startMs: 0, endMs: 500 }]
    };
    const runtime = loadContent(
      vi.fn(async (message) =>
        message.type === 'MEETWISE_CAPTURE_RESTORE'
          ? {
              state: {
                pageKey: `${location.origin}${location.pathname}`,
                capturing: false,
                startedAt: Date.now() - 1_000,
                segments: pendingPayload.segments,
                activeBySpeaker: [],
                pendingPayload
              }
            }
          : message.type === 'MEETWISE_IMPORT'
            ? { ok: true }
            : { ok: true }
      )
    );
    await vi.waitFor(() => expect(runtime.state().pendingPayload).toEqual(pendingPayload));

    await runtime.stopAndSend();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'MEETWISE_IMPORT',
      payload: pendingPayload
    });
  });

  it('handles an explicit failed response and an empty capture without losing control', async () => {
    const runtime = loadContent(
      vi.fn(async (message) =>
        message.type === 'MEETWISE_IMPORT' ? { ok: false, error: 'queue full' } : { state: null }
      )
    );
    runtime.startCapture();
    runtime.observeCaption('A', 'ข้อความ');
    expect(await runtime.stopAndSend()).toMatchObject({ ok: false, error: 'queue full' });

    runtime.startCapture();
    expect(await runtime.stopAndSend()).toMatchObject({
      ok: false,
      error: 'ไม่พบคำบรรยายสำหรับอัปโหลด'
    });
  });
});
