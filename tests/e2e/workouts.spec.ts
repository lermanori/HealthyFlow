import { test, expect } from './fixtures/ai-stubs'
import type { WorkoutExerciseInput, WorkoutPlan, WorkoutPlanInput } from '../../src/services/api'

function planExercise(exercise: WorkoutExerciseInput, index: number, planId = 'plan-1') {
  return {
    id: `plan-exercise-${index}`,
    planId,
    name: exercise.name,
    sets: exercise.sets ?? null,
    reps: exercise.reps ?? null,
    weightKg: exercise.weightKg ?? null,
    durationMinutes: exercise.durationMinutes ?? null,
    distanceKm: exercise.distanceKm ?? null,
    notes: exercise.notes ?? null,
    position: index,
  }
}

test('Workout Tracker logs mixed metrics, persists history, edits, and deletes', async ({ page }) => {
  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  await page.goto('/workouts')
  await expect(page.getByRole('heading', { name: 'Workout Tracker' })).toBeVisible()
  await page.getByRole('button', { name: 'Add exercise' }).click()

  await page.getByTestId('workout-session-title').fill('Mixed morning session')
  await page.getByTestId('workout-session-notes').fill('Felt solid')

  await page.getByTestId('workout-exercise-name').first().fill('Bench Press')
  await page.getByTestId('workout-exercise-sets').first().fill('3')
  await page.getByTestId('workout-exercise-reps').first().fill('8')
  await page.getByTestId('workout-exercise-weight').first().fill('70')
  await page.getByRole('button', { name: 'Add exercise' }).click()

  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByTestId('workout-exercise-name').first().fill('Mobility Flow')
  await page.getByTestId('workout-exercise-duration').first().fill('20')
  await page.getByTestId('workout-exercise-notes').first().fill('Duration only')
  await page.getByRole('button', { name: 'Save session' }).click()

  const history = page.getByTestId('workout-history')
  await expect(page.getByText('Mixed morning session')).toBeVisible()
  await expect(history.getByText('Bench Press')).toBeVisible()
  await expect(history.getByText('Mobility Flow')).toBeVisible()
  await expect(history.getByText('70 kg')).toBeVisible()
  await expect(history.getByText('20 min')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Mixed morning session')).toBeVisible()
  await expect(page.getByTestId('workout-history').getByText('Bench Press')).toBeVisible()
  await expect(page.getByTestId('workout-history').getByText('Mobility Flow')).toBeVisible()

  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByTestId('workout-quick-insert-item').filter({ hasText: 'Bench Press' })).toBeVisible()

  await page.getByTestId('edit-workout-exercise').first().click()
  await page.getByTestId('workout-exercise-name').last().fill('Incline Bench Press')
  await page.getByTestId('workout-exercise-reps').last().fill('10')
  await page.getByRole('button', { name: 'Save exercise changes' }).click()

  await expect(page.getByTestId('workout-history').getByText('Incline Bench Press')).toBeVisible()
  await expect(page.getByTestId('workout-history').getByText('10 reps')).toBeVisible()
  await expect(page.getByTestId('workout-history').getByText('Bench Press', { exact: true })).not.toBeVisible()

  await page.getByTestId('delete-workout-exercise').first().click()
  await expect(page.getByTestId('workout-history').getByText('Incline Bench Press')).not.toBeVisible()
  await expect(page.getByTestId('workout-history').getByText('Mobility Flow')).toBeVisible()

  await page.getByTestId('delete-workout-session').click()
  await expect(page.getByTestId('workout-history').getByText('Mobility Flow')).not.toBeVisible()
  await expect(page.getByText('No workout sessions for this day yet.')).toBeVisible()
})

