'use strict';

// T05 고정 검사 10개 — 2026-10-08 작업 시작 전 등록 (삭제·완화·기대값 변경 금지)
// 대상 기능: 공유 기록 표의 지역별 최저·최고·전일 대비 추세 요약
// 명세: ai-handoff-report 저장소의 FIXED-TESTS.md

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./core.js');

const ROWS_INCREASE = [
  { signal_id: 's', record_date: '2026-10-07', normalized_value: 18.3, unit: '°C' },
  { signal_id: 's', record_date: '2026-10-08', normalized_value: 20.6, unit: '°C' }
];

test('F01 count: 같은 signal_id의 행 수를 센다', () => {
  const stats = core.sharedStatsFor(ROWS_INCREASE, 's');
  assert.equal(stats.count, 2);
});

test('F02 min: 지역별 최저값을 구한다', () => {
  const stats = core.sharedStatsFor(ROWS_INCREASE, 's');
  assert.equal(stats.min, 18.3);
});

test('F03 max: 지역별 최고값을 구한다', () => {
  const stats = core.sharedStatsFor(ROWS_INCREASE, 's');
  assert.equal(stats.max, 20.6);
});

test('F04 latest: 가장 최근 record_date의 값을 돌려준다', () => {
  const stats = core.sharedStatsFor(ROWS_INCREASE, 's');
  assert.equal(stats.latest, 20.6);
});

test('F05 delta increase: 전일 대비 상승과 크기·단위', () => {
  const stats = core.sharedStatsFor(ROWS_INCREASE, 's');
  assert.equal(stats.delta.direction, 'increase');
  assert.ok(Math.abs(stats.delta.magnitude - 2.3) < 0.001);
  assert.equal(stats.delta.unit, '°C');
});

test('F06 delta decrease: 전일 대비 하락', () => {
  const stats = core.sharedStatsFor([
    { signal_id: 's', record_date: '2026-10-07', normalized_value: 10.0, unit: '°C' },
    { signal_id: 's', record_date: '2026-10-08', normalized_value: 8.0, unit: '°C' }
  ], 's');
  assert.equal(stats.delta.direction, 'decrease');
  assert.equal(stats.delta.magnitude, 2);
});

test('F07 delta unchanged: 전일과 같은 값', () => {
  const stats = core.sharedStatsFor([
    { signal_id: 's', record_date: '2026-10-07', normalized_value: 7.5, unit: '°C' },
    { signal_id: 's', record_date: '2026-10-08', normalized_value: 7.5, unit: '°C' }
  ], 's');
  assert.equal(stats.delta.direction, 'unchanged');
  assert.equal(stats.delta.magnitude, 0);
});

test('F08 insufficient: 기록이 1건뿐이면 전일 대비를 계산하지 않는다', () => {
  const stats = core.sharedStatsFor([
    { signal_id: 's', record_date: '2026-10-08', normalized_value: 20.6, unit: '°C' }
  ], 's');
  assert.equal(stats.delta.direction, 'insufficient');
});

test('F09 cells: 요약 셀 문자열을 만든다', () => {
  const stats = core.sharedStatsFor(ROWS_INCREASE, 's');
  assert.deepEqual(core.sharedStatsCells(stats), {
    min: '18.3°C',
    max: '20.6°C',
    trend: '▲ +2.3°C'
  });
});

test('F10 cells empty: 기록이 없으면 세 셸 모두 대시', () => {
  const stats = core.sharedStatsFor([], 's');
  assert.deepEqual(core.sharedStatsCells(stats), {
    min: '—',
    max: '—',
    trend: '—'
  });
});
