(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.T04Core = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const TIMEZONE = 'Asia/Seoul';
  const SIGNAL_ID = 'seoul.temperature_2m';
  const SOURCE_NAME = 'Open-Meteo · 서울 현재 기온';
  const SOURCE_URL = 'https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current=temperature_2m&timezone=Asia%2FSeoul';
  const NORMALIZED_KEYS = Object.freeze([
    'signal_id', 'normalized_value', 'unit', 'source_name', 'source_url',
    'source_time', 'fetched_at', 'record_timezone', 'record_date'
  ]);
  const ERROR_CODES = Object.freeze(['timeout', 'auth', 'rate_limit', 'offline', 'schema_error']);

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
    const reading = {
      signal_id: SIGNAL_ID,
      normalized_value: value,
      unit,
      source_name: SOURCE_NAME,
      source_url: options.sourceUrl || SOURCE_URL,
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

  return Object.freeze({
    ERROR_CODES, NORMALIZED_KEYS, SOURCE_NAME, SOURCE_URL, TIMEZONE, SIGNAL_ID,
    applyError, applySuccessfulReading, comparisonFor, kstDate, normalizeOpenMeteo,
    recordIdFor, resetEvaluationState, runFixture, validateNormalizedReading, validateStatus
  });
});
