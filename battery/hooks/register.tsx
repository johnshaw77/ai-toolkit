import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import {
  BAT_H,
  BAT_W,
  COLOR,
  colorOf,
  countdown,
  drawBattery,
  fitMeters,
  LOW,
  toCells,
  toReading,
} from "./battery";

const reading = atom({ plugin: "battery", key: "reading" } as const, null);
const frame = atom({ plugin: "battery", key: "frame" } as const, 0);
const isHidden = atom({ plugin: "battery", key: "isHidden" } as const, false);

const TICK_MS = 300;

async function refresh($: EngineInterface): Promise<void> {
  const r = toReading(await $.session.usage());
  await update($, reading, () => r);
}

export const register: Register = (on) => {
  let isWorking = false;

  on("session.start", async ($, e, next) => {
    await $.command.register({ name: "battery", description: "開關電池 HUD" });
    await refresh($);
    // 只有電池低於 20% 要閃時才推進影格，平常不重畫
    $.clock.every(TICK_MS, () => {
      void read($, reading).then((r) => {
        const isLow =
          r?.meters.some((m) => m.left !== null && m.left < LOW) ?? false;
        if (isLow) void update($, frame, (f) => f + 1);
      });
    });
    return next(e);
  });

  on("command.run", { command: "battery" }, async ($) => {
    const hidden = await update($, isHidden, (h) => !h);
    return { text: hidden ? "電池 HUD 收起來了。" : "電池 HUD 打開了。" };
  });

  // 數字變了（context 增減、額度動了一個百分點、花費增加）才更新
  on("session.measure", async ($, e, next) => {
    const r = toReading(e);
    await update($, reading, () => r);
    return next(e);
  });

  on("turn.start", ($, e, next) => {
    isWorking = true;
    return next(e);
  });
  on("turn.complete", ($, e, next) => {
    if (e.agentId === undefined) isWorking = false;
    return next(e);
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const r = await read($, reading);
    // 工作中把 band 讓給搬運動畫（conveyor mod），閒置才顯示電池
    if (e.props.hasSurvey || e.props.isWorking || r === null || (await read($, isHidden)))
      return next(e);

    const ui = $.ui.resolve(e);
    if (e.surface !== "terminal" || !("Raster" in ui)) return next(e);
    const { Box, Raster, Text } = ui;
    const f = await read($, frame);
    const now = await $.clock.now();
    const isCharging = e.props.isWorking;
    // 右邊留 18 欄給模型與花費
    const meters = fitMeters(r.meters, e.props.bodyColumns - 18);
    const model = (await $.session.model())
      .replace(/^claude-/, "")
      .replace(/-\d{8}$/, "");

    // 這一格只畫得出一棵樹：把下層 mod 的畫面接在下面，不要蓋掉
    const below = await next(e);
    return (
      <Box flexDirection="column">
      <Box flexDirection="row">
        {meters.map((m) => (
          <Box key={m.label} flexDirection="row" marginRight={3}>
            <Raster
              key={`bat-${m.label}`}
              columns={BAT_W}
              rows={BAT_H / 2}
              cells={toCells(drawBattery(m.left, f, isCharging), BAT_W, BAT_H)}
            />
            <Box flexDirection="column" marginLeft={1}>
              {m.left === null ? (
                <Text dimColor>剩 --</Text>
              ) : (
                <Text color={colorOf(m.left)} bold>
                  剩 {Math.round(m.left * 100)}%
                </Text>
              )}
              <Text dimColor>{m.label}</Text>
              <Text dimColor>
                {m.resetsAt === undefined
                  ? " "
                  : `↻ ${countdown(m.resetsAt - now)}`}
              </Text>
            </Box>
          </Box>
        ))}
        <Box flexDirection="column">
          <Text
            color={isCharging ? COLOR.mid : undefined}
            dimColor={!isCharging}
          >
            {isCharging ? "⚡ 充電中" : "　閒置"}
          </Text>
          <Text dimColor>{model}</Text>
          <Text dimColor>
            {r.usd === undefined ? " " : `$${r.usd.toFixed(2)}`}
          </Text>
        </Box>
      </Box>
      {below}
      </Box>
    );
  });
};
