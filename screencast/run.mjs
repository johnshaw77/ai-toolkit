// 用法：node run.mjs [--dry-run] <scenario 檔案路徑>
//   --dry-run  只快速走一次確認每一步都對得到元素，不錄影、不合成語音、不動 outDir
// 有步驟失敗時 exit code 為 1，方便接在腳本或 CI 裡。
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runScenario } from './lib/record-engine.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const scenarioArg = args.find((a) => !a.startsWith('--'));
if (!scenarioArg) {
  console.error('用法: node run.mjs [--dry-run] <scenario 檔案路徑>');
  process.exit(1);
}

const mod = await import(pathToFileURL(path.resolve(scenarioArg)).href);
const result = await runScenario(mod.scenario, { dryRun });
process.exit(result.ok ? 0 : 1);
