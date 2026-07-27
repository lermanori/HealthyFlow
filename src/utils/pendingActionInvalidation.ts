import type { QueryClient } from '@tanstack/react-query'
import {
  DAILY_SIGNALS_QUERY_KEY,
  DAY_SUMMARY_QUERY_KEY,
  WEEK_SUMMARY_QUERY_KEY,
  type AssistantPendingAction,
} from '../services/api'

export async function invalidatePendingActionQueries(
  queryClient: QueryClient,
  action: Pick<AssistantPendingAction, 'capability'>
) {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: WEEK_SUMMARY_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: DAILY_SIGNALS_QUERY_KEY }),
  ]

  if (['add_task', 'add_habit', 'update_item', 'complete_task', 'delete_item'].includes(action.capability)) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['habit-streaks'] })
    )
  }
  if (['add_calorie_entry', 'add_calorie_entries'].includes(action.capability)) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ['calories'] }),
      queryClient.invalidateQueries({ queryKey: ['calorie-items'] })
    )
  }
  if (action.capability === 'add_weight_entry') {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['weight'] }))
  }
  if (action.capability === 'add_achievement_entry') {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['achievements'] }))
  }
  if (action.capability === 'add_workout_session') {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ['workout-sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['workout-exercise-items'] })
    )
  }

  await Promise.all(invalidations)
}
