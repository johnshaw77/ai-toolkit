import { execFileSync } from 'node:child_process';

/** ffprobe 列出檔案裡的串流：[{ codec_type, codec_name }, ...] 與總長度（毫秒）。 */
export function probe(file) {
  const raw = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type,codec_name:format=duration', '-of', 'json', file,
  ], { encoding: 'utf-8' });
  const json = JSON.parse(raw);
  return {
    streams: json.streams,
    durationMs: Math.round(parseFloat(json.format.duration) * 1000),
  };
}
