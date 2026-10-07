(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.T04Core = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const TIMEZONE = 'Asia/Seoul';
  const DEFAULT_LOCATION_ID = 'seoul';
  const LOCATIONS = Object.freeze([
    Object.freeze({ id: 'seoul', name: '서울', label: '서울시청 중심 좌표', latitude: 37.5665, longitude: 126.9780 }),
    Object.freeze({ id: 'busan', name: '부산', label: '부산시청 중심 좌표', latitude: 35.1796, longitude: 129.0756 }),
    Object.freeze({ id: 'incheon', name: '인천', label: '인천시청 중심 좌표', latitude: 37.4563, longitude: 126.7052 }),
    Object.freeze({ id: 'daegu', name: '대구', label: '대구시청 중심 좌표', latitude: 35.8714, longitude: 128.6014 }),
    Object.freeze({ id: 'daejeon', name: '대전', label: '대전시청 중심 좌표', latitude: 36.3504, longitude: 127.3845 }),
    Object.freeze({ id: 'gwangju', name: '광주', label: '광주시청 중심 좌표', latitude: 35.1595, longitude: 126.8526 }),
    Object.freeze({ id: 'jeju', name: '제주', label: '제주시청 중심 좌표', latitude: 33.4996, longitude: 126.5312 })
  ]);

  function locationFor(id = DEFAULT_LOCATION_ID) {
    return LOCATIONS.find(location => location.id === id) || LOCATIONS[0];
  }

  function signalIdFor(locationId = DEFAULT_LOCATION_ID) {
    return `${locationFor(locationId).id}.temperature_2m`;
  }

  function sourceUrlFor(locationId = DEFAULT_LOCATION_ID) {
    const location = locationFor(locationId);
    const query = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: 'temperature_2m',
      timezone: TIMEZONE
    });
    return `https://api.open-meteo.com/v1/forecast?${query}`;
  }

  const SIGNAL_ID = signalIdFor();
  const SOURCE_NAME = `Open-Meteo · ${locationFor().name} 현재 기온`;
  const SOURCE_URL = sourceUrlFor();
  const NORMALIZED_KEYS = Object.freeze([
    'signal_id', 'normalized_value', 'unit', 'source_name', 'source_url',
    'source_time', 'fetched_at', 'record_timezone', 'record_date'
  ]);
  const ERROR_CODES = Object.freeze(['timeout', 'auth', 'rate_limit', 'offline', 'schema_error']);
  const ERROR_GUIDANCE = Object.freeze({
    timeout: Object.freeze({
      explanation: '정해진 대기 시간 안에 공개 원천 응답이 오지 않았습니다.',
      next_action: '잠시 기다린 뒤 ‘지금 다시 조회’를 누르세요.'
    }),
    auth: Object.freeze({
      explanation: '공개 원천이 HTTP 401 또는 403으로 요청을 거부했습니다.',
      next_action: '로그인 정보를 입력하지 말고 출처 서비스 상태와 요청 주소를 확인한 뒤 다시 조회하세요.'
    }),
    rate_limit: Object.freeze({
      explanation: '공개 원천이 HTTP 429 호출 제한을 보냈습니다.',
      next_action: '요청을 반복하지 말고 잠시 기다린 뒤 다시 조회하세요.'
    }),
    offline: Object.freeze({
      explanation: '브라우저가 네트워크에 연결되지 않았습니다.',
      next_action: '인터넷 연결을 복구한 뒤 다시 조회하세요.'
    }),
    schema_error: Object.freeze({
      explanation: '응답에서 필요한 기온 값·단위·시각을 읽지 못했습니다.',
      next_action: '마지막 정상값을 참고하고 출처 응답 형식이 회복된 뒤 다시 조회하세요.'
    })
  });

  function errorGuidance(errorCode, retryAfterSeconds = null) {
    const guidance = ERROR_GUIDANCE[errorCode] || ERROR_GUIDANCE.schema_error;
    const retryAfter = Number(retryAfterSeconds);
    if (errorCode === 'rate_limit' && Number.isFinite(retryAfter) && retryAfter > 0) {
      return {
        ...guidance,
        next_action: `Retry-After에 안내된 약 ${Math.ceil(retryAfter)}초를 기다린 뒤 다시 조회하세요.`
      };
    }
    return guidance;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function kstDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError('날짜 시각을 해석할 수 없습니다.');
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${fields.year}-${fields.month}-${fields.day}`;
  }

  function sourceTimeIso(localTime) {
    if (typeof localTime !== 'string') throw new TypeError('출처 시각이 없습니다.');
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?$/.exec(localTime);
    if (!match) throw new TypeError('출처 시각 형식이 바뀌었습니다.');
    const value = new Date(`${match[1]}:${match[2] || '00'}+09:00`);
    if (Number.isNaN(value.getTime())) throw new TypeError('출처 시각이 올바르지 않습니다.');
    return value.toISOString();
  }

  function normalizeOpenMeteo(payload, options = {}) {
    if (!payload || payload.timezone !== TIMEZONE || !payload.current || !payload.current_units) {
      throw new TypeError('응답 형식이 Open-Meteo 현재 기온 형식과 다릅니다.');
    }
    const value = payload.current.temperature_2m;
    const unit = payload.current_units.temperature_2m;
    if (typeof value !== 'number' || !Number.isFinite(value) || unit !== '°C') {
      throw new TypeError('기온 값 또는 단위가 올바르지 않습니다.');
    }
    const fetchedAt = options.fetchedAt || new Date().toISOString();
    const location = locationFor(options.locationId);
    const reading = {
      signal_id: signalIdFor(location.id),
      normalized_value: value,
      unit,
      source_name: options.sourceName || `Open-Meteo · ${location.name} 현재 기온`,
      source_url: options.sourceUrl || sourceUrlFor(location.id),
      source_time: sourceTimeIso(payload.current.time),
      fetched_at: fetchedAt,
      record_timezone: TIMEZONE,
      record_date: kstDate(fetchedAt)
    };
    validateNormalizedReading(reading);
    return reading;
  }

  function validateNormalizedReading(reading) {
    if (!reading || typeof reading !== 'object' || Array.isArray(reading)) throw new TypeError('정규화 값은 객체여야 합니다.');
    const keys = Object.keys(reading).sort();
    const expected = [...NORMALIZED_KEYS].sort();
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
      throw new TypeError('정규화 값의 필드 구성이 다릅니다.');
    }
    if (typeof reading.signal_id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(reading.signal_id)) throw new TypeError('signal_id가 올바르지 않습니다.');
    if (typeof reading.normalized_value !== 'number' || !Number.isFinite(reading.normalized_value)) throw new TypeError('값은 유한한 숫자여야 합니다.');
    for (const key of ['unit', 'source_name']) if (typeof reading[key] !== 'string' || !reading[key].trim()) throw new TypeError(`${key}가 비어 있습니다.`);
    let sourceUrl;
    try { sourceUrl = new URL(reading.source_url); } catch { throw new TypeError('출처 URL을 해석할 수 없습니다.'); }
    if (sourceUrl.protocol !== 'https:') throw new TypeError('출처 URL은 HTTPS여야 합니다.');
    if (reading.source_time !== null && Number.isNaN(Date.parse(reading.source_time))) throw new TypeError('출처 시각을 해석할 수 없습니다.');
    if (Number.isNaN(Date.parse(reading.fetched_at))) throw new TypeError('조회 시각을 해석할 수 없습니다.');
    if (reading.record_timezone !== TIMEZONE || !/^\d{4}-\d{2}-\d{2}$/.test(reading.record_date) || reading.record_date !== kstDate(reading.fetched_at)) {
      throw new TypeError('일별 기록 날짜가 Asia/Seoul 조회 날짜와 다릅니다.');
    }
    return true;
  }

  function resetEvaluationState() {
    return {
      schema_version: 'aleph-t04-evaluation-state-v1',
      daily_readings: [],
      current_reading: null,
      current_source_response: null,
      status: null,
      last_delta: null,
      last_comparison: { state: 'insufficient', direction: null, magnitude: null, unit: null },
      last_run: null,
      sequence: 0
    };
  }

  function recordIdFor(reading) {
    return `demo-${reading.signal_id}-${reading.record_date}`;
  }

  function comparisonFor(rows, current) {
    const previous = rows
      .filter(row => row.signal_id === current.signal_id && row.record_date < current.record_date)
      .sort((left, right) => right.record_date.localeCompare(left.record_date))[0];
    if (!previous) return { state: 'insufficient', direction: null, magnitude: null, unit: null };
    if (previous.unit !== current.unit) return { state: 'unit_mismatch', direction: null, magnitude: null, unit: null };
    const difference = current.normalized_value - previous.normalized_value;
    return {
      state: 'comparable',
      direction: difference > 0 ? 'increase' : difference < 0 ? 'decrease' : 'unchanged',
      magnitude: Math.abs(difference),
      unit: current.unit
    };
  }

  function applySuccessfulReading(inputState, reading, runMeta = {}) {
    validateNormalizedReading(reading);
    const state = clone(inputState);
    const existingIndex = state.daily_readings.findIndex(row => row.signal_id === reading.signal_id && row.record_date === reading.record_date);
    const existing = existingIndex >= 0 ? state.daily_readings[existingIndex] : null;
    const row = {
      record_id: existing ? existing.record_id : recordIdFor(reading),
      signal_id: reading.signal_id,
      record_date: reading.record_date,
      normalized_value: reading.normalized_value,
      unit: reading.unit,
      first_fetched_at: existing ? existing.first_fetched_at : reading.fetched_at,
      last_fetched_at: reading.fetched_at,
      reading: clone(reading),
      source_response: runMeta.source_response ? clone(runMeta.source_response) : null
    };
    if (existingIndex >= 0) state.daily_readings[existingIndex] = row;
    else state.daily_readings.push(row);
    state.daily_readings.sort((left, right) => left.record_date.localeCompare(right.record_date));
    state.current_reading = clone(reading);
    state.current_source_response = runMeta.source_response ? clone(runMeta.source_response) : null;
    state.status = { freshness: 'fresh', error_code: 'none' };
    state.last_comparison = comparisonFor(state.daily_readings, row);
    state.last_delta = state.last_comparison.magnitude;
    state.sequence += 1;
    state.last_run = {
      fixture_id: runMeta.fixture_id || null,
      virtual_now: runMeta.virtual_now || reading.fetched_at,
      outcome: 'success',
      error_code: 'none',
      retry_after_seconds: runMeta.retry_after_seconds ?? null
    };
    return state;
  }

  function applyError(inputState, errorCode, runMeta = {}) {
    if (!ERROR_CODES.includes(errorCode)) throw new TypeError(`지원하지 않는 오류 상태입니다: ${errorCode}`);
    const state = clone(inputState);
    state.status = { freshness: 'stale', error_code: errorCode };
    state.sequence += 1;
    state.last_run = {
      fixture_id: runMeta.fixture_id || null,
      virtual_now: runMeta.virtual_now || null,
      outcome: 'error',
      error_code: errorCode,
      retry_after_seconds: runMeta.retry_after_seconds ?? null
    };
    return state;
  }

  function runFixture(inputState, fixture) {
    const retryAfter = fixture.transport.headers['retry-after'];
    const meta = {
      fixture_id: fixture.fixture_id,
      virtual_now: fixture.virtual_now,
      retry_after_seconds: retryAfter ? Number(retryAfter) : null,
      source_response: fixture.payload
    };
    if (fixture.transport.mode === 'timeout') return applyError(inputState, 'timeout', meta);
    if (fixture.transport.mode === 'offline') return applyError(inputState, 'offline', meta);
    if (fixture.transport.status === 401 || fixture.transport.status === 403) return applyError(inputState, 'auth', meta);
    if (fixture.transport.status === 429) return applyError(inputState, 'rate_limit', meta);
    if (fixture.transport.status >= 200 && fixture.transport.status < 300) {
      try { return applySuccessfulReading(inputState, fixture.payload, meta); }
      catch { return applyError(inputState, 'schema_error', meta); }
    }
    return applyError(inputState, 'schema_error', meta);
  }

  function validateStatus(status) {
    if (!status || typeof status !== 'object') return false;
    if (status.freshness === 'fresh') return status.error_code === 'none';
    if (status.freshness === 'stale') return ERROR_CODES.includes(status.error_code);
    return false;
  }

  const SHARED_LOG_SCHEMA = 'aleph-t04-shared-daily-v1';

  function emptySharedLog() {
    return {
      schema_version: SHARED_LOG_SCHEMA,
      generated_at: null,
      collector: 'github-actions-schedule',
      source: 'Open-Meteo current.temperature_2m',
      readings: []
    };
  }

  function upsertSharedRow(inputLog, reading) {
    validateNormalizedReading(reading);
    const log = { ...(inputLog || emptySharedLog()), readings: [...(inputLog?.readings || [])] };
    const index = log.readings.findIndex(row => row.signal_id === reading.signal_id && row.record_date === reading.record_date);
    const existing = index >= 0 ? log.readings[index] : null;
    const row = {
      record_id: existing ? existing.record_id : `shared-${reading.signal_id}-${reading.record_date}`,
      signal_id: reading.signal_id,
      record_date: reading.record_date,
      normalized_value: reading.normalized_value,
      unit: reading.unit,
      source_url: reading.source_url,
      source_time: reading.source_time,
      first_fetched_at: existing ? existing.first_fetched_at : reading.fetched_at,
      last_fetched_at: reading.fetched_at
    };
    if (index >= 0) log.readings[index] = row;
    else log.readings.push(row);
    log.readings.sort((left, right) =>
      left.signal_id.localeCompare(right.signal_id) || left.record_date.localeCompare(right.record_date));
    return log;
  }

  function receiptPayloadFor(row) {
    return {
      kind: 't04_day',
      payload: {
        signal_id: row.signal_id,
        record_date: row.record_date,
        source_url: row.reading.source_url,
        source_observed_at: row.reading.source_time,
        normalized_value: row.normalized_value,
        unit: row.unit
      },
      server_created_at: null,
      simulated_server_date: row.record_date
    };
  }

  function signalLocationName(signalId) {
    const location = LOCATIONS.find(item => signalIdFor(item.id) === signalId);
    return location ? location.name : signalId;
  }

  function evidenceReportFor(rows, options = {}) {
    const bySignal = new Map();
    for (const row of rows || []) {
      if (!row || typeof row.signal_id !== 'string' || !row.reading) continue;
      if (!bySignal.has(row.signal_id)) bySignal.set(row.signal_id, []);
      bySignal.get(row.signal_id).push(row);
    }
    const signals = [...bySignal.entries()].map(([signalId, list]) => {
      const ordered = [...list].sort((left, right) => left.record_date.localeCompare(right.record_date));
      const dates = [...new Set(ordered.map(row => row.record_date))];
      const report = {
        signal_id: signalId,
        location_name: signalLocationName(signalId),
        dates,
        row_count: ordered.length,
        ready: false,
        checks: [],
        receipts: [],
        recomputed_delta: null
      };
      if (dates.length < 2) {
        report.checks.push({ id: 'T04-C22', ok: false, detail: `같은 지역의 서로 다른 KST 날짜 기록이 ${dates.length}건뿐입니다.` });
        return report;
      }
      const previous = ordered[ordered.length - 2];
      const current = ordered[ordered.length - 1];
      report.checks.push({
        id: 'T04-C22',
        ok: previous.record_date !== current.record_date,
        detail: `${previous.record_date}와 ${current.record_date}, 서로 다른 KST 날짜 2건`
      });
      const fieldsMatch = [previous, current].every(row =>
        row.normalized_value === row.reading.normalized_value &&
        row.unit === row.reading.unit &&
        typeof row.reading.source_url === 'string' && row.reading.source_url.startsWith('https://') &&
        !Number.isNaN(Date.parse(row.reading.source_time)));
      report.checks.push({
        id: 'T04-C23',
        ok: fieldsMatch,
        detail: fieldsMatch
          ? '영수증 payload 필드가 일별 저장값·화면값과 일치합니다.'
          : '영수증 payload 필드와 저장값이 다릅니다.'
      });
      const comparison = comparisonFor(ordered, current);
      const recomputed = current.normalized_value - previous.normalized_value;
      const deltaOk = comparison.state === 'comparable' && Math.abs(Math.abs(recomputed) - comparison.magnitude) < 1e-9;
      const magnitude = Math.abs(recomputed);
      const shown = Number(magnitude.toFixed(6));
      report.recomputed_delta = {
        direction: recomputed > 0 ? 'increase' : recomputed < 0 ? 'decrease' : 'unchanged',
        magnitude,
        unit: current.unit
      };
      report.checks.push({
        id: 'T04-C24',
        ok: deltaOk,
        detail: deltaOk
          ? `두 실제 값으로 다시 계산한 변화량 ${shown} ${current.unit}이 화면 계산과 일치합니다.`
          : '두 실제 값으로 다시 계산한 변화량과 화면 계산이 다릅니다.'
      });
      report.receipts = [receiptPayloadFor(previous), receiptPayloadFor(current)];
      report.ready = report.checks.every(check => check.ok);
      return report;
    });
    const preferredId = options.signalId;
    const primary = signals.find(signal => signal.signal_id === preferredId && signal.ready)
      || signals.find(signal => signal.ready)
      || signals.find(signal => signal.signal_id === preferredId)
      || signals[0]
      || null;
    return {
      generated_at: new Date().toISOString(),
      ready_signals: signals.filter(signal => signal.ready).map(signal => signal.signal_id),
      primary,
      signals
    };
  }

  return Object.freeze({
    DEFAULT_LOCATION_ID, ERROR_CODES, LOCATIONS, NORMALIZED_KEYS, SHARED_LOG_SCHEMA, SOURCE_NAME, SOURCE_URL, TIMEZONE, SIGNAL_ID,
    applyError, applySuccessfulReading, comparisonFor, emptySharedLog, errorGuidance, evidenceReportFor, kstDate,
    locationFor, normalizeOpenMeteo, receiptPayloadFor, recordIdFor, resetEvaluationState, runFixture,
    signalIdFor, sourceUrlFor, upsertSharedRow, validateNormalizedReading, validateStatus
  });
});
