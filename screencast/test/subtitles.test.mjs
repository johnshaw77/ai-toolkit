import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSrt, buildVtt, cuesFromManifest, formatTimestamp } from '../lib/subtitles.mjs';

test('formatTimestamp：SRT 用逗號、VTT 用句點，負數夾到 0', () => {
  assert.equal(formatTimestamp(3723456), '01:02:03,456');
  assert.equal(formatTimestamp(3723456, '.'), '01:02:03.456');
  assert.equal(formatTimestamp(-50), '00:00:00,000');
  assert.equal(formatTimestamp(999.6), '00:00:01,000');
});

test('字幕起點用 narrationStartMs，不是 step 的 tStartMs', () => {
  const cues = cuesFromManifest([
    { index: 1, narration: '短句。', tStartMs: 0, tEndMs: 5000, narrationStartMs: 1752, narrationDurationMs: 3000 },
  ]);
  assert.deepEqual(cues, [{ startMs: 1752, endMs: 4752, text: '短句。' }]);
});

test('沒有旁白的 step 不產字幕', () => {
  const cues = cuesFromManifest([
    { index: 1, tStartMs: 0, tEndMs: 1000 },
    { index: 2, narration: '有。', tStartMs: 1000, tEndMs: 3000, narrationStartMs: 1500, narrationDurationMs: 1500 },
  ]);
  assert.equal(cues.length, 1);
});

test('長句在標點處切開，時間按字數比例分配且首尾相接', () => {
  const text = '這是第一段比較長的說明，這是第二段。';
  const cues = cuesFromManifest(
    [{ index: 1, narration: text, narrationStartMs: 1000, narrationDurationMs: 1800 }],
    { maxCharsPerCue: 12 },
  );
  assert.deepEqual(cues.map((c) => c.text), ['這是第一段比較長的說明，', '這是第二段。']);
  assert.equal(cues[0].startMs, 1000);
  assert.equal(cues[0].endMs, cues[1].startMs);
  assert.equal(cues.at(-1).endMs, 2800);
  // 第一段 12 字、第二段 6 字 → 2:1
  assert.equal(cues[0].endMs - cues[0].startMs, 1200);
});

test('沒有標點的長句不硬斷', () => {
  const text = '一二三四五六七八九十一二三四五六七八九十';
  const cues = cuesFromManifest(
    [{ index: 1, narration: text, narrationStartMs: 0, narrationDurationMs: 1000 }],
    { maxCharsPerCue: 5 },
  );
  assert.deepEqual(cues.map((c) => c.text), [text]);
});

test('舊 manifest 沒有 narrationStartMs：用 fallback 長度從 tEndMs 往回推', () => {
  const cues = cuesFromManifest(
    [{ index: 1, narration: '舊的。', tStartMs: 0, tEndMs: 5000 }],
    { fallbackDurationMs: () => 2000 },
  );
  assert.deepEqual(cues, [{ startMs: 3000, endMs: 5000, text: '舊的。' }]);
});

test('fallback 拿不到長度就跳過那一句', () => {
  const cues = cuesFromManifest(
    [{ index: 1, narration: '舊的。', tStartMs: 0, tEndMs: 5000 }],
    { fallbackDurationMs: () => undefined },
  );
  assert.deepEqual(cues, []);
});

test('SRT 有編號、VTT 有檔頭', () => {
  const cues = [{ startMs: 0, endMs: 1000, text: '甲' }, { startMs: 1000, endMs: 2500, text: '乙' }];
  assert.equal(buildSrt(cues), '1\n00:00:00,000 --> 00:00:01,000\n甲\n\n2\n00:00:01,000 --> 00:00:02,500\n乙\n');
  assert.equal(buildVtt(cues), 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n甲\n\n00:00:01.000 --> 00:00:02.500\n乙\n');
});
