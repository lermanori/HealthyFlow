import { useEffect, useMemo, useState } from 'react'
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, isSameDay, addDays } from 'date-fns'
import {
  Calendar, ChevronLeft, ChevronRight, Check, CheckSquare, RotateCcw,
  ShoppingCart, Utensils, Dumbbell, Clock, Infinity as InfinityIcon, Smile,
} from 'lucide-react'
import { calendarService, ExternalCalendarEvent, taskService, Task } from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import { getFullWeekdayLabels, getWeekDates, getWeekdayLabels, getWeekdayLetters } from '../utils/dateHelpers'
import { useSettings } from '../hooks/useSettings'
import toast from 'react-hot-toast'

// --- Accent (design: cyan) -------------------------------------------------
const A = {
  c1: '#06b6d4', c2: '#3b82f6', ring: '#22d3ee',
  glow: 'rgba(6,182,212,.45)', textGlow: 'rgba(6,182,212,.55)',
  border: 'rgba(6,182,212,.4)', chip: 'rgba(6,182,212,.12)', chipHover: 'rgba(6,182,212,.22)',
}

const GROTESK = "'Space Grotesk', sans-serif"

type ItemType = 'task' | 'habit' | 'grocery' | 'meal' | 'workout' | 'calendar'

const TYPE: Record<ItemType, { label: string; text: string; bg: string; border: string; tint: string }> = {
  task:    { label: 'Task',    text: '#22d3ee', bg: 'rgba(6,182,212,.15)',  border: 'rgba(6,182,212,.3)',  tint: 'rgba(6,182,212,.07)' },
  habit:   { label: 'Habit',   text: '#c084fc', bg: 'rgba(168,85,247,.15)', border: 'rgba(168,85,247,.3)', tint: 'rgba(168,85,247,.07)' },
  grocery: { label: 'Grocery', text: '#34d399', bg: 'rgba(16,185,129,.15)', border: 'rgba(16,185,129,.3)', tint: 'rgba(16,185,129,.07)' },
  meal:    { label: 'Meal',    text: '#fb7185', bg: 'rgba(244,63,94,.15)',  border: 'rgba(244,63,94,.3)',  tint: 'rgba(244,63,94,.07)' },
  workout: { label: 'Workout', text: '#fbbf24', bg: 'rgba(245,158,11,.15)', border: 'rgba(245,158,11,.3)', tint: 'rgba(245,158,11,.07)' },
  calendar:{ label: 'Calendar', text: '#38bdf8', bg: 'rgba(14,165,233,.15)', border: 'rgba(14,165,233,.3)', tint: 'rgba(14,165,233,.07)' },
}

function typeOf(t: Task): ItemType {
  return (TYPE[t.type as ItemType] ? t.type : 'task') as ItemType
}

function timeLabel(hhmm?: string): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function timeNumber(hhmm: string): number {
  return Number(hhmm.replace(':', ''))
}

function isUpcoming(row: WeekRow, now: Date): boolean {
  const todayKey = format(now, 'yyyy-MM-dd')
  if (row.date < todayKey) return false
  if (row.date > todayKey) return true
  if (!row.hasTime || !row.time) return true
  return timeNumber(row.time) >= timeNumber(format(now, 'HH:mm'))
}

function dedupeWeekRows(rows: WeekRow[]): WeekRow[] {
  const seenTaskIds = new Set<string>()
  return rows.filter((row) => {
    if (row.source !== 'task' || row.type === 'habit') return true
    if (seenTaskIds.has(row.id)) return false
    seenTaskIds.add(row.id)
    return true
  })
}

function TypeIcon({ type, size = 15 }: { type: ItemType; size?: number }) {
  const p = { width: size, height: size }
  switch (type) {
    case 'habit':   return <RotateCcw {...p} />
    case 'grocery': return <ShoppingCart {...p} />
    case 'meal':    return <Utensils {...p} />
    case 'workout': return <Dumbbell {...p} />
    case 'calendar': return <Calendar {...p} />
    default:        return <CheckSquare {...p} />
  }
}

type WeekRow = {
  id: string
  source: 'task' | 'calendar'
  title: string
  type: ItemType
  completed: boolean
  hasTime: boolean
  time?: string
  off: number
  date: string
}

