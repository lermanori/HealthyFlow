import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { caloriesService, CalorieEntry, CalorieEntryInput } from '../services/api'
import type { ItemSource } from '../lib/analytics/types'

export function useCalorieEntries(date: string) {
  const queryClient = useQueryClient()
  const queryKey = ['calories', date]
  const calorieItemsKey = ['calorie-items']

  const { data: entries, isLoading } = useQuery({
    queryKey,
    queryFn: () => caloriesService.list(date),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey })
    queryClient.invalidateQueries({ queryKey: calorieItemsKey })
  }

  const createMutation = useMutation({
    mutationFn: ({ entry, source }: { entry: CalorieEntryInput; source?: ItemSource }) =>
      caloriesService.create(entry, source),
    onSuccess: invalidate,
    onError: () => toast.error('Failed to save calorie entry'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CalorieEntryInput> }) =>
      caloriesService.update(id, patch),
    onSuccess: invalidate,
    onError: () => toast.error('Failed to update calorie entry'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => caloriesService.remove(id),
    onSuccess: invalidate,
    onError: () => toast.error('Failed to delete calorie entry'),
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
    createEntry: (entry: CalorieEntryInput, source: ItemSource = 'manual') =>
      createMutation.mutate({ entry, source }),
    updateEntry: updateMutation.mutate,
    deleteEntry: deleteMutation.mutate,
  }
}
