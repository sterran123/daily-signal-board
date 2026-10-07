'use strict';

const Core = window.T04Core;
const LIVE_KEY = 'daily-signal-board-live-v1';
const LOCATION_KEY = 'daily-signal-board-location-v1';
const FIXTURE_ROOT = 'assets/studio-task-assets/t04-real-information-board/fixtures/';
const $ = id => document.getElementById(id);
const fixtureFiles = {
  'T04-NORMAL-D1-A': 'normal-d1-a.json',
  'T04-NORMAL-D1-B': 'normal-d1-b.json',
  'T04-NORMAL-D2': 'normal-d2.json',
  'T04-TIMEOUT': 'timeout.json',
  'T04-AUTH-401': 'auth-401.json',
  'T04-RATE-429': 'rate-429.json',
  'T04-OFFLINE': 'offline.json',
  'T04-SCHEMA-BREAK': 'schema-break.json',
  'T04-RECOVER-D2': 'recover-d2.json'
};
const errorLabels = {
  timeout: '응답 시간 초과',
  auth: '원천 접근 거절',
  rate_limit: '원천 호출 제한',
  offline: '네트워크 연결 실패',
  schema_error: '응답 형식 오류',
  none: '오류 없음'
};
function readLocationId() {
  try { return Core.locationFor(localStorage.getItem(LOCATION_KEY)).id; }
  catch { return Core.DEFAULT_LOCATION_ID; }
}

let selectedLocationId = readLocationId();
let liveState = loadLiveState();
let liveBusy = false;
let liveErrorMessage = '';
let storageMessage = '';
let fixtureState = Core.resetEvaluationState();
let fixtureBusy = false;

function loadLiveState() {
  try {
    const saved = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null');
    if (!saved || saved.schema_version !== 'aleph-t04-evaluation-state-v1' || !Array.isArray(saved.daily_readings)) return Core.resetEvaluationState();
    const readings = saved.daily_readings.filter(row => {
      try { Core.validateNormalizedReading(row.reading); return true; } catch { return false; }
    });
    const statusBySignal = Object.fromEntries(Object.entries(saved.status_by_signal || {})
      .filter(([signal, status]) => /^[a-z0-9][a-z0-9._-]{0,99}$/.test(signal) && Core.validateStatus(status)));
    if (saved.current_reading?.signal_id && Core.validateStatus(saved.status)) {
      statusBySignal[saved.current_reading.signal_id] = saved.status;
    }
    const signalId = Core.signalIdFor(selectedLocationId);
    const currentRow = readings.filter(row => row.signal_id === signalId)
      .sort((left, right) => right.record_date.localeCompare(left.record_date))[0] || null;
    const comparison = currentRow ? Core.comparisonFor(readings, currentRow) : Core.resetEvaluationState().last_comparison;
    return {
      ...Core.resetEvaluationState(),
      ...saved,
      daily_readings: readings,
      status_by_signal: statusBySignal,
      current_reading: currentRow?.reading || null,
      current_source_response: currentRow?.source_response || null,
      status: statusBySignal[signalId] || null,
      last_comparison: comparison,
      last_delta: comparison.magnitude
    };
  } catch {
    return Core.resetEvaluationState();
  }
}

function saveLiveState() {
  try {
    localStorage.setItem(LOCATION_KEY, selectedLocationId);
    localStorage.setItem(LIVE_KEY, JSON.stringify(liveState));
    storageMessage = '';
  } catch {
    storageMessage = '브라우저 저장 공간이 부족해 이 조회 결과를 새로고침 뒤에도 보존하지 못할 수 있습니다.';
  }
}

function formatTime(value) {
  if (!value) return '원천에서 제공하지 않음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '시각을 해석할 수 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: Core.TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(date) + ' KST';
}

function formatDate(value) {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : value;
}

function formatNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 10, useGrouping: false }).format(value);
}

function formatValue(value, unit = '°C') {
  return formatNumber(value) === '—' ? '—' : `${formatNumber(value)} ${unit}`;
}

