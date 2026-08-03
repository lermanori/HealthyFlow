import { Briefcase, HeartPulse, ListTodo, RefreshCw } from 'lucide-react'
import { z } from 'zod'

export const demoPersonas = [
  {
    id: 'maya',
    name: 'Maya',
    fullName: 'Maya Chen',
    role: 'The Operator',
    problem: 'Workday overload',
    copy: 'Turn a messy workday into a plan.',
    duration: '30 sec',
    outcome: 'Turn my day into a plan',
    activationPrompt: 'What is competing for your attention today?',
    valueHeadline: 'Maya doesn’t need another list. She needs a day with shape.',
    valueCopy: 'HealthyFlow turns disconnected notes into a plan without pretending every Item is equally urgent.',
    transformation: [
      ['Five disconnected notes', 'Four clear Items'],
      ['Everything feels urgent', 'One protected focus block'],
      ['Loose task disappears tomorrow', 'Rollover keeps it visible'],
    ],
    proof: [
      ['Captured together', 'Messy notes become clear Items'],
      ['Protected on the clock', 'Pricing email · 09:00'],
      ['Kept visible for later', 'Dentist appointment · Anytime'],
    ],
    icon: Briefcase,
    preview: [
      ['07:45', 'Paste messy notes into parse-tasks'],
      ['09:00', 'Reply to pricing email'],
      ['11:00', 'Review launch page copy'],
      ['14:00', 'Prep investor update bullets'],
      ['Anytime', 'Book dentist appointment'],
    ],
  },
  {
    id: 'noam',
    name: 'Noam',
    fullName: 'Noam Levi',
    role: 'The Reset User',
    problem: 'Stuck and overwhelmed',
    copy: 'Find one manageable next step.',
    duration: '30 sec',
    outcome: 'Start with one manageable thing',
    activationPrompt: 'What feels hardest to start right now?',
    valueHeadline: 'Noam doesn’t need a perfect plan. He needs one manageable move.',
    valueCopy: 'HealthyFlow reduces the pressure without hiding the rest of his day.',
    transformation: [
      ['A heavy list', 'One visible next step'],
      ['A task carried forward', 'One small time slot'],
      ['Everything at once', 'The rest stays safely visible'],
    ],
    proof: [
      ['Focus now', 'Take medication with breakfast'],
      ['Next fixed point', 'Put laundry in the machine · 11:00'],
      ['Safely visible for later', 'Electricity bill, Dana reply, reset walk'],
    ],
    icon: RefreshCw,
    preview: [
      ['08:00', 'Take medication with breakfast'],
      ['Anytime', 'Open the electricity bill'],
      ['Anytime', 'Text Dana about reply window'],
      ['11:00', 'Put laundry in the machine'],
      ['Rollover', 'Call the clinic back'],
    ],
  },
  {
    id: 'lina',
    name: 'Lina',
    fullName: 'Lina Haddad',
    role: 'The Health Tracker',
    problem: 'Health scattered across apps',
    copy: 'See health as part of the same day.',
    duration: '30 sec',
    outcome: 'Bring my health into one day',
    activationPrompt: 'What would you like to track as part of today?',
    valueHeadline: 'Lina doesn’t need four health apps. She needs one connected day.',
    valueCopy: 'HealthyFlow keeps habits, meals, training, and progress in the same daily picture.',
    transformation: [
      ['Separate health trackers', 'One daily view'],
      ['Meals and training apart', 'One connected timeline'],
      ['Progress buried in logs', 'Trends stay easy to see'],
    ],
    proof: [
      ['Morning habit', 'Drink water before coffee · 07:30'],
      ['Meals on the clock', 'Breakfast · 08:20, lunch · 12:45'],
      ['Training protected', 'Upper body strength plan · 18:00'],
    ],
    icon: HeartPulse,
    preview: [
      ['07:30', 'Drink water before coffee'],
      ['08:20', 'Greek yogurt bowl'],
      ['12:45', 'Chicken salad'],
      ['18:00', 'Upper body strength plan'],
      ['Progress', '5K time trend'],
    ],
  },
  {
    id: 'amir',
    name: 'Amir',
    fullName: 'Amir Cohen',
    role: 'The Real-Life Juggler',
    problem: 'Everything changed again',
    copy: 'Re-plan without losing what matters.',
    duration: '30 sec',
    outcome: 'Build a plan that can change',
    activationPrompt: 'What is fixed today, and what can move?',
    valueHeadline: 'Amir doesn’t need a rigid plan. He needs one that can change.',
    valueCopy: 'HealthyFlow protects fixed commitments while keeping movable work and Rollover visible.',
    transformation: [
      ['The plan changed', 'Fixed commitments stay protected'],
      ['Flexible work gets lost', 'Movable Tasks stay visible'],
      ['Yesterday follows you', 'Rollover gets a deliberate place'],
    ],
    proof: [
      ['Fixed commitments', 'Standup · 09:00, school pickup · 15:00'],
      ['Movable work', 'Groceries and plumber · Anytime'],
      ['Deliberate Rollover', 'School forms remain visible'],
    ],
    icon: ListTodo,
    preview: [
      ['09:00', 'Standup with product team'],
      ['10:00', 'Deep work: API cleanup'],
      ['15:00', 'School pickup'],
      ['Anytime', 'Buy milk, bananas, and pasta'],
      ['Rollover', 'Pack school forms'],
    ],
  },
] as const

