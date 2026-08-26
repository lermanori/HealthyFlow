import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  GOALS_QUERY_KEY,
  goalService,
  type GoalCreateInput,
  type GoalUpdateInput,
} from '../services/api'

export function useGoals(enabled = true) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: GOALS_QUERY_KEY,
    queryFn: () => goalService.getGoals(true),
    enabled,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY })
  const createMutation = useMutation({
    mutationFn: (input: GoalCreateInput) => goalService.createGoal(input),
    onSuccess: refresh,
  })
  const updateMutation = useMutation({
    mutationFn: ({ goalId, input }: { goalId: string; input: GoalUpdateInput }) =>
      goalService.updateGoal(goalId, input),
    onSuccess: refresh,
  })

  return {
    goals: query.data,
    resolution: query.data ? 'ready' as const : query.isError ? 'error' as const : 'loading' as const,
    error: query.error,
    retry: query.refetch,
    createGoal: createMutation.mutateAsync,
    updateGoal: (goalId: string, input: GoalUpdateInput) => updateMutation.mutateAsync({ goalId, input }),
    isSaving: createMutation.isPending || updateMutation.isPending,
  }
}
