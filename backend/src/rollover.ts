import { supabase } from './supabase-client'

export const Rollover = {
  // Untimed-task carry-forward, the one rule (ADR-0002): an untimed task shows on
  // `date` if it is incomplete with scheduled_date NULL or < date, or it was
  // completed on `date`. (=date is owned by getTasksWithRecurringHabits' regularTasks
  // query, kept disjoint via the strict `< date` here, so nothing shows twice.)
  // Rows and ids are REAL — returned unchanged, no synthetic id, no scheduled_date
  // override. Completion and edits go through the normal task path on the real id.
  async listForDay(userId: string, date: string): Promise<any[]> {
    const { data: incomplete, error: incompleteError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .is('start_time', null)
      .is('rolled_over_from_task_id', null)
      .eq('type', 'task')
      .eq('completed', false)
      .is('deleted_at', null)
      .or(`scheduled_date.is.null,scheduled_date.lt.${date}`)
      .order('created_at', { ascending: true })
    if (incompleteError) throw incompleteError

    // Completed-on-`date` side: a carried task checked off today should still show
    // (struck through) on the day it was completed.
    const { data: completedToday, error: completedError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .is('start_time', null)
      .is('rolled_over_from_task_id', null)
      .eq('type', 'task')
      .eq('completed', true)
      .is('deleted_at', null)
      .or(`scheduled_date.is.null,scheduled_date.lt.${date}`)
      .filter('completed_at', 'gte', `${date}T00:00:00.000Z`)
      .filter('completed_at', 'lt', `${date}T23:59:59.999Z`)
      .order('created_at', { ascending: true })
    if (completedError) throw completedError

    return [...(incomplete || []), ...(completedToday || [])]
  },
}