function formatDelta(comparison) {
  if (!comparison || comparison.state === 'insufficient') return '비교 기록 없음';
  if (comparison.state !== 'comparable') return '단위가 달라 비교할 수 없음';
  const amount = formatNumber(comparison.magnitude);
  const sign = comparison.direction === 'increase' ? '+' : comparison.direction === 'decrease' ? '−' : '±';
  return `${sign}${amount} ${comparison.unit}`;
}

function renderHistory() {
  const body = $('historyRows');
  body.replaceChildren();
  const signalId = Core.signalIdFor(selectedLocationId);
  const rows = liveState.daily_readings.filter(row => row.signal_id === signalId)
    .sort((a, b) => b.record_date.localeCompare(a.record_date));
  $('recordCount').textContent = `${rows.length}일`;
  $('historyEmpty').hidden = rows.length > 0;
  for (const row of rows) {
    const tr = document.createElement('tr');
    const date = document.createElement('td');
    const value = document.createElement('td');
    const sourceTime = document.createElement('td');
    date.textContent = formatDate(row.record_date);
    value.textContent = formatValue(row.normalized_value, row.unit);
    sourceTime.textContent = formatTime(row.reading.source_time);
    tr.append(date, value, sourceTime);
    body.appendChild(tr);
  }
}

function renderLive() {
  const location = Core.locationFor(selectedLocationId);
  const signalId = Core.signalIdFor(location.id);
  const reading = liveState.current_reading?.signal_id === signalId ? liveState.current_reading : null;
  const sourceResponse = reading ? liveState.current_source_response : null;
  const status = liveState.status_by_signal?.[signalId] || (reading ? liveState.status : null);
  const stateName = liveBusy ? 'loading' : status?.freshness || 'empty';
  $('locationSelect').value = location.id;
  $('locationSelect').disabled = liveBusy;
  $('selectedLocationName').textContent = location.name;
  $('current-title').textContent = `${location.name} 현재 기온`;
  $('locationChip').textContent = location.label;
  const statusLabel = liveBusy ? '확인 중' : status?.freshness === 'fresh' ? '정상 조회' : status?.freshness === 'stale' ? '마지막 정상값' : '기록 없음';
  $('liveStatus').dataset.status = stateName;
  $('liveStatus').textContent = statusLabel;
  $('liveStatusDetail').textContent = liveBusy
    ? '원천 응답을 기다리는 동안 저장된 값은 보존됩니다.'
    : status?.freshness === 'stale'
      ? `${errorLabels[status.error_code] || '조회 실패'} · 마지막 정상값을 유지 중`
      : status?.freshness === 'fresh'
        ? '공개 원천의 응답을 정상적으로 확인했습니다.'
        : '아직 정상 조회가 없습니다.';
  $('refreshButton').disabled = liveBusy;
  $('refreshButton').textContent = liveBusy ? '조회 중…' : '지금 다시 조회';
  $('currentValue').textContent = reading ? formatNumber(reading.normalized_value) : '—';
  $('currentUnit').textContent = reading?.unit || '°C';
  const rawCurrent = sourceResponse?.current;
  const rawUnit = sourceResponse?.current_units?.temperature_2m || reading?.unit;
  $('rawValue').textContent = rawCurrent ? formatValue(rawCurrent.temperature_2m, rawUnit) : '—';
  $('storedValue').textContent = reading ? formatValue(reading.normalized_value, reading.unit) : '—';
  $('displayedValue').textContent = reading ? formatValue(reading.normalized_value, reading.unit) : '—';
  $('readingContext').textContent = reading
    ? `${formatDate(reading.record_date)} ${location.name} 기록 중 마지막 정상값입니다.`
    : '정상 응답을 받으면 값과 출처 시각을 함께 기록합니다.';
  const comparison = liveState.last_comparison;
  $('deltaBox').dataset.direction = comparison?.direction || 'none';
  $('deltaValue').textContent = formatDelta(comparison);
  $('deltaNote').textContent = comparison?.state === 'comparable'
    ? `${status?.freshness === 'stale' ? '마지막 정상 기록 기준 · ' : ''}선택한 지역의 이전 날짜 값에서 직접 계산했습니다.`
    : comparison?.state === 'unit_mismatch'
      ? '단위가 같은 기록을 찾지 못했습니다.'
      : '서로 다른 KST 날짜의 정상 기록 두 건이 생기면 계산합니다.';
  $('sourceTime').textContent = formatTime(reading?.source_time);
  $('fetchedTime').textContent = formatTime(reading?.fetched_at);
  $('recordTimezone').textContent = reading?.record_timezone || Core.TIMEZONE;
  $('recordDate').textContent = formatDate(reading?.record_date);
  const alerts = [];
  if (status?.freshness === 'stale') {
    const guidance = Core.errorGuidance(status.error_code, liveState.last_run?.retry_after_seconds);
    alerts.push([
      guidance.explanation,
      reading ? `마지막 정상값 ${formatValue(reading.normalized_value, reading.unit)}은 보존했습니다.` : '아직 보존된 정상값은 없습니다.',
      `다음 행동: ${guidance.next_action}`
    ].join(' '));
  }
  if (liveErrorMessage) alerts.push(liveErrorMessage);
  if (storageMessage) alerts.push(storageMessage);
  $('liveAlert').hidden = alerts.length === 0;
  $('liveAlert').textContent = alerts.join(' ');
  $('liveAlert').dataset.kind = status?.freshness === 'stale' ? 'error' : 'notice';
  renderHistory();
}

