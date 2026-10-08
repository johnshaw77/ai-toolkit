import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage } from 'claude-code'

import type { Reading, Sample } from '../types'

const HISTORY = 12

const reading = atom({ plugin: 'token-weather', key: 'reading' } as const, null)
const history = atom({ plugin: 'token-weather', key: 'history' } as const, [])
const turn = atom({ plugin: 'token-weather', key: 'turn' } as const, 0)

type Weather = { icon: string; zh: string; en: string; color: string }

// 門檻由低到高；百分比落在 `below` 以下就是那一級
const LEVELS: (Weather & { below: number })[] = [
  { below: 40, icon: '☀', zh: '晴朗', en: 'Clear', color: 'green' },
  { below: 60, icon: '☁', zh: '多雲', en: 'Cloudy', color: 'cyan' },
  { below: 75, icon: '🌧', zh: '陣雨', en: 'Showers', color: 'yellow' },
  { below: 85, icon: '⛈', zh: '暴風雨', en: 'Storm', color: 'magenta' },
  { below: Infinity, icon: '🌀', zh: '建議盡快壓縮', en: 'Compact soon', color: 'red' },
]

export const weatherOf = (percent: number): Weather =>
  LEVELS.find(level => percent < level.below) ?? LEVELS.at(-1)!

const BARS = '▁▂▃▄▅▆▇█'

/** 以 0–100 的絕對刻度畫，不同輪之間的高度才能直接比較。 */
export const sparkline = (samples: Sample[]): string =>
  samples
    .map(s => BARS[Math.min(BARS.length - 1, Math.floor((s.percent / 100) * BARS.length))])
    .join('')

const formatInt = (n: number) => n.toLocaleString('en-US')

const toReading = (context: SessionContextUsage): Reading | null => {
  if (context.tokens === undefined || context.window <= 0) {
    return null
  }

  const percent = context.percent ?? Math.round((context.tokens / context.window) * 100)

  return { tokens: context.tokens, window: context.window, percent }
}

export const register: Register = on => {
  // 熱載入或中途載入時，先拿一次現況，不必等下一輪
  on('session.start', async ($, e, next) => {
    const { context } = await $.session.usage()
    const now = toReading(context)

    if (now) {
      await update($, reading, () => now)
    }

    return next(e)
  })

  // 每送出一次提示詞算一輪
  on('prompt.submit', async ($, e, next) => {
    await update($, turn, n => n + 1)

    return next(e)
  })

  // 引擎在每次主線回應後量一次；同一輪內多次量測只留最後一筆
  on('session.measure', async ($, e, next) => {
    const now = toReading(e.context)

    if (e.changed.includes('context') && now) {
      const current = await read($, turn)
      await update($, reading, () => now)
      await update($, history, samples => {
        const kept = samples.at(-1)?.turn === current ? samples.slice(0, -1) : samples

        return [...kept, { turn: current, percent: now.percent }].slice(-HISTORY)
      })
    }

    return next(e)
  })

  // /clear 之後窗口重來，歷史也跟著清掉
  on('session.end', async ($, e, next) => {
    await update($, reading, () => null)
    await update($, history, () => [])

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, reading)

    if (e.props.hasSurvey || now === null) {
      return next(e)
    }

    const samples = await read($, history)
    const weather = weatherOf(now.percent)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" gap={2}>
        <Text color={weather.color} bold>
          {weather.icon} {weather.zh} {weather.en}
        </Text>
        <Text color={weather.color}>{now.percent}%</Text>
        <Text dimColor>
          {formatInt(now.tokens)} / {formatInt(now.window)} tokens
        </Text>
        {samples.length > 0 && (
          <Text color={weather.color}>
            {sparkline(samples)} <Text dimColor>近 {samples.length} 輪</Text>
          </Text>
        )}
      </Box>
    )
  })
}
