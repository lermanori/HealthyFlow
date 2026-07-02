import { useQuery } from '@tanstack/react-query'
import { WorkoutExerciseItem, workoutsService } from '../services/api'

export function useWorkoutExerciseItems(sort: 'recent' | 'most-used', limit = 8) {
  const { data, isLoading } = useQuery({
    queryKey: ['workout-exercise-items', sort, limit],
    queryFn: () => workoutsService.items(sort, limit),
  })

  return {
    items: (data ?? []) as WorkoutExerciseItem[],
    isLoading,
  }
}