function classifyHttp(response) {
  if (response.status === 401 || response.status === 403) return 'auth';
  if (response.status === 429) return 'rate_limit';
  return 'schema_error';
}

function selectLocation(locationId) {
  const location = Core.locationFor(locationId);
  if (location.id === selectedLocationId) return;
  selectedLocationId = location.id;
  try { localStorage.setItem(LOCATION_KEY, selectedLocationId); }
  catch { storageMessage = '지역 선택을 이 브라우저에 저장하지 못했습니다.'; }
  const signalId = Core.signalIdFor(location.id);
  const rows = liveState.daily_readings.filter(row => row.signal_id === signalId);
  const currentRow = [...rows].sort((left, right) => right.record_date.localeCompare(left.record_date))[0] || null;
  liveState.current_reading = currentRow?.reading || null;
  liveState.current_source_response = currentRow?.source_response || null;
  liveState.status = liveState.status_by_signal?.[signalId] || (currentRow ? { freshness: 'fresh', error_code: 'none' } : null);
  liveState.last_comparison = currentRow ? Core.comparisonFor(rows, currentRow) : Core.resetEvaluationState().last_comparison;
  liveState.last_delta = liveState.last_comparison.magnitude;
  liveErrorMessage = '';
  renderLive();
  refreshLive();
}

