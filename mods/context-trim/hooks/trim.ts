// 長輸出修剪：保留開頭、結尾，以及中間看起來是錯誤或警告的行

export const MAX_LINES = 400;
export const MAX_CHARS = 40_000;
const HEAD = 100;
const TAIL = 150;
const KEY_LINES = 40;
const LINE_CHARS = 500;
const KEY = /error|fail|warn|exception|traceback|panic|fatal|denied|✗|✘|ERR!/i;

export const KEEP_FULL = "# keep-full";

export type Trimmed = {
  text: string;
  droppedLines: number;
  totalLines: number;
};

function hint(dropped: string): string {
  return (
    `[context-trim] ${dropped}。需要完整內容：把輸出寫到檔案再用 Read 分段讀，` +
    `或在指令最後加上 \`${KEEP_FULL}\` 重跑。`
  );
}

function clip(line: string): string {
  return line.length > LINE_CHARS
    ? `${line.slice(0, LINE_CHARS)}…（此行共 ${line.length.toLocaleString("en-US")} 字）`
    : line;
}

/** 不需要修剪就回傳 undefined */
export function trim(text: string): Trimmed | undefined {
  const lines = text.split("\n");
  const total = lines.length;

  if (total <= MAX_LINES) {
    if (text.length <= MAX_CHARS) return undefined;
    // 行數不多但很長（壓縮過的 JSON、單行 log）：保留頭尾各一段字
    const half = MAX_CHARS / 2;
    const cut = text.length - MAX_CHARS;
    return {
      text: `${text.slice(0, half)}\n${hint(`省略中間 ${cut.toLocaleString("en-US")} 字（共 ${text.length.toLocaleString("en-US")} 字）`)}\n${text.slice(-half)}`,
      droppedLines: 0,
      totalLines: total,
    };
  }

  const middle = lines.slice(HEAD, total - TAIL);
  const keys: string[] = [];
  for (let i = 0; i < middle.length && keys.length < KEY_LINES; i++) {
    const line = middle[i] ?? "";
    if (KEY.test(line)) keys.push(`L${HEAD + i + 1}: ${clip(line)}`);
  }
  const dropped = middle.length - keys.length;
  const parts = [
    ...lines.slice(0, HEAD).map(clip),
    hint(
      `省略中間 ${dropped.toLocaleString("en-US")} 行（共 ${total.toLocaleString("en-US")} 行）` +
        (keys.length > 0
          ? `，下面保留其中 ${keys.length} 行含錯誤或警告關鍵字的行（L 後面是原始行號）`
          : ""),
    ),
    ...keys,
    ...(keys.length > 0 ? ["[context-trim] 以下是最後幾行："] : []),
    ...lines.slice(total - TAIL).map(clip),
  ];
  return { text: parts.join("\n"), droppedLines: dropped, totalLines: total };
}

export const COMPACT_KEEP = `壓縮時務必保留：
1. 使用者明確下過的指示與偏好（語言、格式、不要做的事）
2. 已經做出的決定與理由，包括被否決的方案
3. 建立或修改過的檔案完整路徑，以及各自改了什麼
4. 尚未完成的待辦與目前進度
5. 遇過的錯誤與最後的解法
可以丟掉：工具的原始輸出、讀過的檔案內容、中途嘗試的細節。`;
