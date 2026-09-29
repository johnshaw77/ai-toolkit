import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { prepareOutDir } from '../lib/record-engine.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-outdir-'));

test('不存在的資料夾：建立並放標記檔', () => {
  const dir = path.join(tmp(), 'new');
  prepareOutDir(dir);
  assert.deepEqual(fs.readdirSync(dir), ['.screencast-out']);
});

test('之前的輸出（有標記檔）：整個清掉重建', () => {
  const dir = tmp();
  prepareOutDir(dir);
  fs.writeFileSync(path.join(dir, 'demo.webm'), 'old');
  prepareOutDir(dir);
  assert.deepEqual(fs.readdirSync(dir), ['.screencast-out']);
});

test('舊版輸出（只有 manifest.json、沒有標記檔）：也認得', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'manifest.json'), '{}');
  prepareOutDir(dir);
  assert.deepEqual(fs.readdirSync(dir), ['.screencast-out']);
});

test('不相干的資料夾：拒絕刪除，原本的檔案都還在', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  fs.mkdirSync(path.join(dir, 'src'));
  assert.throws(() => prepareOutDir(dir), /拒絕整個刪掉/);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['package.json', 'src']);
});

test('只有 .DS_Store 視為空資料夾', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, '.DS_Store'), '');
  prepareOutDir(dir);
  assert.deepEqual(fs.readdirSync(dir), ['.screencast-out']);
});

test('normalizeOutDir：Windows 上修掉 URL.pathname 多出來的開頭斜線，其他平台不動', async () => {
  const { normalizeOutDir } = await import('../lib/record-engine.mjs');
  assert.equal(normalizeOutDir('/C:/Users/me/out/demo', 'win32'), 'C:\\Users\\me\\out\\demo');
  assert.equal(normalizeOutDir('D:\\work\\out', 'win32'), 'D:\\work\\out');
  assert.equal(normalizeOutDir('/Users/me/out/demo', 'darwin'), '/Users/me/out/demo');
  assert.equal(normalizeOutDir('/C:/x', 'darwin'), '/C:/x');
});
