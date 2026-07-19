import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsService, UserSettings } from '../services/api'

const QUERY_KEY = ['settings']

export type SettingsResolution = 'loading' | 'ready' | 'error'
export type ModuleAvailability = 'loading' | 'enabled' | 'disabled' | 'error'
export type OptionalModule = 'calories' | 'achievements' | 'workouts'

const moduleSetting: Record<OptionalModule, keyof Pick<UserSettings, 'calorieIntake' | 'achievementTracker' | 'workoutTracker'>> = {
  calories: 'calorieIntake',
  achievements: 'achievementTracker',
  workouts: 'workoutTracker',
}

export function resolveModuleAvailability(
  settings: UserSettings | undefined,
  resolution: SettingsResolution,
  module: OptionalModule
): ModuleAvailability {
  if (resolution === 'loading') return 'loading'
  if (resolution === 'error' || !settings) return 'error'
  return settings[moduleSetting[module]] ? 'enabled' : 'disabled'
}

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
  if (meta) meta.setAttribute('content', theme === 'white' ? '#f8fafc' : '#101828')
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
    modules: {
      calories: resolveModuleAvailability(settings, resolution, 'calories'),
      achievements: resolveModuleAvailability(settings, resolution, 'achievements'),
      workouts: resolveModuleAvailability(settings, resolution, 'workouts'),
    } satisfies Record<OptionalModule, ModuleAvailability>,
    updateSetting,
  }
}
