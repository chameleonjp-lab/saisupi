import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SaisupiClock,
  formatScoreCentiseconds,
  scoreCentisecondsFromElapsedMs
} from '../js/saisupi-clock.js';

test('経過ミリ秒を0.01秒単位へ切り捨てる', () => {
  assert.equal(scoreCentisecondsFromElapsedMs(0), 0);
  assert.equal(scoreCentisecondsFromElapsedMs(9), 0);
  assert.equal(scoreCentisecondsFromElapsedMs(10), 1);
  assert.equal(scoreCentisecondsFromElapsedMs(19), 1);
  assert.equal(scoreCentisecondsFromElapsedMs(12349), 1234);
  assert.equal(scoreCentisecondsFromElapsedMs(12350), 1235);
  assert.equal(scoreCentisecondsFromElapsedMs(99999), 9999);
  assert.equal(scoreCentisecondsFromElapsedMs(100000), 10000);
  assert.equal(scoreCentisecondsFromElapsedMs(-1), null);
  assert.equal(scoreCentisecondsFromElapsedMs(Number.NaN), null);
  assert.equal(scoreCentisecondsFromElapsedMs(Number.POSITIVE_INFINITY), null);
});

test('スコア表示は常に小数2桁で、時計を一度だけ確定する', () => {
  let now = 1000;
  const clock = new SaisupiClock({ now: () => now });
  assert.equal(clock.start(), true);
  assert.equal(clock.start(), false);

  now = 13349;
  assert.deepEqual(clock.getSnapshot(), {
    startedAt: 1000,
    finishedAt: null,
    elapsedMs: 12349,
    scoreCentiseconds: null,
    displayTime: '12.34秒'
  });
  assert.equal(clock.finish(), 12349);
  assert.equal(clock.finish(), null);
  assert.deepEqual(clock.getSnapshot(), {
    startedAt: 1000,
    finishedAt: 13349,
    elapsedMs: 12349,
    scoreCentiseconds: 1234,
    displayTime: '12.34秒'
  });
  assert.equal(formatScoreCentiseconds(10000), '100.00秒');
  assert.equal(formatScoreCentiseconds(-1), '--.--秒');
});
