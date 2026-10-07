import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const Core = require(path.join(root, 'core.js'));
const dataPath = path.join(root, 'data', 'daily.json');
const TIMEOUT_MS = 10000;

async function fetchLocation(location) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const sourceUrl = Core.sourceUrlFor(location.id);
    const response = await fetch(sourceUrl, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return Core.normalizeOpenMeteo(payload, {
      fetchedAt: new Date().toISOString(),
      locationId: location.id,
      sourceUrl
    });
  } finally {
    clearTimeout(timer);
  }
}

let log = Core.emptySharedLog();
try {
  const saved = JSON.parse(await readFile(dataPath, 'utf8'));
  if (saved?.schema_version === Core.SHARED_LOG_SCHEMA && Array.isArray(saved.readings)) log = saved;
} catch { /* 첫 실행이거나 파일이 없는 경우 빈 로그로 시작 */ }

const previousReadings = JSON.stringify(log.readings);
const errors = [];
for (const location of Core.LOCATIONS) {
  try {
    const reading = await fetchLocation(location);
    log = Core.upsertSharedRow(log, reading);
    console.log(`ok ${location.id.padEnd(8)} ${reading.normalized_value}${reading.unit} @ ${reading.record_date} (source ${reading.source_time})`);
  } catch (error) {
    errors.push(`${location.id}: ${error.message}`);
  }
}

if (JSON.stringify(log.readings) === previousReadings) {
  console.log('공유 기록 변화 없음 — 파일을 쓰지 않습니다.');
} else {
  log.generated_at = new Date().toISOString();
  await mkdir(path.dirname(dataPath), { recursive: true });
  await writeFile(dataPath, JSON.stringify(log, null, 2) + '\n');
  console.log(`data/daily.json 갱신 — 총 ${log.readings.length}건`);
}

for (const error of errors) console.warn(`warn ${error}`);
if (!log.readings.length) {
  console.error('모든 지역 조회에 실패했습니다.');
  process.exit(1);
}