export const DemoPersonaIdSchema = z.enum(['maya', 'noam', 'lina', 'amir'])
export type DemoPersonaId = z.infer<typeof DemoPersonaIdSchema>

export function demoPersonaById(id: DemoPersonaId) {
  return demoPersonas.find((persona) => persona.id === id) ?? demoPersonas[0]
}

export function parseDemoPersonaId(value: string | null | undefined): DemoPersonaId {
  const parsed = DemoPersonaIdSchema.safeParse(value)
  return parsed.success ? parsed.data : 'maya'
}

export const DemoAcquisitionSchema = z.object({
  persona: DemoPersonaIdSchema,
  entrySource: z.string().min(1).max(60),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
})
export type DemoAcquisition = z.infer<typeof DemoAcquisitionSchema>

const DEMO_ACQUISITION_KEY = 'healthyflow-demo-acquisition-v1'

function optionalParam(params: URLSearchParams, name: string) {
  const value = params.get(name)?.trim()
  return value || undefined
}

export function readDemoAcquisition(): DemoAcquisition | null {
  try {
    const raw = sessionStorage.getItem(DEMO_ACQUISITION_KEY)
    if (!raw) return null
    const parsed = DemoAcquisitionSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function beginDemoAcquisition(
  persona: DemoPersonaId,
  params = new URLSearchParams(),
): DemoAcquisition {
  const existing = readDemoAcquisition()
  const acquisition = DemoAcquisitionSchema.parse({
    persona,
    entrySource: optionalParam(params, 'source') ?? existing?.entrySource ?? 'direct',
    utmSource: optionalParam(params, 'utm_source') ?? existing?.utmSource,
    utmMedium: optionalParam(params, 'utm_medium') ?? existing?.utmMedium,
    utmCampaign: optionalParam(params, 'utm_campaign') ?? existing?.utmCampaign,
  })
  sessionStorage.setItem(DEMO_ACQUISITION_KEY, JSON.stringify(acquisition))
  return acquisition
}

export function clearDemoAcquisition() {
  sessionStorage.removeItem(DEMO_ACQUISITION_KEY)
}

export function demoSignupSearch(acquisition: DemoAcquisition) {
  const params = new URLSearchParams({
    mode: 'signup',
    from: 'demo',
    persona: acquisition.persona,
    source: acquisition.entrySource,
  })
  if (acquisition.utmSource) params.set('utm_source', acquisition.utmSource)
  if (acquisition.utmMedium) params.set('utm_medium', acquisition.utmMedium)
  if (acquisition.utmCampaign) params.set('utm_campaign', acquisition.utmCampaign)
  return params.toString()
}
