#!/usr/bin/env node
// 假的 edge-tts CLI：不連網，寫一段靜音音檔到 --write-media，把收到的參數
// 追加到 FAKE_EDGE_LOG（一行一個 JSON）。講稿含 [fail] 就失敗、
// voice 是 bad-voice 就「成功但沒產出檔案」（模擬 voice 名稱打錯）。
import fs from 'node:fs';
import { fakeDurationMs, silentWav } from './server.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const i = a.indexOf('=');
  return [a.slice(2, i), a.slice(i + 1)];
}));
if (process.env.FAKE_EDGE_LOG) fs.appendFileSync(process.env.FAKE_EDGE_LOG, JSON.stringify(args) + '\n');
if (args.text.includes('[fail]')) {
  process.stderr.write('aiohttp.client_exceptions.WSServerHandshakeError: 403, message=Invalid response status\n');
  process.exit(1);
}
if (args.voice === 'bad-voice') process.exit(0);
fs.writeFileSync(args['write-media'], silentWav(fakeDurationMs(args.text)));
