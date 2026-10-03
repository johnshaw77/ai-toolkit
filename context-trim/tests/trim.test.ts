import { expect, test } from "claude-code/testing";

import { COMPACT_KEEP, MAX_CHARS, trim } from "../hooks/trim";

test("短輸出不動", async () => {
  expect(trim("a\nb\nc")).toBeUndefined();
});

test("400 行以內不動", async () => {
  expect(
    trim(Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join("\n")),
  ).toBeUndefined();
});

test("長輸出保留頭尾與錯誤行", async () => {
  const lines = Array.from({ length: 1_000 }, (_, i) => `line ${i + 1}`);
  lines[499] = "npm ERR! something broke";
  const t = trim(lines.join("\n"));
  expect(t?.totalLines).toBe(1_000);
  expect(t?.text).toContain("line 1\n");
  expect(t?.text).toContain("line 1000");
  expect(t?.text).toContain("L500: npm ERR! something broke");
  expect(t?.text).not.toContain("line 300\n");
  expect(t?.droppedLines).toBe(1_000 - 100 - 150 - 1);
});

test("行數少但字數多也會修剪", async () => {
  const t = trim("x".repeat(MAX_CHARS * 3));
  expect(t).toBeDefined();
  expect((t?.text.length ?? 0) < MAX_CHARS + 500).toBe(true);
});

test("compact 附上保留清單，接在使用者的指示後面", async ($, on) => {
  const seen: (string | undefined)[] = [];
  on("session.compact", (_$, e) => {
    seen.push(e.instructions);
    return { skip: "test" };
  });
  await $.session.compact({
    trigger: "manual",
    messages: [],
    instructions: "保留 SPEC",
  });
  await $.session.compact({ trigger: "manual", messages: [] });
  expect(seen[0]).toBe(`保留 SPEC\n\n${COMPACT_KEEP}`);
  expect(seen[1]).toBe(COMPACT_KEEP);
});
