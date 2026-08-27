import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const entrySurfaces = [
  '../pages/TodayPage.tsx',
  '../pages/AddItemPage.tsx',
  '../pages/CaloriesPage.tsx',
  '../pages/WorkoutsPage.tsx',
]

describe('Talk-only free-form AI input boundary', () => {
  it('keeps duplicate analyzers and the hidden admin composer out of the shipped tree', () => {
    for (const relative of [
      '../components/AITextAnalyzer/index.tsx',
      '../components/MealAnalyzer/index.tsx',
      '../pages/MealParserLabPage.tsx',
    ]) {
      assert.equal(existsSync(new URL(relative, import.meta.url)), false, `${relative} must stay removed`)
    }
  })

  it('routes every former entry surface through typed Talk context', () => {
    for (const relative of entrySurfaces) {
      const contents = source(relative)
      assert.match(contents, /talkHandoffState/)
      assert.doesNotMatch(contents, /AITextAnalyzer|MealAnalyzer|parseTasks\(|parseMeals\(|generatePlan\(/)
    }

    const app = source('../App.tsx')
    assert.match(app, /path="\/meal-ocr-lab"/)
    assert.match(app, /to="\/talk"/)
    assert.doesNotMatch(app, /MealParserLabPage/)
  })

  it('leaves the only AI composer and its content-free funnel event in Talk', () => {
    const talk = source('../pages/AssistantPage.tsx')
    assert.match(talk, /data-demo-id="talk-input"/)
    assert.match(talk, /analytics\.capture\('ai_question_asked'/)
    assert.match(talk, /surface: 'talk'/)
    assert.doesNotMatch(talk, /input: draft|content: draft/)
  })

  it('preserves deterministic dictation and explicit proposal editing', () => {
    assert.match(source('../pages/AddItemPage.tsx'), /<VoiceInput/)
    assert.match(source('../pages/GoalsPage.tsx'), /<textarea/)
    assert.match(source('../components/PendingActionCard.tsx'), /<textarea/)
  })
})
