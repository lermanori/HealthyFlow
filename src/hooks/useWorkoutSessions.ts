import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  WorkoutExerciseInput,
  WorkoutSessionInput,
  WorkoutSessionPatch,
  workoutsService,
} from '../services/api'

export function useWorkoutSessions(date: string) {
  const queryClient = useQueryClient()
  const queryKey = ['workouts', date]
  const exerciseItemsKey = ['workout-exercise-items']

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => workoutsService.list(date),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey })
    queryClient.invalidateQueries({ queryKey: exerciseItemsKey })
  }

  const createMutation = useMutation({
    mutationFn: (session: WorkoutSessionInput) => workoutsService.create(session),
    onSuccess: invalidate,
    onError: () => toast.error('Failed to save workout session'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: WorkoutSessionPatch }) =>
      workoutsService.update(id, patch),
    onSuccess: invalidate,
    onError: () => toast.error('Failed to update workout session'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workoutsService.remove(id),
    onSuccess: invalidate,
    onError: () => toast.error('Failed to delete workout session'),
  })

  const addExerciseMutation = useMutation({
    mutationFn: ({ sessionId, exercise }: { sessionId: string; exercise: WorkoutExerciseInput }) =>
      workoutsService.addExercise(sessionId, exercise),
    onSuccess: invalidate,
    onError: () => toast.error('Failed to add exercise'),
  })

  const updateExerciseMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<WorkoutExerciseInput> }) =>
      workoutsService.updateExercise(id, patch),
    onSuccess: invalidate,
    onError: () => toast.error('Failed to update exercise'),
  })

  const deleteExerciseMutation = useMutation({
    mutationFn: (id: string) => workoutsService.removeExercise(id),
    onSuccess: invalidate,
    onError: () => toast.error('Failed to delete exercise'),
  })

  return {
    sessions: data ?? [],
    isLoading,
    createSession: createMutation.mutate,
    updateSession: updateMutation.mutate,
    deleteSession: deleteMutation.mutate,
    addExercise: addExerciseMutation.mutate,
    updateExercise: updateExerciseMutation.mutate,
    deleteExercise: deleteExerciseMutation.mutate,
  }
}
