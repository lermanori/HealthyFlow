import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsService, UserSettings } from '../services/api'

const QUERY_KEY = ['settings']

export function useSettings(enabled = true) {
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: settingsService.getSettings,
    enabled,
  })

  const mutation = useMutation({
    mutationFn: (partial: Partial<UserSettings>) => settingsService.updateSettings(partial),
    onMutate: async (partial: Partial<UserSettings>) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const previous = queryClient.getQueryData<UserSettings>(QUERY_KEY)
      if (previous) {
        queryClient.setQueryData<UserSettings>(QUERY_KEY, { ...previous, ...partial })
      }
      return { previous }
    },
    onError: (_err, _partial, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  const updateSetting = (key: keyof UserSettings, value: boolean) => {
    mutation.mutate({ [key]: value })
  }

  return { settings, isLoading, updateSetting }
}
