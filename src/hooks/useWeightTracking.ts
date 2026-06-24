import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { WeightEntryInput, weightService } from '../services/api'

export function useWeightTracking(date: string) {
  const queryClient = useQueryClient()
  const dayKey = ['weight', date]
  const recentKey = ['weight', 'recent']

  const { data: entry, isLoading: isDayLoading } = useQuery({
    queryKey: dayKey,
    queryFn: () => weightService.getByDate(date),
  })

  const { data: trend, isLoading: isTrendLoading } = useQuery({
    queryKey: recentKey,
    queryFn: () => weightService.recent(30),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: dayKey })
    queryClient.invalidateQueries({ queryKey: recentKey })
  }

  const createMutation = useMutation({
    mutationFn: (input: WeightEntryInput) => weightService.create(input),
    onSuccess: invalidate,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<WeightEntryInput> }) =>
      weightService.update(id, patch),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => weightService.remove(id),
    onSuccess: invalidate,
  })

  return {
    entry: entry ?? null,
    trend: trend ?? { entries: [], latest: null, previous: null, deltaKg: null },
    isLoading: isDayLoading || isTrendLoading,
    createEntry: createMutation.mutate,
    updateEntry: updateMutation.mutate,
    deleteEntry: deleteMutation.mutate,
  }
}
