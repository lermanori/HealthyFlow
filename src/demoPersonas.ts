import { Briefcase, HeartPulse, ListTodo, RefreshCw } from 'lucide-react'

export const demoPersonas = [
  {
    id: 'maya',
    name: 'Maya',
    fullName: 'Maya Chen',
    role: 'The Operator',
    copy: 'Turn a messy workday into a plan.',
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
    copy: 'Find the next doable step.',
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
    copy: 'Track habits, food, workouts, and progress.',
    icon: HeartPulse,
    preview: [
      ['07:30', 'Drink water before coffee'],
      ['08:20', 'Greek yogurt bowl'],
      ['12:45', 'Chicken salad'],
      ['18:00', 'Upper body workout'],
      ['Progress', '5K time trend'],
    ],
  },
  {
    id: 'amir',
    name: 'Amir',
    fullName: 'Amir Cohen',
    role: 'The Real-Life Juggler',
    copy: 'Keep life moving when the day changes.',
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

export type DemoPersonaId = typeof demoPersonas[number]['id']

export function demoPersonaById(id: DemoPersonaId) {
  return demoPersonas.find((persona) => persona.id === id) ?? demoPersonas[0]
}
