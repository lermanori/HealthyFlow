import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DAILY_SIGNALS_QUERY_KEY, DAY_SUMMARY_QUERY_KEY, settingsService, UserSettings } from '../services/api'
import {
  resolveModuleAvailabilities,
  type SettingsResolution,
} from '../modulePresentation'

const QUERY_KEY = ['settings']

export type { ModuleAvailability, OptionalModule, SettingsResolution } from '../modulePresentation'

// Source of truth is the settings record; mirror to localStorage + <html> so the
// theme applies pre-fetch (see inline snippet in index.html) with no flash.
export function applyTheme(theme: UserSettings['theme']) {
  localStorage.setItem('hf-theme', theme)
  if (theme === 'white') {
    document.documentElement.setAttribute('data-theme', 'white')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'white' ? '#F7F5F0' : '#16181C')
}

export function useSettings(enabled = true) {
  const queryClient = useQueryClient()

  const settingsQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: settingsService.getSettings,
    enabled,
  })
  const settings = settingsQuery.data
  const resolution: SettingsResolution = settings
    ? 'ready'
    : settingsQuery.isError
      ? 'error'
      : 'loading'

  useEffect(() => {
    if (settings?.theme) applyTheme(settings.theme)
  }, [settings?.theme])

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
      queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: DAILY_SIGNALS_QUERY_KEY })
    },
  })

  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    mutation.mutate({ [key]: value })
  }

  return {
    settings,
    resolution,
    isLoading: resolution === 'loading',
    error: settingsQuery.error,
    retry: settingsQuery.refetch,
    modules: resolveModuleAvailabilities(settings, resolution),
    updateSetting,
  }
}
