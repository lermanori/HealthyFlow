/**
 * Tests for drag-to-schedule logic (issue #27).
 *
 * Two pure functions:
 *   hourSlots()       — generates the 6am-11pm droppable ids
 *   zoneToUpdate()    — maps a droppableId to the task update payload
 */

import { hourSlots } from '../src/utils/hourSlots'
import { zoneToUpdate } from '../src/utils/zoneToUpdate'

describe('hourSlots', () => {
  it('starts at 06:00 and ends at 23:00', () => {
    const slots = hourSlots()
    expect(slots[0]).toBe('06:00')
    expect(slots[slots.length - 1]).toBe('23:00')
  })

  it('produces 18 slots (6 through 23 inclusive)', () => {
    expect(hourSlots()).toHaveLength(18)
  })

  it('all slots match HH:00 format', () => {
    for (const s of hourSlots()) {
      expect(s).toMatch(/^\d{2}:00$/)
    }
  })

  it('slots are in ascending order', () => {
    const slots = hourSlots()
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i] > slots[i - 1]).toBe(true)
    }
  })
})

describe('zoneToUpdate', () => {
  it('hour slot zone returns startTime set, position null', () => {
    const update = zoneToUpdate('09:00', 2)
    expect(update).toEqual({ startTime: '09:00', position: null })
  })

  it('anytime zone returns startTime null and position from drop index', () => {
    const update = zoneToUpdate('anytime', 3)
    expect(update).toEqual({ startTime: null, position: 3 })
  })

  it('afternoon slot works correctly', () => {
    const update = zoneToUpdate('14:00', 0)
    expect(update).toEqual({ startTime: '14:00', position: null })
  })
})