export default function WeekViewPage() {
  const queryClient = useQueryClient()
  const { settings, isLoading: settingsLoading } = useSettings()
  const weekStartsOn = settings?.weekStartsOn ?? 1
  const dow = getWeekdayLabels(weekStartsOn)
  const letters = getWeekdayLetters(weekStartsOn)
  const fullDow = getFullWeekdayLabels(weekStartsOn)
  const today = new Date()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedOff, setSelectedOff] = useState(() => {
    const wd = getWeekDates(today, weekStartsOn).findIndex((d) => isSameDay(d, today))
    return wd >= 0 ? wd : 0
  })
  const [showCompleted, setShowCompleted] = useState(true)

  const refDate = addDays(today, weekOffset * 7)
  const weekDates = getWeekDates(refDate, weekStartsOn)

  useEffect(() => {
    const wd = getWeekDates(new Date(), weekStartsOn).findIndex((d) => isSameDay(d, new Date()))
    if (wd >= 0 && weekOffset === 0) setSelectedOff(wd)
  }, [weekOffset, weekStartsOn])

  // 7 parallel day queries (mirrors the existing approach)
  const dayQueries = useQueries({
    queries: weekDates.map((date) => ({
      queryKey: ['tasks', format(date, 'yyyy-MM-dd')],
      queryFn: () => taskService.getTasks(format(date, 'yyyy-MM-dd')),
    })),
  })
  const calendarQueries = useQueries({
    queries: weekDates.map((date) => {
      const dateKey = format(date, 'yyyy-MM-dd')
      return {
        queryKey: ['google-calendar-events', dateKey],
        queryFn: () => calendarService.getGoogleEvents(dateKey),
        retry: false,
      }
    }),
  })
  const isLoading = settingsLoading || dayQueries.some((q) => q.isLoading) || calendarQueries.some((q) => q.isLoading)

  // --- Mutations (same contract as TodayPage) ---
  const completeMutation = useMutation({
    mutationFn: taskService.completeTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })
  const uncompleteMutation = useMutation({
    mutationFn: (id: string) => taskService.updateTask(id, { completed: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onError: () => toast.error('Failed to update item'),
  })
  const calendarCompleteMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      calendarService.updateGoogleEventCompletion(id, completed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['google-calendar-events'] }),
    onError: () => toast.error('Failed to update calendar event'),
  })
  const toggle = (item: { id: string; completed: boolean; source?: 'task' | 'calendar' }) => {
    if (item.source === 'calendar') {
      calendarCompleteMutation.mutate({ id: item.id, completed: !item.completed })
      return
    }
    if (item.completed) uncompleteMutation.mutate(item.id)
    else completeMutation.mutate(item.id)
  }

  const dayItems: Task[][] = weekDates.map((_, i) => dayQueries[i].data ?? [])
  const dayCalendarEvents: ExternalCalendarEvent[][] = weekDates.map((_, i) => calendarQueries[i].data ?? [])

  const model = useMemo(() => {
    // Flatten the week, tagging each item with its day offset + date
    const rawRows: WeekRow[] = []
    dayItems.forEach((items, off) => {
      const date = format(weekDates[off], 'yyyy-MM-dd')
      items.forEach((t) => {
        rawRows.push({
          id: t.id, source: 'task', title: t.title, type: typeOf(t), completed: t.completed,
          hasTime: !!t.startTime, time: t.startTime ?? undefined, off, date,
        })
      })
    })
    dayCalendarEvents.forEach((events, off) => {
      const date = format(weekDates[off], 'yyyy-MM-dd')
      events.forEach((event) => {
        rawRows.push({
          id: event.id,
          source: 'calendar',
          title: event.title,
          type: 'calendar',
          completed: event.completed,
          hasTime: !event.allDay && !!event.localStartTime,
          time: event.allDay ? undefined : event.localStartTime || undefined,
          off,
          date,
        })
      })
    })
    const rows = dedupeWeekRows(rawRows)

    const sortKey = (r: WeekRow) => r.off * 10000 + (r.time ? Number(r.time.replace(':', '')) : 9999)
    const byDayTime = (a: WeekRow, b: WeekRow) => sortKey(a) - sortKey(b)

    const todayOff = weekDates.findIndex((d) => isSameDay(d, today))

    // Per-day counts for the rail
    const perDay = weekDates.map((_, off) => {
      const its = rows.filter((r) => r.off === off)
      const done = its.filter((r) => r.completed).length
      const total = its.length
      return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
    })

    const total = rows.length
    const done = rows.filter((r) => r.completed).length
    const leftCount = total - done
    const weekPct = total ? Math.round((done / total) * 100) : 0

    // Up next: first upcoming incomplete timed item (then today's/future untimed).
    // Past days are reviewable in the agenda, but not promoted as upcoming work.
    const incomplete = rows.filter((r) => !r.completed && isUpcoming(r, today))
    const upNext = incomplete.filter((r) => r.hasTime).sort(byDayTime)[0]
      || incomplete.slice().sort(byDayTime)[0]
      || null

    // Agenda groups across the whole week
    const shown = showCompleted ? rows : rows.filter((r) => !r.completed)
    const timed = shown.filter((r) => r.hasTime).sort(byDayTime)
    const untimed = shown.filter((r) => !r.hasTime).sort(byDayTime)

    // Habit matrix: distinct habits across the week × 7 day cells
    const habitMap = new Map<string, { name: string; cells: ({ id: string; completed: boolean } | null)[] }>()
    dayItems.forEach((items, off) => {
      items.forEach((t) => {
        if (t.type !== 'habit') return
        // Backend always sets originalHabitId on habit items (virtual + materialized),
        // so it's the stable key that groups a habit's per-day instances into one row.
        const key = t.originalHabitId || t.id
        if (!habitMap.has(key)) habitMap.set(key, { name: t.title, cells: Array(7).fill(null) })
        habitMap.get(key)!.cells[off] = { id: t.id, completed: t.completed }
      })
    })
    const habitRows = Array.from(habitMap.values()).map((h) => {
      let streak = 0
      const from = selectedOff
      for (let i = from; i >= 0; i--) {
        const c = h.cells[i]
        if (c && c.completed) streak++
        else break
      }
      return { ...h, streak }
    })

    // Weekly momentum by type
    const types: ItemType[] = ['task', 'habit', 'calendar', 'workout', 'meal']
    const momentum = types.map((ty) => {
      const its = rows.filter((r) => r.type === ty)
      return {
        label: ty === 'task' ? 'Tasks' : ty === 'habit' ? 'Habits' : ty === 'calendar' ? 'Calendar' : ty === 'workout' ? 'Workouts' : 'Meals',
        color: TYPE[ty].text,
        value: `${its.filter((r) => r.completed).length}/${its.length}`,
      }
    })

    return { rows, perDay, todayOff, total, done, leftCount, weekPct, upNext, timed, untimed, habitRows, momentum }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayItems, dayCalendarEvents, weekDates, selectedOff, showCompleted])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const monday = weekDates[0]
  const sunday = weekDates[6]
  const weekLabel = monday.getMonth() === sunday.getMonth()
    ? `${format(monday, 'MMM d')} – ${format(sunday, 'd, yyyy')}`
    : `${format(monday, 'MMM d')} – ${format(sunday, 'MMM d, yyyy')}`

  const encourage = model.weekPct >= 100 ? 'week cleared'
    : model.weekPct >= 60 ? 'almost there'
    : model.weekPct > 0 ? 'keep the streak going' : "let's get started"

  const navBtn: React.CSSProperties = {
    width: 38, height: 38, borderRadius: 11, border: '1px solid rgba(75,85,99,.6)',
    background: 'rgba(31,41,55,.6)', color: '#d1d5db', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div style={{ color: '#f3f4f6', display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0, width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div className="animate-float" style={{ width: 42, height: 42, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg,${A.c1},${A.c2})`, boxShadow: `0 0 22px ${A.glow}` }}>
            <Calendar width={21} height={21} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontFamily: GROTESK, fontSize: 28, fontWeight: 700, letterSpacing: '-.5px', color: '#f9fafb', textShadow: `0 0 12px ${A.textGlow}` }}>My Week</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#9ca3af' }}>Plan across days — your default view is Today · {weekLabel}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setWeekOffset((w) => w - 1)} style={navBtn} aria-label="Previous week"><ChevronLeft width={17} height={17} /></button>
          <button
            onClick={() => { setWeekOffset(0); const wd = getWeekDates(new Date(), weekStartsOn).findIndex((d) => isSameDay(d, new Date())); setSelectedOff(wd >= 0 ? wd : 0) }}
            style={{ height: 38, padding: '0 16px', borderRadius: 11, border: `1px solid ${A.border}`, background: A.chip, color: A.ring, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >Today</button>
          <button onClick={() => setWeekOffset((w) => w + 1)} style={navBtn} aria-label="Next week"><ChevronRight width={17} height={17} /></button>
        </div>
      </div>

      {/* Week rail */}
      <div className="week-rail" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 9, minWidth: 0 }}>
        {weekDates.map((d, off) => {
          const isToday = isSameDay(d, today)
          const isSel = off === selectedOff
          const { done, pct } = model.perDay[off]
          return (
            <button
              key={off}
              data-demo-id="week-day-column"
              data-rail-date={format(d, 'yyyy-MM-dd')}
              onClick={() => setSelectedOff(off)}
              style={{
                position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                padding: '13px 6px 12px', borderRadius: 16, cursor: 'pointer',
                border: `1px solid ${isSel ? A.border : 'rgba(55,65,81,.5)'}`,
                background: isSel ? `linear-gradient(160deg,${A.chip} 0%, rgba(17,24,39,.9) 70%)` : 'rgba(31,41,55,.4)',
                boxShadow: isSel ? `0 0 24px ${A.glow}` : 'none',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: isSel ? A.ring : '#9ca3af' }}>{dow[off]}</span>
              <span style={{ fontFamily: GROTESK, fontSize: 22, fontWeight: 700, lineHeight: 1, color: isSel ? '#f9fafb' : (isToday ? A.ring : '#d1d5db'), textShadow: isSel ? `0 0 12px ${A.textGlow}` : 'none' }}>{format(d, 'd')}</span>
              <div style={{ position: 'relative', width: 30, height: 30 }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(${A.ring} ${pct}%, rgba(255,255,255,.08) ${pct}%)` }} />
                <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: isSel ? '#0f1830' : '#141d31', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#cbd5e1', fontFamily: GROTESK }}>{done}</div>
              </div>
              {isToday && (
                <span className="animate-neon-flicker" style={{ position: 'absolute', top: 7, right: 8, width: 6, height: 6, borderRadius: '50%', background: A.ring, boxShadow: `0 0 8px ${A.ring}` }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Two-column body */}
      <div className="week-grid" style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 20, alignItems: 'start', minWidth: 0 }}>
        {/* Focus column: weekly agenda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Focus hero */}
          <div style={{ position: 'relative', overflow: 'hidden', padding: '20px 22px', borderRadius: 20, border: `1px solid ${A.border}`, background: `linear-gradient(135deg,${A.chip} 0%, rgba(17,24,39,.92) 70%)`, boxShadow: `0 0 30px ${A.glow}` }}>
            <div style={{ position: 'absolute', top: -40, right: -30, width: 160, height: 160, borderRadius: '50%', background: `radial-gradient(circle,${A.glow},transparent 70%)`, pointerEvents: 'none' }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ position: 'relative', width: 74, height: 74, flex: 'none' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(${A.ring} ${model.weekPct}%, rgba(255,255,255,.08) ${model.weekPct}%)` }} />
                <div style={{ position: 'absolute', inset: 7, borderRadius: '50%', background: '#0e1626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: GROTESK, fontSize: 20, fontWeight: 700, color: '#f9fafb', lineHeight: 1 }}>{model.weekPct}%</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontFamily: GROTESK, fontSize: 26, fontWeight: 700, letterSpacing: '-.5px', color: '#f9fafb' }}>Left this week</h2>
                  <span style={{ fontSize: 14, color: '#9ca3af' }}>{model.leftCount} to go</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 14, color: '#cbd5e1' }}>
                  <span style={{ color: A.ring, fontWeight: 600 }}>{model.done} of {model.total} done</span> · {encourage}
                </p>
              </div>
            </div>
          </div>

          {/* Up next */}
          {model.upNext && (
            <div style={{ position: 'relative', overflow: 'hidden', padding: '16px 18px', borderRadius: 18, border: `1px solid ${TYPE[model.upNext.type].border}`, background: `linear-gradient(120deg,${TYPE[model.upNext.type].bg} 0%, rgba(17,24,39,.85) 75%)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ flex: 'none', width: 46, height: 46, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: TYPE[model.upNext.type].bg, color: TYPE[model.upNext.type].text, border: `1px solid ${TYPE[model.upNext.type].border}` }}>
                  <TypeIcon type={model.upNext.type} size={22} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: TYPE[model.upNext.type].text }}>Up next</span>
                  <p data-testid="week-up-next-title" style={{ margin: '3px 0 0', fontSize: 17, fontWeight: 600, color: '#f9fafb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model.upNext.title}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#9ca3af' }}>
                    {(model.upNext.off === model.todayOff ? 'Today' : dow[model.upNext.off])}{model.upNext.hasTime ? ` · ${timeLabel(model.upNext.time)}` : ''}
                  </p>
                </div>
                <button onClick={() => toggle(model.upNext!)} style={{ flex: 'none', height: 38, padding: '0 16px', borderRadius: 11, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#0b1120', background: `linear-gradient(135deg,${A.c1},${A.c2})`, boxShadow: `0 0 16px ${A.glow}` }}>
                  <Check width={15} height={15} strokeWidth={3} /> Done
                </button>
              </div>
            </div>
          )}

          {/* All-done celebration */}
          {model.total > 0 && model.leftCount === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 18, border: '1px solid rgba(34,197,94,.4)', background: 'linear-gradient(120deg,rgba(34,197,94,.14) 0%, rgba(17,24,39,.85) 75%)' }}>
              <span style={{ flex: 'none', width: 46, height: 46, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', boxShadow: '0 0 18px rgba(34,197,94,.45)' }}>
                <Check width={24} height={24} strokeWidth={2.5} />
              </span>
              <div>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#f9fafb' }}>Week cleared</p>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: '#9ca3af' }}>Nothing left this week. Every item is complete — nice work.</p>
              </div>
            </div>
          )}

          {/* Agenda groups */}
          {([
            { label: 'Scheduled', scheduled: true, items: model.timed },
            { label: 'Anytime', scheduled: false, items: model.untimed },
          ] as const).map((g) => g.items.length > 0 && (
            <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: g.scheduled ? A.ring : '#94a3b8', display: 'flex' }}>
                  {g.scheduled ? <Clock width={15} height={15} /> : <InfinityIcon width={15} height={15} />}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: '#9ca3af' }}>{g.label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', background: 'rgba(255,255,255,.05)', borderRadius: 99, padding: '2px 8px' }}>{g.items.length}</span>
                <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.06)' }} />
              </div>

              {g.items.map((item) => {
                const t = TYPE[item.type]
                const isToday = item.off === model.todayOff
                const tl = timeLabel(item.time)
                const [tShort, ampm] = tl ? tl.split(' ') : ['Any', '']
                return (
                  <div key={item.id} data-date={item.date} style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                    <div style={{ flex: 'none', width: 62, paddingTop: 11, textAlign: 'right' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.6px', color: isToday ? A.ring : '#6b7280' }}>{isToday ? 'TODAY' : dow[item.off]}</div>
                      <span style={{ fontFamily: GROTESK, fontSize: 13, fontWeight: 600, color: item.completed ? '#4b5563' : (item.hasTime ? '#cbd5e1' : '#6b7280') }}>{tShort}</span>
                      {item.hasTime && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>{ampm}</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 12, alignItems: 'center', padding: '13px 14px', borderRadius: 14, background: item.completed ? 'rgba(55,65,81,.22)' : `linear-gradient(90deg, ${t.tint}, rgba(255,255,255,.02))`, border: `1px solid ${item.completed ? 'rgba(75,85,99,.3)' : t.border}` }}>
                      <button
                        onClick={() => toggle(item)}
                        aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
                        style={item.completed
                          ? { flex: 'none', width: 24, height: 24, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', boxShadow: '0 0 12px rgba(34,197,94,.45)' }
                          : { flex: 'none', width: 24, height: 24, borderRadius: '50%', border: '2px solid #4b5563', background: 'transparent', cursor: 'pointer' }}
                      >
                        {item.completed && <Check width={14} height={14} strokeWidth={3.5} />}
                      </button>
                      <span style={{ flex: 'none', width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg, color: t.text, border: `1px solid ${t.border}` }}>
                        <TypeIcon type={item.type} size={15} />
                      </span>
                      <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.3, color: item.completed ? '#6b7280' : '#f3f4f6', textDecoration: item.completed ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                      <span style={{ flex: 'none', fontSize: 10, fontWeight: 600, letterSpacing: '.5px', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 99, color: t.text, background: t.bg, border: `1px solid ${t.border}` }}>{t.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {model.total === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '50px 20px', textAlign: 'center', color: '#4b5563', border: '1px dashed rgba(75,85,99,.5)', borderRadius: 16 }}>
              <Smile width={34} height={34} strokeWidth={1.5} />
              <p style={{ margin: 0, fontSize: 14 }}>Nothing planned this week</p>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          {/* Habit consistency */}
          <div style={{ padding: '18px 18px 16px', borderRadius: 18, border: '1px solid rgba(55,65,81,.5)', background: 'linear-gradient(160deg,rgba(31,41,55,.7) 0%,rgba(17,24,39,.9) 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(168,85,247,.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,.3)' }}>
                <RotateCcw width={16} height={16} />
              </span>
              <h3 style={{ margin: 0, fontFamily: GROTESK, fontSize: 16, fontWeight: 600, color: '#f9fafb' }}>Habit consistency</h3>
            </div>

            {model.habitRows.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>No habits tracked this week.</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(7,22px) 34px', gap: 5, alignItems: 'center', marginBottom: 9, paddingLeft: 2 }}>
                  <span />
                  {letters.map((l, i) => (
                    <span key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, color: i === selectedOff ? A.ring : '#6b7280' }}>{l}</span>
                  ))}
                  <span style={{ textAlign: 'center', fontSize: 10 }}>🔥</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {model.habitRows.map((h, hi) => (
                    <div key={hi} data-demo-id="habit-row" style={{ display: 'grid', gridTemplateColumns: '1fr repeat(7,22px) 34px', gap: 5, alignItems: 'center' }}>
                      <span style={{ fontSize: 12.5, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                      {h.cells.map((c, i) => (
                        <button
                          key={i}
                          disabled={!c}
                          onClick={() => c && toggle(c)}
                          title={`${h.name} · ${fullDow[i]}`}
                          style={{
                            width: 22, height: 22, borderRadius: 7, cursor: c ? 'pointer' : 'default',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                            border: `1px solid ${c?.completed ? 'rgba(168,85,247,.5)' : (i === selectedOff ? A.border : 'rgba(255,255,255,.08)')}`,
                            background: c?.completed ? 'linear-gradient(135deg,#8b5cf6,#d946ef)' : (i === selectedOff ? A.chip : 'rgba(255,255,255,.04)'),
                            opacity: c ? 1 : 0.35,
                          }}
                        >
                          {c?.completed && <Check width={11} height={11} strokeWidth={3.5} />}
                        </button>
                      ))}
                      <span style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, fontFamily: GROTESK, color: h.streak >= 3 ? '#fbbf24' : (h.streak > 0 ? '#e5e7eb' : '#4b5563') }}>{h.streak}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Weekly momentum */}
          <div style={{ padding: 18, borderRadius: 18, border: '1px solid rgba(55,65,81,.5)', background: 'linear-gradient(160deg,rgba(31,41,55,.7) 0%,rgba(17,24,39,.9) 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontFamily: GROTESK, fontSize: 16, fontWeight: 600, color: '#f9fafb' }}>This week</h3>
              <button
                onClick={() => setShowCompleted((s) => !s)}
                style={{ fontSize: 11, fontWeight: 600, color: showCompleted ? A.ring : '#9ca3af', background: showCompleted ? A.chip : 'rgba(255,255,255,.04)', border: `1px solid ${showCompleted ? A.border : 'rgba(255,255,255,.08)'}`, borderRadius: 99, padding: '3px 10px', cursor: 'pointer' }}
              >{showCompleted ? 'Hiding none' : 'Show completed'}</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ position: 'relative', width: 84, height: 84, flex: 'none' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(${A.ring} ${model.weekPct}%, rgba(255,255,255,.08) ${model.weekPct}%)` }} />
                <div style={{ position: 'absolute', inset: 9, borderRadius: '50%', background: '#0e1626', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: GROTESK, fontSize: 22, fontWeight: 700, color: '#f9fafb', lineHeight: 1 }}>{model.weekPct}%</span>
                  <span style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>done</span>
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11 }}>
                {model.momentum.map((m, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, flex: 'none', background: m.color }} />
                    <span style={{ flex: 1, fontSize: 13, color: '#cbd5e1' }}>{m.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: GROTESK, color: '#f9fafb' }}>{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
