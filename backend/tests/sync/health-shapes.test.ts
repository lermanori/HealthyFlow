import HealthContracts from '../../src/health-contracts'
import WorkoutContracts from '../../src/workout-contracts'
import AchievementContracts from '../../src/achievement-contracts'

const {
  calorieEntryToClient, calorieEntryToRow,
  calorieItemToClient, calorieItemToRow,
  weightEntryToClient, weightEntryToRow,
  withDeletion,
} = HealthContracts
const {
  workoutSessionToClient, workoutSessionToRows,
  workoutPlanToClient, workoutPlanToRows,
  workoutExerciseItemToClient, workoutExerciseItemToRow,
} = WorkoutContracts
const {
  achievementDefinitionToClient, achievementDefinitionToRow,
  achievementEntryToClient, achievementEntryToRow,
} = AchievementContracts

const USER = 'account-1'

/**
 * Every bug found on a device this week came from data the *server* creates,
 * while every test used data the *device* creates. So each of these starts from a
 * server row in the shape the table actually has, and asserts it survives the
 * round trip the sync puts it through.
 */
describe('a health record surviving the round trip', () => {
  it('keeps a calorie entry whole', () => {
    const row = {
      id: 'srv-meal', user_id: USER, date: '2026-08-23', time: '13:00', name: 'Porridge',
      calories: 300, protein: 12, carbs: 40, fat: 6, quantity: '1 bowl',
      created_at: '2026-08-23T08:00:00.000Z', updated_at: '2026-08-23T08:00:00.000Z',
      deleted_at: null,
    }
    expect(calorieEntryToRow(calorieEntryToClient(row), USER)).toEqual(row)
  })

  it('keeps a weight entry whole', () => {
    const row = {
      id: 'srv-weight', user_id: USER, date: '2026-08-23', weight_kg: 80.5,
      created_at: '2026-08-23T07:00:00.000Z', updated_at: '2026-08-23T07:00:00.000Z',
      deleted_at: null,
    }
    expect(weightEntryToRow(weightEntryToClient(row), USER)).toEqual(row)
  })

  it('keeps a calorie history item whole', () => {
    const row = {
      id: 'srv-item', user_id: USER, name: 'Eggs', normalized_name: 'eggs',
      quantity: '2 eggs', normalized_quantity: '2 eggs', calories: 140,
      protein: 12, carbs: 1, fat: 10, usage_count: 4,
      last_used_at: '2026-08-23T08:00:00.000Z',
      created_at: '2026-08-01T08:00:00.000Z', updated_at: '2026-08-23T08:00:00.000Z',
      deleted_at: null,
    }
    expect(calorieItemToRow(calorieItemToClient(row), USER)).toEqual(row)
  })

  it('keeps an Achievement and its entry whole', () => {
    const definition = {
      id: 'srv-ach', user_id: USER, name: 'Deadlift', category: 'fitness',
      metric_type: 'weight', unit: 'kg', better_direction: 'higher', target_value: 200,
      archived_at: null, created_at: '2026-08-01T08:00:00.000Z',
      updated_at: '2026-08-23T08:00:00.000Z', deleted_at: null,
    }
    expect(achievementDefinitionToRow(achievementDefinitionToClient(definition), USER))
      .toEqual(definition)

    const entry = {
      id: 'srv-entry', user_id: USER, achievement_id: 'srv-ach', date: '2026-08-23',
      value: 180, supporting_value: 5, supporting_unit: 'reps', notes: 'Felt good',
      created_at: '2026-08-23T08:00:00.000Z', updated_at: '2026-08-23T08:00:00.000Z',
      deleted_at: null,
    }
    expect(achievementEntryToRow(achievementEntryToClient(entry), USER)).toEqual(entry)
  })

  it('splits a session back into its row and its exercises', () => {
    // A device holds the exercises inside the session; the server holds them in
    // their own table. The shapes do not match, so the mapper returns both.
    const sessionRow = {
      id: 'srv-session', user_id: USER, date: '2026-08-23', title: 'Legs', notes: null,
      created_at: '2026-08-23T18:00:00.000Z', updated_at: '2026-08-23T18:00:00.000Z',
      deleted_at: null,
    }
    const exerciseRows = [{
      id: 'srv-ex', session_id: 'srv-session', name: 'Squat', sets: 5, reps: 5,
      weight_kg: 100, duration_minutes: null, distance_km: null, notes: null, position: 0,
    }]

    const client = workoutSessionToClient(sessionRow, exerciseRows)
    const { row, exercises } = workoutSessionToRows(client, USER)

    expect(row).toEqual(sessionRow)
    expect(exercises).toEqual(exerciseRows)
  })

  it('splits a plan back into its row and its items', () => {
    const planRow = {
      id: 'srv-plan', user_id: USER, name: 'Push day', color: 'blue', note: null,
      position: 2, created_at: '2026-08-01T08:00:00.000Z',
      updated_at: '2026-08-23T08:00:00.000Z', deleted_at: null,
    }
    const itemRows = [{
      id: 'srv-item', plan_id: 'srv-plan', name: 'Bench', sets: 4, reps: 8,
      weight_kg: 80, duration_minutes: null, distance_km: null, notes: null, position: 0,
    }]

    const { row, exercises } = workoutPlanToRows(workoutPlanToClient(planRow, itemRows), USER)

    expect(row).toEqual(planRow)
    expect(exercises).toEqual(itemRows)
  })

  it('keeps a reusable exercise item whole', () => {
    const row = {
      id: 'srv-exitem', user_id: USER, name: 'Squat', normalized_name: 'squat',
      sets: 5, reps: 5, weight_kg: 100, duration_minutes: null, distance_km: null,
      notes: null, usage_count: 9, last_used_at: '2026-08-23T18:00:00.000Z',
      created_at: '2026-08-01T08:00:00.000Z', updated_at: '2026-08-23T18:00:00.000Z',
      deleted_at: null,
    }
    expect(workoutExerciseItemToRow(workoutExerciseItemToClient(row), USER)).toEqual(row)
  })
})

