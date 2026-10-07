import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const Core = require(path.join(root, 'core.js'));

const input = process.argv[2];
if (!input) {
  console.error('사용법: node scripts/check-evidence.mjs <localStorage 상태 JSON 경로>');
  console.error('페이지의 "제출 증거 시뮬레이션" 패널에서 "상태 JSON 복사"로 받은 파일을 넣으면 됩니다.');
  process.exit(64);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(input, 'utf8'));
  if (typeof parsed === 'string') parsed = JSON.parse(parsed);
} catch (error) {
  console.error(`JSON을 읽지 못했습니다: ${error.message}`);
  process.exit(65);
}

const state = parsed?.live?.daily_readings ? parsed.live : parsed;
if (!Array.isArray(state?.daily_readings)) {
  console.error('daily_readings 배열을 찾지 못했습니다. 복사한 상태 JSON인지 확인하세요.');
  process.exit(65);
}

const report = Core.evidenceReportFor(state.daily_readings);
console.log(`점검 시각 ${report.generated_at}`);
console.log('주의: server_created_at은 제출 서버가 부여하므로, 이 점검은 KST 기록 날짜로 대체 시뮬레이션합니다.\n');

if (!report.signals.length) {
  console.log('보존된 일별 기록이 없습니다.');
  process.exit(2);
}

for (const signal of report.signals) {
  console.log(`■ ${signal.location_name} (${signal.signal_id}) — 날짜 ${signal.dates.length}건 · 행 ${signal.row_count}건 · ${signal.ready ? '제출 증거 요건 충족' : '증거 부족'}`);
  for (const check of signal.checks) {
    console.log(`   ${check.ok ? 'PASS' : 'FAIL'} ${check.id} — ${check.detail}`);
  }
  if (signal.receipts.length) {
    console.log('   시뮬레이션 영수증 payload:');
    console.log('   ' + JSON.stringify(signal.receipts.map(receipt => receipt.payload), null, 2).split('\n').join('\n   '));
  }
  console.log('');
}

if (report.ready_signals.length) {
  console.log(`충족 지역: ${report.ready_signals.join(', ')}`);
  process.exit(0);
} else {
  console.log('서로 다른 KST 날짜의 실제 기록 2건이 있는 지역이 아직 없습니다.');
  process.exit(2);
}
