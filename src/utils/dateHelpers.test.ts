import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { format } from 'date-fns'
import {
  formatRelativeDate,
  formatScheduleHeading,
  formatSelectedDateAnnouncement,
  getDateRelation,
  getWeekDates,
  getWeekNavigationIndex,
  type WeekStartsOn,
} from './dateHelpers'

const referenceDate = new Date(2026, 5, 24, 12)

function relativeDay(offset: number) {
  const date = new Date(referenceDate)
  date.setDate(date.getDate() + offset)
  return date
}

describe('selected-date language', () => {
  it('classifies yesterday, today, tomorrow, past, and future dates', () => {
    assert.equal(getDateRelation(relativeDay(-3), referenceDate), 'past')
    assert.equal(getDateRelation(relativeDay(-1), referenceDate), 'yesterday')
    assert.equal(getDateRelation(relativeDay(0), referenceDate), 'today')
    assert.equal(getDateRelation(relativeDay(1), referenceDate), 'tomorrow')
    assert.equal(getDateRelation(relativeDay(3), referenceDate), 'future')
  })

  it('formats relative labels without losing the year across year boundaries', () => {
    assert.equal(formatRelativeDate(relativeDay(-1), referenceDate), 'Yesterday')
    assert.equal(formatRelativeDate(referenceDate, referenceDate), 'Today')
    assert.equal(formatRelativeDate(relativeDay(1), referenceDate), 'Tomorrow')
    assert.equal(formatRelativeDate(new Date(2026, 6, 8, 12), referenceDate), 'Jul 8')
    assert.equal(formatRelativeDate(new Date(2027, 0, 8, 12), referenceDate), 'Jan 8, 2027')
  })

  it('uses accurate schedule headings for every date relation', () => {
    assert.equal(formatScheduleHeading(relativeDay(-2), referenceDate), 'Schedule for June 22')
    assert.equal(formatScheduleHeading(relativeDay(-1), referenceDate), "Yesterday's Schedule")
    assert.equal(formatScheduleHeading(referenceDate, referenceDate), "Today's Schedule")
    assert.equal(formatScheduleHeading(relativeDay(1), referenceDate), "Tomorrow's Schedule")
    assert.equal(formatScheduleHeading(relativeDay(2), referenceDate), 'Schedule for June 26')
    assert.equal(formatScheduleHeading(new Date(2027, 0, 8, 12), referenceDate), 'Schedule for January 8, 2027')
  })

  it('builds a complete screen-reader announcement', () => {
    assert.equal(
      formatSelectedDateAnnouncement(relativeDay(1), referenceDate),
      'Tomorrow. Thursday, June 25, 2026.'
    )
  })
})

describe('shared week policy', () => {
  it('honors every supported first day of week and always contains the reference date', () => {
    for (let value = 0; value <= 6; value += 1) {
      const weekStartsOn = value as WeekStartsOn
      const dates = getWeekDates(referenceDate, weekStartsOn)
      assert.equal(dates.length, 7)
      assert.equal(dates[0].getDay(), weekStartsOn)
      assert.equal(dates[6].getDay(), (weekStartsOn + 6) % 7)
      assert.ok(dates.some((date) => format(date, 'yyyy-MM-dd') === '2026-06-24'))
    }
  })

  it('returns stable roving-focus destinations for arrow, Home, and End keys', () => {
    assert.equal(getWeekNavigationIndex(3, 'ArrowLeft'), 2)
    assert.equal(getWeekNavigationIndex(3, 'ArrowRight'), 4)
    assert.equal(getWeekNavigationIndex(0, 'ArrowLeft'), 6)
    assert.equal(getWeekNavigationIndex(6, 'ArrowRight'), 0)
    assert.equal(getWeekNavigationIndex(4, 'Home'), 0)
    assert.equal(getWeekNavigationIndex(1, 'End'), 6)
    assert.equal(getWeekNavigationIndex(2, 'Enter'), null)
  })
})