async function refreshLive() {
  if (liveBusy) return;
  const requestLocationId = selectedLocationId;
  const requestSignalId = Core.signalIdFor(requestLocationId);
  const sourceUrl = Core.sourceUrlFor(requestLocationId);
  liveBusy = true;
  liveErrorMessage = '';
  renderLive();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    if (!navigator.onLine) {
      const error = new Error('기기가 오프라인 상태입니다. 인터넷에 연결한 뒤 다시 시도하세요.');
      error.code = 'offline';
      throw error;
    }
    let response;
    try {
      response = await fetch(sourceUrl, { cache: 'no-store', signal: controller.signal });
    } catch (cause) {
      const error = new Error(controller.signal.aborted ? '요청 시간이 초과되었습니다.' : '네트워크 연결 또는 브라우저 요청을 확인하세요.');
      error.code = controller.signal.aborted ? 'timeout' : 'offline';
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`Open-Meteo가 HTTP ${response.status}로 응답했습니다.`);
      error.code = classifyHttp(response);
      error.retryAfter = response.headers.get('retry-after');
      throw error;
    }
    let payload;
    try { payload = await response.json(); }
    catch { const error = new Error('출처 응답을 JSON으로 읽지 못했습니다.'); error.code = 'schema_error'; throw error; }
    let reading;
    try { reading = Core.normalizeOpenMeteo(payload, { fetchedAt: new Date().toISOString(), locationId: requestLocationId, sourceUrl }); }
    catch (cause) { const error = new Error(cause.message); error.code = 'schema_error'; throw error; }
    liveState = Core.applySuccessfulReading(liveState, reading, {
      virtual_now: reading.fetched_at,
      retry_after_seconds: null,
      source_response: payload
    });
    liveState.status_by_signal ||= {};
    liveState.status_by_signal[requestSignalId] = liveState.status;
    saveLiveState();
  } catch (error) {
    let code = error.code;
    if (!code && (error.name === 'AbortError' || controller.signal.aborted)) code = 'timeout';
    if (!Core.ERROR_CODES.includes(code)) code = 'schema_error';
    const retryAfter = Number(error.retryAfter);
    liveState = Core.applyError(liveState, code, {
      virtual_now: new Date().toISOString(),
      retry_after_seconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null
    });
    liveState.status_by_signal ||= {};
    liveState.status_by_signal[requestSignalId] = liveState.status;
    liveErrorMessage = error.message || '응답을 읽지 못했습니다.';
    saveLiveState();
  } finally {
    clearTimeout(timer);
    liveBusy = false;
    renderLive();
  }
}

function fixtureCheck(next, fixture, previous) {
  const expected = fixture.expected;
  const currentValue = next.current_reading?.normalized_value ?? null;
  const rowCount = next.daily_readings.length;
  const comparison = next.last_comparison?.state === 'comparable' ? next.last_comparison.magnitude : null;
  const checks = [
    next.status?.freshness === expected.freshness,
    next.status?.error_code === expected.error_code,
    rowCount === expected.row_count,
    currentValue === expected.stored_value,
    comparison === expected.delta
  ];
  if (expected.same_record_id_as && previous.daily_readings.length) {
    checks.push(next.daily_readings[0].record_id === previous.daily_readings[0].record_id);
  }
  if (expected.record_date) checks.push(next.current_reading?.record_date === expected.record_date);
  if (expected.preserve_last_good && expected.freshness === 'stale') {
    checks.push(next.current_reading?.normalized_value === previous.current_reading?.normalized_value);
  }
  if (fixture.fixture_id === 'T04-RECOVER-D2') checks.push(rowCount === previous.daily_readings.length + 1);
  const passedCount = checks.filter(Boolean).length;
  return { passed: passedCount === checks.length, passedCount, total: checks.length };
}

