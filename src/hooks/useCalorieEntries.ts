import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { caloriesService, CalorieEntry, CalorieEntryInput } from '../services/api'

export function useCalorieEntries(date: string) {
  const queryClient = useQueryClient()
  const queryKey = ['calories', date]

  const { data: entries, isLoading } = useQuery({
    queryKey,
    queryFn: () => caloriesService.list(date),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  const createMutation = useMutation({
    mutationFn: (entry: CalorieEntryInput) => caloriesService.create(entry),
    onSuccess: invalidate,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CalorieEntryInput> }) =>
      caloriesService.update(id, patch),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => caloriesService.remove(id),
    onSuccess: invalidate,
  })

  const totals = (entries ?? []).reduce(
    (acc: { calories: number; protein: number; carbs: number; fat: number }, e: CalorieEntry) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + (e.protein ?? 0),
      carbs: acc.carbs + (e.carbs ?? 0),
      fat: acc.fat + (e.fat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )

  return {
    entries: entries ?? [],
    isLoading,
    totals,
    createEntry: createMutation.mutate,
    updateEntry: updateMutation.mutate,
    deleteEntry: deleteMutation.mutate,
  }
}
