import { supabase } from './supabase-client'

const ROLLOVER_REF_RE = /^rollover-([0-9a-fA-F-]{36})-(\d{4}-\d{2}-\d{2})$/

export type RolloverCompleteResult =
  | { ok: true; task: any }
  | { ok: false; reason: 'invalid' | 'forbidden' }

export const Rollover = {
  isRolloverRef(id: string): boolean {
    return ROLLOVER_REF_RE.test(id)
  },

  async listForDay(userId: string, date: string): Promise<any[]> {
    const { data: tasksWithoutDate, error: rolloverError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .is('start_time', null)
      .is('rolled_over_from_task_id', null)
      .eq('completed', false)
      .eq('type', 'task')
      .order('created_at', { ascending: true })
    if (rolloverError) throw rolloverError

    const { data: completedRollovers, error: completedRolloversError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('completed', true)
      .filter('completed_at', 'gte', `${date}T00:00:00.000Z`)
      .filter('completed_at', 'lt', `${date}T23:59:59.999Z`)
      .order('created_at', { ascending: true })
    if (completedRolloversError) throw completedRolloversError

    const virtualRolloverTasks = (tasksWithoutDate || [])
      .filter(task => !task.completed)
      .map(task => ({
        id: `rollover-${task.id}-${date}`,
        title: task.title,
        type: 'task' as const,
        category: task.category,
        start_time: task.start_time,
        duration: task.duration,
        repeat_type: task.repeat_type,
        completed: false,
        completed_at: null,
        created_at: task.created_at,
        scheduled_date: date,
        overdue_notified: false,
        user_id: userId,
        original_habit_id: null,
        rolled_over_from_task_id: task.id,
        original_created_at: task.created_at,
        isRolloverTask: true,
      }))

    const completedRolloverTasks = (completedRollovers || []).map(task => ({
      ...task,
      scheduled_date: date,
      isRolloverTask: true,
    }))

    return [...virtualRolloverTasks, ...completedRolloverTasks]
  },

  async countIncompleteForDay(userId: string): Promise<number> {
    const { data, error } = await supabase
      .from('tasks')
      .select('id')
      .eq('user_id', userId)
      .is('start_time', null)
      .is('rolled_over_from_task_id', null)
      .eq('completed', false)
      .eq('type', 'task')
    if (error) throw error
    return (data || []).length
  },

  async complete(ref: string, userId: string): Promise<RolloverCompleteResult> {
    const match = ref.match(ROLLOVER_REF_RE)
    if (!match) return { ok: false, reason: 'invalid' }
    const originalTaskId = match[1]

    const { data: originalTask, error: fetchErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', originalTaskId)
      .single()
    if (fetchErr) throw fetchErr
    if (!originalTask || originalTask.user_id !== userId) {
      return { ok: false, reason: 'forbidden' }
    }

    const { data: updatedTask, error: updateErr } = await supabase
      .from('tasks')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('id', originalTaskId)
      .select()
      .single()
    if (updateErr) throw updateErr

    return { ok: true, task: updatedTask }
  },
}