describe('a deletion crossing the line', () => {
  it('travels down onto the device', () => {
    const row = {
      id: 'srv-meal', user_id: USER, date: '2026-08-23', name: 'Porridge', calories: 300,
      created_at: '2026-08-23T08:00:00.000Z', updated_at: '2026-08-23T09:00:00.000Z',
      deleted_at: '2026-08-23T09:00:00.000Z',
    }
    const client = calorieEntryToClient(row) as { deletedAt?: string }

    expect(client.deletedAt).toBe('2026-08-23T09:00:00.000Z')
    expect(calorieEntryToRow(client, USER).deleted_at).toBe('2026-08-23T09:00:00.000Z')
  })

  it('leaves no marker at all on a live record', () => {
    // `DaySummarySchema` is strict and spreads a workout session straight
    // through, so an unconditional `deletedAt: null` would fail the whole day.
    expect(withDeletion({ id: 'a' }, { deleted_at: null })).not.toHaveProperty('deletedAt')
    expect(calorieEntryToClient({
      id: 'a', user_id: USER, date: '2026-08-23', name: 'X', calories: 1,
      created_at: 'x', updated_at: 'x',
    })).not.toHaveProperty('deletedAt')
  })
})

describe('the unique key a constrained table is indexed on', () => {
  it('keeps the normalization that arrived, cased the way the column stores it', () => {
    const row = calorieItemToRow({
      id: 'a', name: 'Eggs', normalizedName: 'Eggs', quantity: '2 Eggs',
      normalizedQuantity: '2 Eggs', calories: 140,
    }, USER)

    expect(row.normalized_name).toBe('eggs')
    expect(row.normalized_quantity).toBe('2 eggs')
  })

  it('falls back to the name when none arrived — a missing key fails the exchange', () => {
    expect(calorieItemToRow({ id: 'a', name: '  Eggs ', calories: 1 }, USER).normalized_name)
      .toBe('eggs')
    expect(workoutExerciseItemToRow({ id: 'a', name: ' Squat ' }, USER).normalized_name)
      .toBe('squat')
  })
})
