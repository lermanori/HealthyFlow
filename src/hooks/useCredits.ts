import { useQuery } from '@tanstack/react-query'
import { creditsService } from '../services/api'
import { availableActionCount } from '../utils/creditAvailability'

export function useCredits() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['credits-summary'],
    queryFn: creditsService.getSummary,
  })

  return {
    balance: data ? availableActionCount(data) : null,
    summary: data ?? null,
    isLoading,
    isUnavailable: isError || data?.freeGrant.state === 'unavailable',
    refetch,
  }
}
