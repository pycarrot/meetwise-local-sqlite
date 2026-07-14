import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const chromePath =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = process.env.MEETWISE_URL || 'http://127.0.0.1:4317';
const outputDir = path.resolve('docs', '.qa');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1
  });
  await desktop.goto(baseUrl, { waitUntil: 'networkidle' });
  await desktop.getByRole('heading', { name: 'ประชุมวางแผน Q3' }).waitFor();
  await desktop.screenshot({ path: path.join(outputDir, 'desktop.png'), fullPage: true });

  const search = desktop.getByPlaceholder('ค้นหาในบทสนทนา');
  await search.fill('งบประมาณ');
  const filteredRows = await desktop.locator('.transcript-row').count();
  if (filteredRows < 1 || filteredRows >= 7)
    throw new Error(`Transcript filter failed: ${filteredRows} rows`);

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1
  });
  await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
  await mobile.getByRole('heading', { name: 'ประชุมวางแผน Q3' }).waitFor();
  await mobile.screenshot({ path: path.join(outputDir, 'mobile-summary.png'), fullPage: true });
  await mobile.getByRole('tab', { name: 'ผู้พูด' }).click();
  await mobile.getByRole('heading', { name: 'สัดส่วนการพูด' }).waitFor();
  await mobile.screenshot({ path: path.join(outputDir, 'mobile-speakers.png'), fullPage: true });

  console.log(JSON.stringify({ ok: true, filteredRows, outputDir }, null, 2));
} finally {
  await browser.close();
}
