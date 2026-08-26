import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { createLocalGoal, listLocalGoals, updateLocalGoal } from './goals'
import { emptyLocalDatabase, loadLocalDatabase, LocalStoreError, memoryDriver, setLocalStoreDriver } from './store'

const USER = 'guest-goals'

beforeEach(() => setLocalStoreDriver(memoryDriver(null)))

describe('Goals on the device', () => {
  it('creates free-speech direction without a parallel task lifecycle', async () => {
    const goal = await createLocalGoal(USER, {
      module: 'whole_day',
      statement: 'Launch HealthyFlow without sacrificing training consistency.',
      context: 'Keep three training sessions each week during launch.',
    })

    assert.equal(goal.module, 'whole_day')
    assert.equal(goal.archivedAt, null)
    assert.equal(goal.context, 'Keep three training sessions each week during launch.')
    assert.equal('dueDate' in goal, false)
    assert.equal('completed' in goal, false)
    assert.equal('progress' in goal, false)
  })

  it('updates words or module and keeps the same Goal identity', async () => {
    const created = await createLocalGoal(USER, { module: 'tasks', statement: 'Ship the app.' })
    const updated = await updateLocalGoal(USER, created.id, {
      module: 'workouts',
      statement: 'Ship the app while protecting training.',
      context: 'The release date may move; training is a standing constraint.',
    })

    assert.equal(updated.id, created.id)
    assert.equal(updated.module, 'workouts')
    assert.equal(updated.statement, 'Ship the app while protecting training.')
    assert.equal(updated.context, 'The release date may move; training is a standing constraint.')
  })

  it('archives reversibly and excludes archived Goals from the default read', async () => {
    const created = await createLocalGoal(USER, { module: 'habits', statement: 'Make recovery repeatable.' })
    const archived = await updateLocalGoal(USER, created.id, { archived: true })

    assert.ok(archived.archivedAt)
    assert.deepEqual(await listLocalGoals(USER), [])
    assert.equal((await listLocalGoals(USER, true)).length, 1)

    const restored = await updateLocalGoal(USER, created.id, { archived: false })
    assert.equal(restored.archivedAt, null)
    assert.equal((await listLocalGoals(USER)).length, 1)
  })

  it('surfaces a failed lookup instead of pretending nothing exists', async () => {
    await assert.rejects(
      () => updateLocalGoal(USER, '11111111-1111-4111-8111-111111111111', { archived: true }),
      LocalStoreError,
    )
  })

  it('clears context without deleting or archiving the Goal', async () => {
    const created = await createLocalGoal(USER, {
      module: 'work',
      statement: 'Launch HealthyFlow.',
      context: 'Initial launch assumptions.',
    })

    const updated = await updateLocalGoal(USER, created.id, { context: '' })

    assert.equal(updated.statement, created.statement)
    assert.equal(updated.context, '')
    assert.equal(updated.archivedAt, null)
  })

  it('opens a version 3 Local day with offset Goal timestamps and normalizes them for the app', async () => {
    const legacy = {
      ...emptyLocalDatabase(USER),
      version: 3,
      goals: [{
        id: '11111111-1111-4111-8111-111111111111',
        user_id: USER,
        module: 'work',
        statement: 'Launch HealthyFlow.',
        created_at: '2026-08-26T08:00:00+00:00',
        updated_at: '2026-08-26T09:00:00+00:00',
        deleted_at: null,
      }],
    }
    setLocalStoreDriver(memoryDriver(JSON.stringify(legacy)))

    const migrated = await loadLocalDatabase(USER)

    assert.equal(migrated.version, 4)
    assert.equal(migrated.goals[0]?.context, '')
    const [goal] = await listLocalGoals(USER, true)
    assert.equal(goal?.createdAt, '2026-08-26T08:00:00.000Z')
    assert.equal(goal?.updatedAt, '2026-08-26T09:00:00.000Z')
  })

  it('preserves old assistant priorities and constraints as unclassified Whole day Goals', async () => {
    const legacy = {
      ...emptyLocalDatabase(USER),
      version: 2,
      goals: undefined,
      settings: {
        assistantProfile: {
          preferredName: 'Ori',
          responseStyle: 'concise',
          planningStyle: 'one_step_at_a_time',
          followUpMode: 'ask_about_outcomes',
          priorities: ['Launch HealthyFlow', 'Protect training consistency'],
          constraints: ['No work planning after 19:00'],
        },
      },
    }
    setLocalStoreDriver(memoryDriver(JSON.stringify(legacy)))

    const migrated = await loadLocalDatabase(USER)

    assert.deepEqual(migrated.goals.map(goal => goal.statement), [
      'Launch HealthyFlow',
      'Protect training consistency',
      'No work planning after 19:00',
    ])
    assert.ok(migrated.goals.every(goal => goal.module === 'whole_day'))
    assert.deepEqual(migrated.settings.assistantProfile, {
      preferredName: 'Ori',
      responseStyle: 'concise',
      planningStyle: 'one_step_at_a_time',
      followUpMode: 'ask_about_outcomes',
    })
  })
})
