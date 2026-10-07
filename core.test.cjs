'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync, statSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Core = require('./core.js');

const packageRoot = path.join(__dirname, 'assets', 'studio-task-assets', 't04-real-information-board');
const fixtureRoot = path.join(packageRoot, 'fixtures');
const fixture = name => JSON.parse(readFileSync(path.join(fixtureRoot, name), 'utf8'));
const run = (state, name) => Core.runFixture(state, fixture(name));

function successBaseline() {
  let state = Core.resetEvaluationState();
  state = run(state, 'normal-d1-a.json');
  state = run(state, 'normal-d1-b.json');
  return state;
}

test('all extracted public fixture files match the SHA-256 asset manifest', () => {
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'asset-manifest.json'), 'utf8'));
  assert.equal(manifest.package_id, 'aleph-t04-real-information-board-public-contract-v2');
  for (const entry of manifest.files) {
    const filePath = path.join(packageRoot, entry.path);
    const content = readFileSync(filePath);
    assert.equal(statSync(filePath).size, entry.bytes, `${entry.path} byte count`);
    assert.equal(createHash('sha256').update(content).digest('hex'), entry.sha256, `${entry.path} SHA-256`);
  }
});

test('live Open-Meteo data normalizes source time and KST record date without extra fields', () => {
  const reading = Core.normalizeOpenMeteo({
    timezone: 'Asia/Seoul',
    current_units: { temperature_2m: '°C' },
    current: { time: '2026-08-24T17:00', temperature_2m: 28.4 }
  }, { fetchedAt: '2026-08-24T14:59:00.000Z' });
  assert.deepEqual(Object.keys(reading).sort(), [...Core.NORMALIZED_KEYS].sort());
  assert.equal(reading.signal_id, 'seoul.temperature_2m');
  assert.equal(reading.normalized_value, 28.4);
  assert.equal(reading.source_time, '2026-08-24T08:00:00.000Z');
  assert.equal(reading.record_date, '2026-08-24');
  assert.equal(reading.record_timezone, 'Asia/Seoul');
});

test('raw source response matches the normalized value saved for the day', () => {
  const raw = {
    timezone: 'Asia/Seoul',
    current_units: { temperature_2m: '°C' },
    current: { time: '2026-08-24T17:00', temperature_2m: 28.4 }
  };
  const reading = Core.normalizeOpenMeteo(raw, { fetchedAt: '2026-08-24T14:59:00.000Z' });
  const state = Core.applySuccessfulReading(Core.resetEvaluationState(), reading, { source_response: raw });
  const row = state.daily_readings[0];
  assert.equal(row.source_response.current.temperature_2m, row.normalized_value);
  assert.equal(state.current_source_response.current.temperature_2m, state.current_reading.normalized_value);
});

test('same KST day updates one row and preserves its record id', () => {
  const state = successBaseline();
  assert.equal(state.daily_readings.length, 1);
  assert.equal(state.daily_readings[0].normalized_value, 105);
  assert.equal(state.daily_readings[0].record_id, 'demo-aleph-demo-index-2026-08-24');
  assert.equal(state.current_reading.normalized_value, 105);
  assert.equal(state.status.freshness, 'fresh');
  assert.equal(state.status.error_code, 'none');
});

test('next KST date adds one row and recomputes the difference from saved values', () => {
  const state = run(successBaseline(), 'normal-d2.json');
  assert.equal(state.daily_readings.length, 2);
  assert.deepEqual(state.daily_readings.map(row => row.normalized_value), [105, 120]);
  assert.equal(state.last_comparison.direction, 'increase');
  assert.equal(state.last_delta, 15);
});

test('every external failure preserves the last good record and marks it stale', () => {
  const baseline = successBaseline();
  const cases = [
    ['timeout.json', 'timeout'],
    ['auth-401.json', 'auth'],
    ['rate-429.json', 'rate_limit'],
    ['offline.json', 'offline'],
    ['schema-break.json', 'schema_error']
  ];
  for (const [name, code] of cases) {
    const state = run(baseline, name);
    assert.equal(state.status.freshness, 'stale', name);
    assert.equal(state.status.error_code, code, name);
    assert.equal(state.daily_readings.length, 1, name);
    assert.equal(state.current_reading.normalized_value, 105, name);
    assert.equal(state.daily_readings[0].record_id, baseline.daily_readings[0].record_id, name);
  }
});

test('retry after a synthetic failure returns to fresh and adds exactly one next-day row', () => {
  let state = successBaseline();
  state = run(state, 'timeout.json');
  assert.equal(state.status.freshness, 'stale');
  state = run(state, 'recover-d2.json');
  assert.equal(state.status.freshness, 'fresh');
  assert.equal(state.status.error_code, 'none');
  assert.equal(state.daily_readings.length, 2);
  assert.equal(state.daily_readings[1].record_date, '2026-08-25');
  assert.equal(state.current_reading.normalized_value, 120);
  assert.equal(state.last_delta, 15);
});
