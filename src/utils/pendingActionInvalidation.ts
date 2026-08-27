import type { QueryClient } from '@tanstack/react-query'
import {
  DAILY_SIGNALS_QUERY_KEY,
  DAY_SUMMARY_QUERY_KEY,
  HABIT_HISTORY_QUERY_KEY,
  type AssistantPendingAction,
} from '../services/api'

export async function invalidatePendingActionQueries(
  queryClient: QueryClient,
  action: Pick<AssistantPendingAction, 'capability'>
) {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: DAILY_SIGNALS_QUERY_KEY }),
  ]

  if ([
    'place_item',
    'schedule_meal',
    'schedule_workout',
    'defer_task',
    'add_task',
    'add_habit',
    'update_item',
    'complete_task',
    'delete_item',
    'record_habit_outcome',
    'record_habit_progress',
  ].includes(action.capability)) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['habit-streaks'] }),
      queryClient.invalidateQueries({ queryKey: HABIT_HISTORY_QUERY_KEY })
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
  if ([
    'add_work_task',
    'create_focus_block',
    'transition_focus_block',
    'complete_work_review',
    'update_work_task',
    'update_project_context',
  ].includes(action.capability)) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['work'] }))
  }

  await Promise.all(invalidations)
}
