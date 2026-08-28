import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const source = fs.readFileSync(path.resolve('src/utils/pendingActionInvalidation.ts'), 'utf8')

describe('pending Talk action invalidation', () => {
  it('invalidates reusable Workout plans after confirmation', async () => {
    assert.match(source, /action\.capability === 'add_workout_plan'[\s\S]*queryKey: \['workout-plans'\]/)
  })
})