test('Workout plans persist, reorder exercises, and pre-fill an editable session', async ({ page }) => {
  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  let plans: WorkoutPlan[] = []
  await page.route('**/api/workouts/plans**', async (route) => {
    const method = route.request().method()
    const url = new URL(route.request().url())
    const planId = url.pathname.match(/\/plans\/([^/]+)$/)?.[1]
    if (method === 'GET') return route.fulfill({ json: plans })
    if (method === 'POST' && url.pathname.endsWith('/plans/generate')) {
      return route.fulfill({ json: {
        name: 'AI mixed draft',
        color: '#8b5cf6',
        note: 'Generated draft to review',
        exercises: [
          { name: 'Air Squat', sets: 3, reps: 12, weightKg: null, durationMinutes: null, distanceKm: null, notes: null },
        ],
      } })
    }
    if (method === 'POST') {
      const input = route.request().postDataJSON() as WorkoutPlanInput
      const plan: WorkoutPlan = {
        ...input,
        id: 'plan-1',
        userId: 'e2e-user',
        color: input.color ?? null,
        note: input.note ?? null,
        position: 0,
        exercises: input.exercises.map((exercise, index) => planExercise(exercise, index)),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      plans = [plan]
      return route.fulfill({ status: 201, json: plan })
    }
    if (method === 'PATCH' && planId) {
      const input = route.request().postDataJSON() as WorkoutPlanInput
      plans = plans.map((plan) => plan.id === planId ? {
        ...plan,
        ...input,
        color: input.color ?? null,
        note: input.note ?? null,
        exercises: input.exercises.map((exercise, index) => planExercise(exercise, index, planId)),
      } : plan)
      return route.fulfill({ json: plans.find((plan) => plan.id === planId) })
    }
    if (method === 'DELETE') {
      plans = plans.filter((plan) => plan.id !== planId)
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fallback()
  })

  await page.goto('/workouts')
  await page.getByRole('button', { name: 'New Plan' }).click()

  const editor = page.getByTestId('workout-plan-editor')
  await editor.getByTestId('workout-plan-intent').fill('A mixed strength and mobility workout')
  await editor.getByRole('button', { name: 'Generate Draft' }).click()
  await expect(editor.getByTestId('workout-plan-name')).toHaveValue('AI mixed draft')
  await expect(editor.getByTestId('workout-plan-exercises').getByText('Air Squat')).toBeVisible()

  await editor.getByTestId('workout-plan-name').fill('Mixed training')
  await editor.getByTestId('workout-plan-note').fill('Editable before logging')

  await editor.getByTestId('workout-exercise-name').fill('Bench Press')
  await editor.getByTestId('workout-exercise-sets').fill('3')
  await editor.getByTestId('workout-exercise-reps').fill('8')
  await editor.getByRole('button', { name: 'Add to Plan' }).click()

  await editor.getByTestId('workout-exercise-name').fill('Mobility Flow')
  await editor.getByTestId('workout-exercise-duration').fill('20')
  await editor.getByRole('button', { name: 'Add to Plan' }).click()
  await editor.getByRole('button', { name: 'Move Mobility Flow up' }).click()
  await editor.getByRole('button', { name: 'Create Plan' }).click()

  const planCard = page.getByTestId('workout-plan-card').filter({ hasText: 'Mixed training' })
  await expect(planCard).toBeVisible()
  await expect(planCard.getByText('Mobility Flow')).toBeVisible()
  await expect(planCard.getByText('Bench Press')).toBeVisible()

  await page.reload()
  const persistedPlan = page.getByTestId('workout-plan-card').filter({ hasText: 'Mixed training' })
  await expect(persistedPlan).toBeVisible()
  await persistedPlan.getByRole('button', { name: 'Start Session' }).click()

  await expect(page.getByTestId('workout-session-title')).toHaveValue('Mixed training')
  const sessionExercises = page.getByRole('region', { name: 'Session exercises (3)' })
  await expect(sessionExercises).toBeVisible()
  await expect(sessionExercises.getByText('Mobility Flow')).toBeVisible()
  await expect(sessionExercises.getByText('Bench Press')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Add another exercise' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByRole('heading', { name: 'Add another exercise' })).toBeVisible()

  await page.getByRole('button', { name: 'Edit draft Bench Press' }).click()
  await expect(page.getByTestId('workout-exercise-sets').last()).toHaveValue('3')
  await expect(page.getByTestId('workout-exercise-reps').last()).toHaveValue('8')
  await page.getByTestId('workout-exercise-reps').last().fill('10')
  await page.getByRole('button', { name: 'Update Exercise' }).click()

  await page.getByTestId('workout-session-title').fill('Adjusted mixed training')
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByTestId('workout-exercise-name').last().fill('Easy Run')
  await page.getByTestId('workout-exercise-distance').last().fill('3')
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByRole('region', { name: 'Session exercises (4)' }).getByText('Easy Run')).toBeVisible()
  await page.getByRole('button', { name: 'Save session' }).click()

  const history = page.getByTestId('workout-history')
  await expect(history.getByText('Adjusted mixed training')).toBeVisible()
  await expect(history.getByText('Mobility Flow')).toBeVisible()
  await expect(history.getByText('Bench Press')).toBeVisible()
  await expect(history.getByText('Easy Run')).toBeVisible()

  await persistedPlan.getByRole('button', { name: 'Edit Mixed training' }).click()
  await page.getByTestId('workout-plan-name').fill('Flexible plan')
  await page.getByRole('button', { name: 'Save Plan' }).click()
  await expect(page.getByTestId('workout-plan-card').filter({ hasText: 'Flexible plan' })).toBeVisible()

  await page.getByRole('button', { name: 'Delete Flexible plan' }).click()
  await expect(page.getByTestId('workout-plan-card').filter({ hasText: 'Flexible plan' })).toHaveCount(0)
})

test('Workout planning stays editable and reachable on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  await page.route('**/api/workouts/exercises**', (route) => route.fulfill({ json: [{
    id: 'recent-1',
    userId: 'e2e-user',
    name: 'Weighted Bulgarian Split Squat',
    normalizedName: 'weighted bulgarian split squat',
    sets: 4,
    reps: 10,
    weightKg: 22.5,
    durationMinutes: null,
    distanceKm: null,
    notes: 'Each leg',
    usageCount: 3,
    lastUsedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }] }))

  await page.goto('/workouts')
  await page.getByRole('button', { name: 'New Plan' }).click()
  const editor = page.getByTestId('workout-plan-editor')
  await editor.getByRole('button', { name: /Weighted Bulgarian Split Squat/ }).click()
  await expect(editor.getByTestId('workout-exercise-sets')).toHaveValue('4')
  await expect(editor.getByTestId('workout-exercise-reps')).toHaveValue('10')
  await expect(editor.getByTestId('workout-exercise-weight')).toHaveValue('22.5')

  await editor.getByRole('button', { name: 'Add to Plan' }).click()
  const exerciseRow = editor.getByTestId('workout-plan-exercise-row')
  await expect(exerciseRow.getByText('Weighted Bulgarian Split Squat')).toBeVisible()
  await expect(exerciseRow).toHaveJSProperty('scrollWidth', await exerciseRow.evaluate((element) => element.clientWidth))
  const removeBox = await exerciseRow.getByRole('button', { name: /Remove Weighted/ }).boundingBox()
  expect(removeBox).not.toBeNull()
  expect((removeBox?.x ?? 999) + (removeBox?.width ?? 999)).toBeLessThanOrEqual(390)

  await editor.getByTestId('workout-exercise-weight').evaluate((input: HTMLInputElement) => input.type)
  await expect(editor.getByTestId('workout-exercise-weight')).toHaveAttribute('type', 'text')
})
