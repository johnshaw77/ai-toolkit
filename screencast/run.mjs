// 用法：node run.mjs [--dry-run | --zoom-only] <scenario 檔案路徑>
//   --dry-run    只快速走一次確認每一步都對得到元素，不錄影、不合成語音、不動 outDir
//   --zoom-only  不重錄，依 scenario 目前的 zoom 設定重新輸出 demo-zoomed.mp4
// 有步驟失敗時 exit code 為 1，方便接在腳本或 CI 裡。
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rezoomScenario, runScenario } from './lib/record-engine.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const zoomOnly = args.includes('--zoom-only');
const scenarioArg = args.find((a) => !a.startsWith('--'));
if (!scenarioArg) {
  console.error('用法: node run.mjs [--dry-run | --zoom-only] <scenario 檔案路徑>');
  process.exit(1);
}

const mod = await import(pathToFileURL(path.resolve(scenarioArg)).href);
const result = zoomOnly ? await rezoomScenario(mod.scenario) : await runScenario(mod.scenario, { dryRun, baseDir: path.dirname(path.resolve(scenarioArg)) });
process.exit(result.ok ? 0 : 1);
