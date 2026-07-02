import { useQuery } from '@tanstack/react-query'
import { creditsService } from '../services/api'

export function useCredits() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['credits-summary'],
    queryFn: creditsService.getSummary,
  })

  return {
    balance: data?.balance ?? 0,
    summary: data ?? null,
    isLoading,
    refetch,
  }
}
