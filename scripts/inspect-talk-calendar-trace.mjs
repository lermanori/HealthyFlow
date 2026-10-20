#!/usr/bin/env node

// Read a short, opt-in Railway Talk trace without calling the API or changing data.
import { readFileSync } from 'node:fs'

const PREFIX = '[DEBUG-talk-calendar-v1] '

export function parseTalkCalendarTrace(logText) {
  return logText.split(/\r?\n/).flatMap((line) => {
    const index = line.indexOf(PREFIX)
    if (index < 0) return []
    const raw = line.slice(index + PREFIX.length)
    try {
      const record = JSON.parse(raw)
      return record && ['plan', 'evidence', 'answer'].includes(record.stage) ? [record] : []
    } catch {
      throw new Error('A Talk Calendar trace line could not be parsed.')
    }
  })
}

function inclusiveDates(value) {
  if (!value) return []
  const match = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(value)
  if (!match) throw new Error('--dates must be YYYY-MM-DD..YYYY-MM-DD')
  const start = new Date(`${match[1]}T12:00:00.000Z`)
  const end = new Date(`${match[2]}T12:00:00.000Z`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
    throw new Error('--dates has an invalid range')
  }
  const dates = []
  for (const current = start; current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    dates.push(current.toISOString().slice(0, 10))
    if (dates.length > 7) throw new Error('--dates must cover no more than seven days')
  }
  return dates
}

export function inspectTalkCalendarTrace(records, { dates = [], eventTitle } = {}) {
  const last = records.at(-1)
  if (!last) throw new Error('No Talk Calendar trace records found.')
  const turn = records.filter((record) => record.messageKey === last.messageKey)
  const plan = turn.findLast((record) => record.stage === 'plan')?.detail?.plan
  const evidence = turn.findLast((record) => record.stage === 'evidence')?.detail
  const answer = turn.findLast((record) => record.stage === 'answer')?.detail?.message
  const calendar = evidence?.calendar
  const plannedDates = plan?.dates ?? []
  const calendarDates = calendar?.map((day) => day.date) ?? []
  const expectedDates = Array.isArray(dates) ? dates : inclusiveDates(dates)
  const issues = []

  for (const date of expectedDates) {
    if (!plannedDates.includes(date)) issues.push(`Planner did not select ${date}`)
    if (!calendarDates.includes(date)) issues.push(`No Calendar read was sent for ${date}`)
    if (eventTitle) {
      const day = calendar?.find((entry) => entry.date === date)
      if (day && !day.events.some((event) => event.title === eventTitle)) {
        issues.push(`Calendar read for ${date} does not contain ${eventTitle}`)
      }
    }
  }

  return { messageKey: last.messageKey, plan, calendar, answer, issues }
}

function main() {
  const [path, ...args] = process.argv.slice(2)
  if (!path) throw new Error('Usage: node scripts/inspect-talk-calendar-trace.mjs <railway.log> [--dates YYYY-MM-DD..YYYY-MM-DD] [--event title]')
  const option = (name) => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] : undefined
  }
  const records = parseTalkCalendarTrace(readFileSync(path, 'utf8'))
  const result = inspectTalkCalendarTrace(records, {
    dates: option('--dates'), eventTitle: option('--event'),
  })
  console.log(`Turn ${result.messageKey}`)
  console.log(`Plan: ${JSON.stringify(result.plan ?? null)}`)
  for (const day of result.calendar ?? []) {
    console.log(`${day.date}: ${day.status}${day.truncated ? ' (truncated)' : ''}; ${day.events.map((event) => event.title).join(', ') || '(no events)'}`)
  }
  if (result.calendar === null || result.calendar === undefined) console.log('Calendar evidence: not supplied')
  console.log(`Answer: ${result.answer ?? '(not captured yet)'}`)
  for (const issue of result.issues) console.error(`CHECK: ${issue}`)
  if (result.issues.length) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
