import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CATEGORY_IDS,
  CATEGORY_PRESENTATIONS,
  getCategoryPresentation,
} from '../categoryPresentation'

describe('category presentation', () => {
  it('covers the canonical category schema exactly once', () => {
    assert.equal(new Set(CATEGORY_IDS).size, CATEGORY_IDS.length)
    assert.deepEqual(CATEGORY_IDS, CATEGORY_PRESENTATIONS.map(({ id }) => id))
  })

  it('keeps stable labels and falls back safely for historical unknown values', () => {
    assert.deepEqual(
      CATEGORY_PRESENTATIONS.map(({ id, label }) => ({ id, label })),
      [
        { id: 'health', label: 'Health' },
        { id: 'work', label: 'Work' },
        { id: 'personal', label: 'Personal' },
        { id: 'fitness', label: 'Fitness' },
        { id: 'grocery', label: 'Grocery' },
        { id: 'nutrition', label: 'Nutrition' },
      ],
    )
    assert.equal(getCategoryPresentation('legacy-value').id, 'personal')
  })
})
