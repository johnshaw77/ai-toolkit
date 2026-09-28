import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeRegExp, fillValue, locatorSpec } from '../lib/locate.mjs';

test('escapeRegExp：跳脫後當 RegExp 用要能比對到原字串本身', () => {
  const name = '儲存 (Ctrl+S) [1.0]? a|b ^$ {x} \\';
  assert.ok(new RegExp(escapeRegExp(name)).test(`前綴 ${name} 後綴`));
});

test('role+name：字串名稱會跳脫，含括號加號也能比對', () => {
  const spec = locatorSpec({ type: 'click', role: 'button', name: '儲存 (Ctrl+S)' });
  assert.equal(spec.by, 'role');
  assert.ok(spec.options.name.test('儲存 (Ctrl+S)'));
  assert.ok(!spec.options.name.test('儲存 Ctrl+S'));
});

test('role+name：給 RegExp 就照 RegExp，exact 就用字串完全比對', () => {
  assert.deepEqual(locatorSpec({ role: 'button', name: /^送出$/ }).options, { name: /^送出$/ });
  assert.deepEqual(locatorSpec({ role: 'button', name: '送出', exact: true }).options, { name: '送出', exact: true });
  assert.deepEqual(locatorSpec({ role: 'heading' }).options, {});
});

test('優先順序：selector > role > placeholder > text', () => {
  assert.equal(locatorSpec({ selector: '#a', role: 'button', text: 'x' }).by, 'selector');
  assert.equal(locatorSpec({ role: 'button', placeholder: 'p', text: 'x' }).by, 'role');
  assert.equal(locatorSpec({ placeholder: 'p', text: 'x' }).by, 'placeholder');
  assert.equal(locatorSpec({ type: 'click', text: 'x' }).by, 'text');
});

test('fill 不拿 text 去定位：只有 text 時要明確報錯', () => {
  assert.throws(
    () => locatorSpec({ type: 'fill', text: '王小明', label: '輸入姓名' }),
    /fill 的 text 是要輸入的內容/,
  );
});

test('fill 的內容：優先 value，沒有就沿用舊寫法的 text', () => {
  assert.equal(fillValue({ value: '新', text: '舊' }), '新');
  assert.equal(fillValue({ text: '舊' }), '舊');
  assert.equal(fillValue({}), '');
  assert.equal(fillValue({ value: 123 }), '123');
});

test('什麼定位方式都沒有就報錯', () => {
  assert.throws(() => locatorSpec({ type: 'click', label: '點什麼' }), /缺少 selector/);
});
