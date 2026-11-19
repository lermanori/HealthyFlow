import { strict as assert } from 'node:assert'
import test from 'node:test'
import { compactEmptyHours, positionDayTimelineEntries } from './dayTimelineLayout'

test('a multi-hour event and fractional overlaps share lanes without changing their times', () => {
  const rows = positionDayTimelineEntries([
    { key: 'workshop', start: 570, end: 750 },
    { key: 'task', start: 600, end: 660 },
    { key: 'habit', start: 630, end: 650 },
    { key: 'after', start: 750, end: 810 },
  ])
  const workshop = rows.find(row => row.key === 'workshop')!
  const task = rows.find(row => row.key === 'task')!
  const habit = rows.find(row => row.key === 'habit')!
  assert.equal(workshop.end - workshop.start, 180)
  assert.equal(habit.start, 630)
  assert.deepEqual(new Set([workshop.column, task.column, habit.column]).size, 3)
  assert.ok([workshop, task, habit].every(row => row.columns === 3))
  assert.deepEqual(rows.find(row => row.key === 'after'), { key: 'after', start: 750, end: 810, column: 0, columns: 1, columnSpan: 1 })
})

test('touching endpoints are separate full-width events', () => {
  const rows = positionDayTimelineEntries([
    { key: 'first', start: 540, end: 600 },
    { key: 'second', start: 600, end: 615 },
    { key: 'third', start: 615, end: 660 },
  ])
  assert.ok(rows.every(row => row.column === 0 && row.columns === 1))
})

test('chain overlaps reuse a free lane and keep the connected group aligned', () => {
  const rows = positionDayTimelineEntries([
    { key: 'a', start: 540, end: 600 },
    { key: 'b', start: 570, end: 630 },
    { key: 'c', start: 600, end: 660 },
    { key: 'd', start: 630, end: 690 },
  ])
  assert.ok(rows.every(row => row.columns === 2))
  for (const left of rows) {
    for (const right of rows) {
      if (left.key !== right.key && left.start < right.end && right.start < left.end) {
        assert.notEqual(left.column, right.column, `${left.key} collides with ${right.key}`)
      }
    }
  }
  assert.equal(rows[0].column, rows[2].column)
})

test('equal starts allocate deterministic lanes independent of input order', () => {
  const entries = [
    { key: 'a', start: 600, end: 660 },
    { key: 'b', start: 600, end: 660 },
    { key: 'long', start: 600, end: 780 },
  ]
  const forward = positionDayTimelineEntries(entries)
  const reverse = positionDayTimelineEntries([...entries].reverse())
  assert.deepEqual(forward, reverse)
  assert.equal(forward[0].key, 'long')
  assert.equal(new Set(forward.map(row => row.column)).size, 3)
})

test('early and after-midnight intervals retain their full bounds without mutating input', () => {
  const entries = Object.freeze([
    Object.freeze({ key: 'early', start: 135, end: 195, source: 'actual' }),
    Object.freeze({ key: 'late', start: 1380, end: 1500, source: 'plan' }),
  ])
  const rows = positionDayTimelineEntries([...entries])
  assert.deepEqual(rows.map(({ key, start, end, source }) => ({ key, start, end, source })), [...entries])
  assert.ok(entries.every(row => !('column' in row)))
  assert.ok(rows.every(row => row.columns === 1))
})


test('an event reclaims empty neighboring lanes only when free for its whole interval', () => {
  const rows = positionDayTimelineEntries([
    { key: 'long', start: 540, end: 660 },
    { key: 'middle', start: 540, end: 600 },
    { key: 'short', start: 540, end: 570 },
    { key: 'later', start: 600, end: 660 },
  ])
  assert.equal(rows.find(row => row.key === 'later')!.columnSpan, 2)
  for (const left of rows) {
    for (const right of rows) {
      if (left.key !== right.key && left.start < right.end && right.start < left.end) {
        assert.ok(left.column + left.columnSpan <= right.column || right.column + right.columnSpan <= left.column,
          `${left.key}'s expanded width collides with ${right.key}`)
      }
    }
  }
})

test('every empty hour is compacted, including a single gap between busy hours', () => {
  const slots = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00']
  const busy = new Set(['08:00', '10:00'])
  assert.deepEqual(
    [...compactEmptyHours(slots, slot => busy.has(slot))],
    ['06:00', '07:00', '09:00', '11:00', '12:00'],
  )
})

test('a day with nothing scheduled compacts every hour it is given', () => {
  assert.deepEqual([...compactEmptyHours(['06:00', '07:00'], () => false)], ['06:00', '07:00'])
})