async function loadFixture(fixtureId) {
  const file = fixtureFiles[fixtureId];
  if (!file) throw new Error(`fixture를 찾을 수 없습니다: ${fixtureId}`);
  const response = await fetch(`${FIXTURE_ROOT}${file}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`fixture ${fixtureId} 로드 실패 (HTTP ${response.status})`);
  return response.json();
}

function renderFixture() {
  const status = fixtureState.status;
  $('fixtureStatus').textContent = status
    ? `${status.freshness} / ${status.error_code}`
    : '초기화됨';
  $('fixtureStatus').dataset.status = status?.freshness || 'empty';
  const value = fixtureState.current_reading;
  if (!$('fixtureLog').children.length) {
    $('fixtureSummary').textContent = value
      ? `합성 마지막 정상값 ${formatValue(value.normalized_value, value.unit)} · 합성 기록 ${fixtureState.daily_readings.length}건`
      : '시작 전 상태입니다. 재생 버튼을 누르면 합성 값만 사용합니다.';
  }
  const metrics = $('fixtureMetrics');
  metrics.replaceChildren();
  const entries = [
    ['마지막 정상값', value ? formatValue(value.normalized_value, value.unit) : '없음'],
    ['일별 행 수', `${fixtureState.daily_readings.length}건`],
    ['전일 대비', formatDelta(fixtureState.last_comparison)]
  ];
  for (const [label, content] of entries) {
    const item = document.createElement('div'); item.className = 'fixture-metric';
    const name = document.createElement('span'); name.textContent = label;
    const result = document.createElement('strong'); result.textContent = content;
    item.append(name, result); metrics.appendChild(item);
  }
}

async function replayFixtures(ids, title) {
  if (fixtureBusy) return;
  fixtureBusy = true;
  $('fixtureStatus').textContent = 'fixture 불러오는 중';
  document.querySelectorAll('[data-fixture-action], [data-failure]').forEach(button => { button.disabled = true; });
  const log = [];
  $('fixtureLog').replaceChildren();
  fixtureState = Core.resetEvaluationState();
  try {
    for (const id of ids) {
      const fixture = await loadFixture(id);
      const previous = fixtureState;
      const next = Core.runFixture(previous, fixture);
      const verdict = fixtureCheck(next, fixture, previous);
      fixtureState = next;
      log.push({ id, description: fixture.description_ko, passed: verdict.passed, passedCount: verdict.passedCount, total: verdict.total });
    }
    renderFixtureLog(title, log);
  } catch (error) {
    renderFixtureLog('fixture 재생 실패', [{ id: 'LOAD-ERROR', description: error.message, passed: false, passedCount: 0, total: 0 }]);
  } finally {
    fixtureBusy = false;
    document.querySelectorAll('[data-fixture-action], [data-failure]').forEach(button => { button.disabled = false; });
    renderFixture();
  }
}

function renderFixtureLog(title, entries) {
  const status = fixtureState.status;
  if (status?.freshness === 'stale') {
    const guidance = Core.errorGuidance(status.error_code, fixtureState.last_run?.retry_after_seconds);
    $('fixtureSummary').textContent = `${title} · ${guidance.explanation} 다음 행동: ${guidance.next_action}`;
  } else {
    $('fixtureSummary').textContent = title;
  }
  const list = $('fixtureLog'); list.replaceChildren();
  for (const entry of entries) {
    const item = document.createElement('li');
    item.className = entry.passed ? 'pass' : 'fail';
    item.textContent = `${entry.passed ? 'PASS' : 'FAIL'} · ${entry.id} · ${entry.description} · ${entry.passedCount}/${entry.total}`;
    list.appendChild(item);
  }
}

$('refreshButton').addEventListener('click', refreshLive);
$('locationSelect').addEventListener('change', event => selectLocation(event.target.value));
$('runNormal').addEventListener('click', () => replayFixtures(['T04-NORMAL-D1-A', 'T04-NORMAL-D1-B', 'T04-NORMAL-D2'], '정상 일별 저장 시퀀스 · 합성 전용'));
$('runRecovery').addEventListener('click', () => replayFixtures(['T04-NORMAL-D1-A', 'T04-NORMAL-D1-B', 'T04-TIMEOUT', 'T04-RECOVER-D2'], '오류 후 회복 시퀀스 · 합성 전용'));
$('resetFixtures').addEventListener('click', () => {
  if (fixtureBusy) return;
  fixtureState = Core.resetEvaluationState();
  $('fixtureLog').replaceChildren();
  renderFixture();
});
document.querySelectorAll('[data-failure]').forEach(button => {
  button.addEventListener('click', () => replayFixtures([
    'T04-NORMAL-D1-A', 'T04-NORMAL-D1-B', button.dataset.failure
  ], `${button.textContent.trim()} · 마지막 정상값 보존 시험 · 합성 전용`));
});

let sharedLog = null;

async function loadSharedLog() {
  try {
    const response = await fetch('data/daily.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (json?.schema_version !== Core.SHARED_LOG_SCHEMA || !Array.isArray(json.readings)) throw new Error('공유 기록 형식이 다릅니다.');
    sharedLog = json;
  } catch {
    sharedLog = null;
  }
  renderShared();
}

function renderShared() {
  const body = $('sharedRows');
  body.replaceChildren();
  const readings = sharedLog?.readings || [];
  let count = 0;
  for (const location of Core.LOCATIONS) {
    const signalId = Core.signalIdFor(location.id);
    const rows = readings.filter(row => row.signal_id === signalId)
      .sort((left, right) => left.record_date.localeCompare(right.record_date));
    count += rows.length;
    const latest = rows[rows.length - 1] || null;
    const comparison = latest ? Core.comparisonFor(rows, latest) : null;
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    const date = document.createElement('td');
    const value = document.createElement('td');
    const delta = document.createElement('td');
    const total = document.createElement('td');
    name.textContent = location.name;
    date.textContent = latest ? formatDate(latest.record_date) : '—';
    value.textContent = latest ? formatValue(latest.normalized_value, latest.unit) : '—';
    delta.textContent = comparison ? formatDelta(comparison) : '—';
    total.textContent = `${rows.length}일`;
    tr.append(name, date, value, delta, total);
    body.appendChild(tr);
  }
  $('sharedCount').textContent = `${count}건`;
  $('sharedEmpty').hidden = count > 0;
  $('sharedMeta').textContent = sharedLog?.generated_at
    ? `마지막 수집 ${formatTime(sharedLog.generated_at)} · GitHub Actions가 저장소에 커밋한 공용 파일입니다.`
    : '공유 기록 파일을 아직 불러오지 못했습니다. 첫 수집 후 표시됩니다.';
}

function runEvidenceCheck() {
  const report = Core.evidenceReportFor(liveState.daily_readings, { signalId: Core.signalIdFor(selectedLocationId) });
  const list = $('evidenceLog');
  list.replaceChildren();
  if (!report.signals.length) {
    $('evidenceStatus').textContent = '기록 없음';
    $('evidenceSummary').textContent = '이 브라우저에 보존된 실제 일별 기록이 없습니다. 먼저 정상 조회를 실행하세요.';
    $('receiptPreview').hidden = true;
    return;
  }
  for (const signal of report.signals) {
    const item = document.createElement('li');
    item.className = signal.ready ? 'pass' : 'fail';
    item.textContent = `${signal.location_name} · 날짜 ${signal.dates.length}건 · ${signal.ready ? 'C22~C24 시뮬레이션 통과' : '증거 부족'}`;
    list.appendChild(item);
    for (const check of signal.checks) {
      const detail = document.createElement('li');
      detail.className = check.ok ? 'pass' : 'fail';
      detail.textContent = `   ${check.ok ? 'PASS' : 'FAIL'} ${check.id} — ${check.detail}`;
      list.appendChild(detail);
    }
  }
  const primary = report.primary;
  $('evidenceStatus').textContent = primary?.ready ? `${primary.location_name} · 증거 요건 충족` : '증거 부족';
  $('evidenceSummary').textContent = primary?.ready
    ? `${primary.location_name}의 ${primary.dates.slice(-2).join(' · ')} 기록으로 영수증 2건을 봉인할 수 있는 상태입니다. 실제 봉인과 server_created_at은 제출 과정에서 부여됩니다.`
    : '같은 지역의 서로 다른 KST 날짜 실제 기록 2건이 아직 없습니다. 날짜가 바뀐 뒤 같은 지역을 한 번 더 정상 조회하세요.';
  const preview = $('receiptPreview');
  if (primary?.receipts?.length) {
    preview.hidden = false;
    preview.textContent = JSON.stringify(primary.receipts, null, 2);
  } else {
    preview.hidden = true;
    preview.textContent = '';
  }
}

$('runEvidence').addEventListener('click', runEvidenceCheck);
$('copyEvidence').addEventListener('click', async () => {
  const payload = JSON.stringify({ saved_at: new Date().toISOString(), live: liveState }, null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    $('evidenceSummary').textContent = '상태 JSON을 클립보드에 복사했습니다. 파일로 저장해 scripts/check-evidence.mjs에 넘기면 같은 점검을 실행합니다.';
  } catch {
    $('evidenceSummary').textContent = '클립보드 복사가 차단되었습니다. 브라우저 개발자 도구에서 localStorage 값을 확인하세요.';
  }
});

renderLive();
renderFixture();
refreshLive();
loadSharedLog();
