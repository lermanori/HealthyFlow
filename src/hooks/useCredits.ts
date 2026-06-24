import { useQuery } from '@tanstack/react-query'
import { creditsService } from '../services/api'

export function useCredits() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['credits'],
    queryFn: creditsService.getBalance,
  })

  return {
    balance: data?.balance ?? 0,
    isLoading,
    refetch,
  }
}
