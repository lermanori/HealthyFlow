import { z } from 'zod'

export const SettingsCategoryIdSchema = z.enum([
  'account-billing',
  'planning',
  'notifications',
  'health-tools',
  'appearance',
  'connections-advanced',
  'data-privacy',
])

const SettingsCategorySchema = z.object({
  id: SettingsCategoryIdSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  order: z.number().int().nonnegative(),
  classification: z.enum(['routine', 'advanced', 'destructive']),
  icon: z.enum(['user', 'calendar', 'bell', 'health', 'appearance', 'connection', 'shield']),
}).strict()

export type SettingsCategoryId = z.infer<typeof SettingsCategoryIdSchema>
export type SettingsCategory = z.infer<typeof SettingsCategorySchema>

export const SETTINGS_CATEGORIES = z.array(SettingsCategorySchema).parse([
  {
    id: 'account-billing',
    label: 'Account & Billing',
    description: 'Profile, AI credits, and subscription status.',
    order: 10,
    classification: 'routine',
    icon: 'user',
  },
  {
    id: 'planning',
    label: 'Planning',
    description: 'Planning rhythm, usable day, and week preferences.',
    order: 20,
    classification: 'routine',
    icon: 'calendar',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Push permission, reminders, and reports.',
    order: 30,
    classification: 'routine',
    icon: 'bell',
  },
  {
    id: 'health-tools',
    label: 'Health tools',
    description: 'Choose which Health trackers are presented.',
    order: 40,
    classification: 'routine',
    icon: 'health',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme and interface feedback.',
    order: 50,
    classification: 'routine',
    icon: 'appearance',
  },
  {
    id: 'connections-advanced',
    label: 'Connections & Advanced',
    description: 'Calendar, ChatGPT, and developer connections.',
    order: 60,
    classification: 'advanced',
    icon: 'connection',
  },
  {
    id: 'data-privacy',
    label: 'Data & Privacy',
    description: 'Export and destructive account controls.',
    order: 70,
    classification: 'destructive',
    icon: 'shield',
  },
])

export function parseSettingsCategory(pathname: string): SettingsCategoryId | null {
  const segment = pathname.match(/^\/settings\/([^/]+)\/?$/)?.[1]
  if (!segment) return null
  const parsed = SettingsCategoryIdSchema.safeParse(segment)
  return parsed.success ? parsed.data : null
}
