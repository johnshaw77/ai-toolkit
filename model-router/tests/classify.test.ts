import { expect, test } from 'claude-code/testing'

import { choose, classify, MODELS, parseForce, subagentModel } from '../hooks/classify'

const OPUS = { model: 'claude-opus-5-5', effort: 'medium' as const }

test('分級', async () => {
  expect(classify('git rebase 是什麼？', undefined).tier).toBe('light')
  expect(classify('幫我把登入頁改成深色主題', undefined).tier).toBe('normal')
  expect(classify('為什麼部署後 API 一直失敗', undefined).tier).toBe('heavy')
  expect(classify('重構這個模組的架構', undefined).tier).toBe('heavy')
  expect(classify('x'.repeat(700), undefined).tier).toBe('heavy')
})

test('簡短接續沿用上一輪', async () => {
  const prev = classify('重構這個模組的架構', undefined)
  expect(classify('好，照你推薦的做', prev).tier).toBe('heavy')
  expect(classify('', prev).tier).toBe('heavy')
})

test('!模型名 強制指定並從 prompt 拿掉', async () => {
  expect(parseForce('!haiku 列出檔案')).toEqual({ force: 'haiku', text: '列出檔案' })
  expect(parseForce('!opus')).toEqual({ force: 'opus', text: '!opus' })
  expect(parseForce('沒有指定').force).toBeUndefined()
})

test('選模型', async () => {
  expect(choose({ tier: 'light', why: '' }, OPUS, 10_000).model).toBe(MODELS.sonnet)
  expect(choose({ tier: 'light', why: '' }, OPUS, 200_000).model).toBe(OPUS.model)
  expect(choose({ tier: 'heavy', why: '' }, OPUS, 0)).toMatchObject({ model: OPUS.model, effort: 'high' })
  expect(choose({ tier: 'heavy', why: '' }, { model: OPUS.model, effort: 'max' }, 0).effort).toBe('max')
  expect(choose({ tier: 'normal', why: '' }, OPUS, 0)).toMatchObject(OPUS)
  expect(choose({ tier: 'normal', force: 'haiku', why: '' }, OPUS, 0).effort).toBeUndefined()
})

test('子 agent', async () => {
  expect(subagentModel('Explore')).toBe('haiku')
  expect(subagentModel('everything-claude-code:code-reviewer')).toBe('opus')
  expect(subagentModel('general-purpose')).toBeUndefined()
})
