import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));

/** 產生一段靜音 WAV（16kHz、mono、16-bit）。假 TTS 回的就是這個。 */
export function silentWav(durationMs) {
  const sampleRate = 16000;
  const samples = Math.round((sampleRate * durationMs) / 1000);
  const dataBytes = samples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

/** 假 TTS 唸一句話的長度：跟字數成正比，讓每句長度不同、又可以預測。 */
export function fakeDurationMs(text) {
  return 400 + 25 * [...text].length;
}

/**
 * 起一個本地 server，同時扮演：
 *   - fixture 網站（test/fixtures/ 底下的靜態檔）
 *   - /poll：一直被輪詢的端點，讓頁面永遠不會 networkidle
 *   - /v1/audio/speech：OpenAI 相容的假 TTS。input 含 "[500]" 就回 500；
 *     含 "[slow:N]" 就等 N 毫秒才回（模擬本地服務第一次載入模型）。
 */
export async function startServer() {
  const ttsCalls = [];
  const pageEvents = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');

    if (req.method === 'POST' && url.pathname === '/v1/audio/speech') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const json = JSON.parse(body);
        ttsCalls.push({ body: json, authorization: req.headers.authorization });
        if (json.input.includes('[500]')) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('model exploded');
          return;
        }
        const slow = Number(json.input.match(/\[slow:(\d+)\]/)?.[1] ?? 0);
        setTimeout(() => {
          if (res.destroyed) return;
          res.writeHead(200, { 'Content-Type': 'audio/wav' });
          res.end(silentWav(fakeDurationMs(json.input)));
        }, slow);
      });
      return;
    }

    // fixture 頁面把使用者事件回報到這裡（頁面關了之後測試還讀得到）
    if (url.pathname === '/event') {
      pageEvents.push(url.searchParams.get('e'));
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === '/poll') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }

    const file = path.join(FIXTURES, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(FIXTURES) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(file));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    ttsBaseUrl: `http://127.0.0.1:${port}/v1`,
    ttsCalls,
    pageEvents,
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}
