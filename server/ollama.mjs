import { config } from './config.mjs';

export function configuredModel() {
  return config.ollamaModel;
}

export async function ollamaStatus() {
  try {
    const response = await fetch(`${config.ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(2500)
    });
    if (!response.ok) throw new Error(`Ollama ตอบกลับ ${response.status}`);
    const data = await response.json();
    const models = (data.models || []).map((item) => item.name);
    const model = configuredModel();
    return {
      connected: true,
      model,
      models,
      modelAvailable: models.some((name) => name === model || name.startsWith(`${model}:`))
    };
  } catch (error) {
    return {
      connected: false,
      model: configuredModel(),
      models: [],
      modelAvailable: false,
      error: error.message
    };
  }
}

function transcriptText(meeting) {
  return meeting.segments
    .map(
      (segment) => `[${Math.round(segment.startMs / 1000)}s] ${segment.speaker}: ${segment.text}`
    )
    .join('\n');
}

function textList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
}

function sanitizeAnalysis(value) {
  return {
    summary: textList(value.summary),
    decisions: textList(value.decisions),
    actionItems: Array.isArray(value.actionItems)
      ? value.actionItems
          .map((item) => ({
            owner: String(item?.owner || 'ไม่ระบุ'),
            task: String(item?.task || '').trim(),
            due: String(item?.due || 'ไม่ระบุ')
          }))
          .filter((item) => item.task)
      : [],
    topics: Array.isArray(value.topics)
      ? value.topics
          .map((topic) => ({
            name: String(topic?.name || '').trim(),
            summary: String(topic?.summary || '').trim(),
            speakers: Array.isArray(topic?.speakers)
              ? topic.speakers
                  .map((speaker) => ({
                    name: String(speaker?.name || 'ไม่ทราบชื่อ').trim(),
                    contribution: String(speaker?.contribution || '').trim()
                  }))
                  .filter((speaker) => speaker.contribution)
              : []
          }))
          .filter((topic) => topic.name)
      : []
  };
}

export async function analyzeWithOllama(meeting) {
  const model = configuredModel();
  const prompt = `คุณเป็นผู้ช่วยวิเคราะห์การประชุมภาษาไทย วิเคราะห์ transcript ต่อไปนี้โดยยึดเฉพาะข้อมูลที่มีอยู่จริง\n\n${transcriptText(meeting)}\n\nตอบเป็น JSON เท่านั้น โดยมีโครงสร้าง:\n{\n  "summary": ["ประเด็นสรุป 3-6 ข้อ"],\n  "decisions": ["มติหรือข้อสรุป"],\n  "actionItems": [{"owner":"ชื่อผู้รับผิดชอบหรือไม่ระบุ", "task":"งาน", "due":"กำหนดเวลาหรือไม่ระบุ"}],\n  "topics": [{"name":"ชื่อประเด็นสั้น", "summary":"สาระสำคัญ", "speakers":[{"name":"ชื่อผู้พูด", "contribution":"สิ่งที่พูดในประเด็นนี้"}]}]\n}\nห้ามแต่งข้อมูล ห้ามเพิ่มผู้พูดที่ไม่มีใน transcript และใช้ภาษาไทยกระชับ`;

  const response = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      options: { temperature: 0.1 },
      messages: [{ role: 'user', content: prompt }]
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error(`Ollama วิเคราะห์ไม่สำเร็จ (${response.status})`);
  const payload = await response.json();
  const parsed = sanitizeAnalysis(JSON.parse(payload.message?.content || '{}'));
  return {
    model,
    analyzedAt: new Date().toISOString(),
    ...parsed
  };
}
