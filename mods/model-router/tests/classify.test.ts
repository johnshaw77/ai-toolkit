import { expect, test } from 'claude-code/testing'

import { buildRequest, choose, growth, isFollowup, MODELS, NO_DOWNGRADE_TOKENS, parseForce, parseVerdict, rank, toggled } from '../hooks/classify'

const OPUS = { model: MODELS.opus, effort: 'medium' as const }
const v = (tier: 'haiku' | 'sonnet' | 'opus', confidence = 1) => ({ verdict: { tier, confidence } })

test('~模型名 強制指定並從 prompt 拿掉', () => {
  expect(parseForce('~haiku 列出檔案')).toEqual({ force: 'haiku', text: '列出檔案' })
  expect(parseForce('~opus')).toEqual({ force: 'opus', text: '~opus' })
  expect(parseForce('沒有指定').force).toBeUndefined()
})

test('簡短接續', () => {
  expect(isFollowup('好，照你推薦的做')).toBe(true)
  expect(isFollowup('這樣會不會比較慢？')).toBe(false)
  expect(isFollowup('幫我把登入頁改成深色主題，順便把按鈕加大')).toBe(false)
})

test('開關指令', () => {
  expect(toggled(false, '')).toBe(true)
  expect(toggled(true, ' OFF ')).toBe(false)
  expect(toggled(false, 'on')).toBe(true)
  expect(toggled(false, 'abc')).toBeUndefined()
})

test('組請求：三選一＋難度分數，附上目前的模型、不附上一則 prompt', () => {
  const body = JSON.parse(buildRequest('重構登入模組', MODELS.opus))
  expect(body.model).toBe('jev-latest')
  expect(Object.keys(body.questions.tier.criteria)).toEqual(['haiku', 'sonnet', 'opus'])
  expect(body.questions.tier.instructions).toContain('one pass')
  expect(body.questions.tier.criteria.opus).toContain('Not for:')
  expect(body.questions.difficulty.criteria).toHaveLength(5)
  expect(JSON.parse(body.state)).toEqual({ request: '重構登入模組', current_model: MODELS.opus })
})

test('讀回應', () => {
  const ok =
    '{"model":"jev-1.13.0","answers":{"tier":{"type":"choice","choice":"sonnet","confidence":0.98,"probabilities":{"haiku":0.01,"sonnet":0.99,"opus":0}},"difficulty":{"type":"score","score":1.3,"confidence":0.7}}}'
  expect(parseVerdict(ok)).toEqual({ tier: 'sonnet', confidence: 0.98, score: 1.3 })
  expect(parseVerdict('{"answers":{"tier":{"choice":"gpt","confidence":1}}}')).toBeUndefined()
  expect(parseVerdict('{"detail":{"error_type":"authentication_error"}}')).toBeUndefined()
  expect(parseVerdict('not json')).toBeUndefined()
})

test('模型等級', () => {
  expect(rank(MODELS.haiku)).toBeLessThan(rank(MODELS.sonnet))
  expect(rank(MODELS.sonnet)).toBeLessThan(rank(MODELS.opus))
  expect(rank('claude-fable-5-1')).toBeGreaterThan(rank(MODELS.opus))
})

test('照 Jev 的判斷選模型', () => {
  expect(choose(v('haiku'), OPUS, OPUS.model, 0).model).toBe(MODELS.haiku)
  expect(choose(v('sonnet'), OPUS, OPUS.model, 0)).toMatchObject({ model: MODELS.sonnet, effort: 'medium' })
  expect(choose(v('opus'), OPUS, MODELS.haiku, 0).model).toBe(MODELS.opus)
})

test('Haiku 不帶 effort', () => {
  expect(choose(v('haiku'), OPUS, OPUS.model, 0).effort).toBeUndefined()
  expect(choose({ force: 'haiku' }, OPUS, OPUS.model, 0).effort).toBeUndefined()
})

test('信心低於 0.5 不降級，升級照做', () => {
  expect(choose(v('haiku', 0.49), OPUS, OPUS.model, 0)).toMatchObject({ model: OPUS.model, label: expect.stringContaining('不確定不降級') })
  expect(choose(v('sonnet', 0.4), OPUS, OPUS.model, 0).model).toBe(OPUS.model)
  expect(choose(v('haiku', 0.5), OPUS, OPUS.model, 0).model).toBe(MODELS.haiku)
  expect(choose(v('opus', 0.3), OPUS, MODELS.haiku, 0).model).toBe(MODELS.opus)
  expect(choose(v('sonnet', 0.2), OPUS, MODELS.sonnet, 0).model).toBe(MODELS.sonnet)
})

test('對話長度只算比開場多出的部分', () => {
  expect(growth(0, undefined)).toEqual({ growth: 0, baseline: undefined })
  expect(growth(70_000, undefined)).toEqual({ growth: 0, baseline: 70_000 })
  expect(growth(115_000, 70_000)).toEqual({ growth: 45_000, baseline: 70_000 })
  // compact 之後變短：開場基準跟著下修
  expect(growth(60_000, 70_000)).toEqual({ growth: 0, baseline: 60_000 })
  expect(growth(0, 70_000)).toEqual({ growth: 0, baseline: 70_000 })
})

test('對話比開場多出 40,000 tokens 後只升不降', () => {
  const long = NO_DOWNGRADE_TOKENS + 1
  expect(choose(v('haiku'), OPUS, MODELS.sonnet, long).model).toBe(MODELS.sonnet)
  expect(choose(v('opus'), OPUS, MODELS.sonnet, long).model).toBe(MODELS.opus)
  expect(choose(v('haiku'), OPUS, MODELS.sonnet, NO_DOWNGRADE_TOKENS).model).toBe(MODELS.haiku)
  // 強制指定不受限
  expect(choose({ force: 'haiku' }, OPUS, OPUS.model, long).model).toBe(MODELS.haiku)
})

test('沒有判斷就沿用上一輪的模型', () => {
  expect(choose({}, OPUS, MODELS.sonnet, 0).model).toBe(MODELS.sonnet)
})
