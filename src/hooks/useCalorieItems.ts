import { useQuery } from '@tanstack/react-query'
import { CalorieItem, caloriesService } from '../services/api'

export function useCalorieItems(sort: 'recent' | 'most-used', limit = 8) {
  const { data, isLoading } = useQuery({
    queryKey: ['calorie-items', sort, limit],
    queryFn: () => caloriesService.items(sort, limit),
  })

  return {
    items: (data ?? []) as CalorieItem[],
    isLoading,
  }
}
