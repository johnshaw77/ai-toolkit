// 用法：node run.mjs scenarios/meeting-view.mjs
import path from 'node:path';
import { runScenario } from './lib/record-engine.mjs';

const scenarioArg = process.argv[2];
if (!scenarioArg) {
  console.error('用法: node run.mjs <scenario 檔案路徑>');
  process.exit(1);
}

const scenarioPath = path.resolve(scenarioArg);
const mod = await import(scenarioPath);
await runScenario(mod.scenario);
