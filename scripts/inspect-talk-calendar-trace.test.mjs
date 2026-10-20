import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectTalkCalendarTrace, parseTalkCalendarTrace } from './inspect-talk-calendar-trace.mjs'

test('pinpoints whether a missing date or event disappeared before the answer', () => {
  const lines = [
    { stage: 'plan', detail: { plan: { dates: ['2026-10-26'], sources: ['calendar'] } } },
    { stage: 'evidence', detail: { calendar: [{
      date: '2026-10-26', status: 'connected', events: [{ title: 'Dentist' }],
    }] } },
    { stage: 'answer', detail: { message: 'Dentist on October 26.' } },
  ].map((record) => `2026-10-19 [DEBUG-talk-calendar-v1] ${JSON.stringify({
    at: '2026-10-19T12:00:00.000Z', messageKey: 'same-turn', ...record,
  })}`).join('\n')
  const records = parseTalkCalendarTrace(`unrelated log\n${lines}`)
  const result = inspectTalkCalendarTrace(records, {
    dates: '2026-10-25..2026-10-26', eventTitle: 'מילואים',
  })
  assert.deepEqual(result.issues, [
    'Planner did not select 2026-10-25',
    'No Calendar read was sent for 2026-10-25',
    'Calendar read for 2026-10-26 does not contain מילואים',
  ])
  assert.equal(result.answer, 'Dentist on October 26.')
})
