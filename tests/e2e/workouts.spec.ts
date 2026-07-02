import { test, expect } from './fixtures/ai-stubs'

test('Workout Tracker logs mixed metrics, persists history, edits, and deletes', async ({ page }) => {
  const reset = await page.request.post('http://localhost:3001/test/reset')
  expect(reset.ok()).toBeTruthy()

  await page.goto('/workouts')
  await expect(page.getByRole('heading', { name: 'Workout Tracker' })).toBeVisible()

  await page.getByTestId('workout-session-title').fill('Mixed morning session')
  await page.getByTestId('workout-session-notes').fill('Felt solid')

  await page.getByTestId('workout-exercise-name').first().fill('Bench Press')
  await page.getByTestId('workout-exercise-sets').first().fill('3')
  await page.getByTestId('workout-exercise-reps').first().fill('8')
  await page.getByTestId('workout-exercise-weight').first().fill('70')
  await page.getByRole('button', { name: 'Add Exercise' }).click()

  await page.getByTestId('workout-exercise-name').first().fill('Mobility Flow')
  await page.getByTestId('workout-exercise-duration').first().fill('20')
  await page.getByTestId('workout-exercise-notes').first().fill('Duration only')
  await page.getByRole('button', { name: 'Save Session' }).click()

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
