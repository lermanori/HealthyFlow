import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LAB_DIR = dirname(fileURLToPath(import.meta.url))

function weekdayDate(date) {
  const instant = new Date(`${date}T12:00:00.000Z`)
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(instant)
  return `${weekday}, ${date}`
}

function offsetDate(date, offset) {
  const instant = new Date(`${date}T12:00:00.000Z`)
  instant.setUTCDate(instant.getUTCDate() + offset)
  return instant.toISOString().slice(0, 10)
}

export function dateContext(anchor) {
  const nextSeven = Array.from({ length: 7 }, (_, index) => `- ${weekdayDate(offsetDate(anchor.date, index))}`).join('\n')
  return `Date context:
- Client time zone: ${anchor.timeZone}
- Current local date: ${weekdayDate(anchor.date)}
- Current local time: ${anchor.time}
- Yesterday: ${weekdayDate(offsetDate(anchor.date, -1))}
- Tomorrow: ${weekdayDate(offsetDate(anchor.date, 1))}

Next 7 days (counting today):
${nextSeven}

Named weekday resolution:
- A bare weekday name means the NEXT occurrence, counting today if it matches.
- Hebrew weekday names: ראשון=Sunday, שני=Monday, שלישי=Tuesday, רביעי=Wednesday, חמישי=Thursday, שישי=Friday, שבת=Saturday.
- The Israeli week starts on Sunday.
- Never compute a weekday from a date yourself; use the dated list above.`
}

export function loadScenarios() {
  const scenarios = JSON.parse(readFileSync(join(LAB_DIR, 'scenarios.json'), 'utf8'))
  if (!Array.isArray(scenarios) || scenarios.length === 0) throw new Error('Talk scenarios must be a nonempty array')
  const ids = new Set()
  for (const scenario of scenarios) {
    if (!scenario || typeof scenario.id !== 'string' || !/^[a-z0-9-]+$/.test(scenario.id) || ids.has(scenario.id)) {
      throw new Error(`Talk scenario has an invalid or duplicate id: ${scenario?.id ?? '(missing)'}`)
    }
    ids.add(scenario.id)
    if (typeof scenario.label !== 'string' || !scenario.label.trim()
      || !/^\d{4}-\d{2}-\d{2}$/.test(scenario.anchor?.date ?? '')
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(scenario.anchor?.time ?? '')
      || typeof scenario.anchor?.timeZone !== 'string'
      || !scenario.anchor.timeZone.trim()) {
      throw new Error(`Talk scenario ${scenario.id} has invalid label or date context`)
    }
    const turns = scenario.turns ?? [{ user: scenario.user }]
    if (!Array.isArray(turns) || turns.length === 0
      || turns.some((turn) => typeof turn?.user !== 'string' || !turn.user.trim())) {
      throw new Error(`Talk scenario ${scenario.id} needs at least one nonempty user turn`)
    }
    if (scenario.expect && (typeof scenario.expect !== 'object' || Array.isArray(scenario.expect))) {
      throw new Error(`Talk scenario ${scenario.id} has invalid expectations`)
    }
  }
  return scenarios
}

