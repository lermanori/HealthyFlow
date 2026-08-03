import { z } from 'zod'
import SettingsContracts, { type Settings as UserSettings } from '../backend/src/settings-schema'

const { ModuleSettingKeySchema } = SettingsContracts

export const OptionalModuleSchema = z.enum(['calories', 'workouts', 'achievements'])
export const ModuleAvailabilitySchema = z.enum(['loading', 'enabled', 'disabled', 'error'])
export const SettingsResolutionSchema = z.enum(['loading', 'ready', 'error'])
export const ModuleStatusSemanticsSchema = z.enum(['tracker', 'goal', 'hybrid'])

const ModulePresentationSchema = z.object({
  id: OptionalModuleSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  settingKey: ModuleSettingKeySchema,
  defaultEnabled: z.boolean(),
  statusSemantics: ModuleStatusSemanticsSchema,
  route: z.object({
    path: z.string().startsWith('/'),
    activePaths: z.array(z.string().startsWith('/')).min(1),
  }).strict(),
  healthNavigation: z.object({
    order: z.number().int().nonnegative(),
    icon: z.enum(['activity', 'dumbbell', 'award']),
    dateAware: z.boolean(),
    defaultSearch: z.record(z.string(), z.string()),
  }).strict(),
  addTarget: z.enum(['calories', 'achievements']).nullable(),
  todaySummary: z.enum(['nutrition', 'workouts', 'progress']).nullable(),
  weekSummary: z.string().nullable(),
  settingsCategory: z.literal('health-tools'),
  analyticsId: z.string().min(1),
  permission: z.literal('authenticated'),
  states: z.object({
    empty: z.string().min(1),
    disabled: z.string().min(1),
    error: z.string().min(1),
  }).strict(),
}).strict()

export type OptionalModule = z.infer<typeof OptionalModuleSchema>
export type ModuleAvailability = z.infer<typeof ModuleAvailabilitySchema>
export type SettingsResolution = z.infer<typeof SettingsResolutionSchema>
export type ModuleStatusSemantics = z.infer<typeof ModuleStatusSemanticsSchema>
export type ModulePresentation = z.infer<typeof ModulePresentationSchema>

export const MODULE_PRESENTATIONS = z.array(ModulePresentationSchema).parse([
  {
    id: 'calories',
    label: 'Nutrition',
    description: 'Track Calorie entries, macros, and body-weight records.',
    settingKey: 'calorieIntake',
    defaultEnabled: true,
    statusSemantics: 'tracker',
    route: {
      path: '/calories',
      activePaths: ['/calories'],
    },
    healthNavigation: {
      order: 10,
      icon: 'activity',
      dateAware: true,
      defaultSearch: {},
    },
    addTarget: 'calories',
    todaySummary: 'nutrition',
    weekSummary: null,
    settingsCategory: 'health-tools',
    analyticsId: 'calories',
    permission: 'authenticated',
    states: {
      empty: 'No Calorie entries recorded yet.',
      disabled: 'Nutrition is hidden for this account.',
      error: 'Nutrition availability could not be checked.',
    },
  },
  {
    id: 'workouts',
    label: 'Workouts',
    description: 'Track Workout sessions and reusable Workout plans.',
    settingKey: 'workoutTracker',
    defaultEnabled: true,
    statusSemantics: 'tracker',
    route: {
      path: '/workouts',
      activePaths: ['/workouts'],
    },
    healthNavigation: {
      order: 20,
      icon: 'dumbbell',
      dateAware: true,
      defaultSearch: { mode: 'session' },
    },
    addTarget: null,
    todaySummary: 'workouts',
    weekSummary: null,
    settingsCategory: 'health-tools',
    analyticsId: 'workouts',
    permission: 'authenticated',
    states: {
      empty: 'No Workout sessions recorded yet.',
      disabled: 'Workouts is hidden for this account.',
      error: 'Workout availability could not be checked.',
    },
  },
  {
    id: 'achievements',
    label: 'Progress',
    description: 'Track personal measurements with optional targets.',
    settingKey: 'achievementTracker',
    defaultEnabled: true,
    statusSemantics: 'hybrid',
    route: {
      path: '/achievements',
      activePaths: ['/achievements'],
    },
    healthNavigation: {
      order: 30,
      icon: 'award',
      dateAware: false,
      defaultSearch: {},
    },
    addTarget: 'achievements',
    todaySummary: 'progress',
    weekSummary: null,
    settingsCategory: 'health-tools',
    analyticsId: 'achievements',
    permission: 'authenticated',
    states: {
      empty: 'No Progress measurements are being tracked yet.',
      disabled: 'Progress is hidden for this account.',
      error: 'Progress availability could not be checked.',
    },
  },
])

const presentationById = Object.fromEntries(
  MODULE_PRESENTATIONS.map((presentation) => [presentation.id, presentation])
) as Record<OptionalModule, ModulePresentation>

export function getModulePresentation(module: OptionalModule): ModulePresentation {
  return presentationById[module]
}

export function resolveModuleAvailability(
  settings: UserSettings | undefined,
  resolution: SettingsResolution,
  module: OptionalModule
): ModuleAvailability {
  if (resolution === 'loading') return 'loading'
  if (resolution === 'error' || !settings) return 'error'
  return settings[getModulePresentation(module).settingKey] ? 'enabled' : 'disabled'
}

export function resolveModuleAvailabilities(
  settings: UserSettings | undefined,
  resolution: SettingsResolution
): Record<OptionalModule, ModuleAvailability> {
  return Object.fromEntries(
    MODULE_PRESENTATIONS.map((presentation) => [
      presentation.id,
      resolveModuleAvailability(settings, resolution, presentation.id),
    ])
  ) as Record<OptionalModule, ModuleAvailability>
}

export function resolveHealthAvailability(
  modules: Record<OptionalModule, ModuleAvailability>
): ModuleAvailability {
  const availability = Object.values(modules)
  if (availability.includes('enabled')) return 'enabled'
  if (availability.includes('loading')) return 'loading'
  if (availability.includes('error')) return 'error'
  return 'disabled'
}

export function enabledModulePresentations(
  modules: Record<OptionalModule, ModuleAvailability>
): ModulePresentation[] {
  return MODULE_PRESENTATIONS.filter((presentation) => modules[presentation.id] === 'enabled')
}

export function moduleHealthHref(
  presentation: ModulePresentation,
  date?: string
): string {
  const params = new URLSearchParams(presentation.healthNavigation.defaultSearch)
  if (date && presentation.healthNavigation.dateAware) params.set('date', date)
  const search = params.toString()
  return `${presentation.route.path}${search ? `?${search}` : ''}`
}

export function findModulePresentationByPath(pathname: string): ModulePresentation | undefined {
  return MODULE_PRESENTATIONS.find((presentation) =>
    presentation.route.activePaths.includes(pathname)
  )
}

const coreAnalyticsIdentity: Record<string, string> = {
  '/': 'today',
  '/talk': 'talk',
  '/week': 'week',
  '/health': 'health',
  '/settings': 'settings',
}

export function analyticsIdentityForPath(pathname: string): string | undefined {
  if (pathname.startsWith('/settings/')) return 'settings'
  return findModulePresentationByPath(pathname)?.analyticsId ?? coreAnalyticsIdentity[pathname]
}
