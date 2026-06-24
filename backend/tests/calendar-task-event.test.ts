import { taskToGoogleEvent } from '../src/calendar'

jest.mock('../src/supabase-client', () => ({
  supabase: {},
}))

const baseTask = {
  id: 'task-1',
  user_id: 'user-1',
  title: 'Clothes sale',
  type: 'task',
  start_time: '18:00',
  duration: 120,
  scheduled_date: '2026-06-24',
  google_event_id: null,
}

describe('taskToGoogleEvent', () => {
  it('sends local wall-clock time with the client timezone instead of a fixed offset', () => {
    const event = taskToGoogleEvent(baseTask, 'Europe/Berlin')

    expect(event.start).toEqual({
      dateTime: '2026-06-24T18:00:00',
      timeZone: 'Europe/Berlin',
    })
    expect(event.end).toEqual({
      dateTime: '2026-06-24T20:00:00',
      timeZone: 'Europe/Berlin',
    })
  })

  it('keeps the event end date correct when a task crosses midnight', () => {
    const event = taskToGoogleEvent({
      ...baseTask,
      start_time: '23:30',
      duration: 90,
    }, 'America/New_York')

    expect(event.start).toEqual({
      dateTime: '2026-06-24T23:30:00',
      timeZone: 'America/New_York',
    })
    expect(event.end).toEqual({
      dateTime: '2026-06-25T01:00:00',
      timeZone: 'America/New_York',
    })
  })
})
