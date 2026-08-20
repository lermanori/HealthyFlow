import { logger } from './utils/logger'
import { sortTasksForTimeline } from './utils/sortTasksForTimeline';
import { supabase } from './db/client'
import { projectsDb } from './db/projects'
import { workDb } from './db/work'
import { weightDb } from './db/weight'
import { achievementsDb } from './db/achievements'
import { pushDb } from './db/push'
import { assistantConversationsDb } from './db/assistant-conversations'
import { talkWorkflowsDb } from './db/talk-workflows'

// Re-export the shared client so existing
// `import { supabase } from './supabase-client'` call sites keep working.
export { supabase }

// One account row as the rest of the server sees it. `email` is null for a
// Guest and only for a Guest (CONTEXT.md).
type AccountRow = {
  id: string
  email: string | null
  name: string
  role: 'admin' | 'user'
  signup_method?: 'password' | 'google' | 'apple' | 'guest'
  disabled_at?: string | null
  is_test?: boolean
  last_login_at?: string | null
}

// The `db` facade. Self-contained domains live in ./db/*.ts and are composed in
// via spread; the remaining (cross-referencing) domains stay inline below.
export const db = {
  ...projectsDb,
  ...workDb,
  ...weightDb,
  ...achievementsDb,
  ...pushDb,
  ...assistantConversationsDb,
  ...talkWorkflowsDb,
  // Users
  async createUser(userData: {
    // A Guest has no email. Every other account shape does.
    email: string | null
    name: string
    password_hash: string
    role?: 'admin' | 'user'
    google_auth_subject?: string
    apple_auth_subject?: string
    signup_method?: 'password' | 'google' | 'apple' | 'guest'
    pending_invite_token?: string
    claimed_public_signup_slot?: boolean
  }) {
    const { data, error } = await supabase
      .from('users')
      .insert({ ...userData, email: userData.email?.trim().toLowerCase() ?? null })
      .select();

    if (error) throw error;
    if (!data || data.length === 0) return null;
    return data[0];
  },

  async getUserByEmail(email: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getUserByGoogleSubject(subject: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('google_auth_subject', subject)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async linkGoogleIdentity(userId: string, subject: string) {
    const { data: existing, error: lookupError } = await supabase
      .from('users')
      .select('id, google_auth_subject')
      .eq('id', userId)
      .single();
    if (lookupError) throw lookupError;

    if (existing.google_auth_subject && existing.google_auth_subject !== subject) {
      const error = new Error('Google identity conflict') as Error & { code?: string }
      error.code = 'GOOGLE_IDENTITY_CONFLICT'
      throw error
    }
    if (existing.google_auth_subject === subject) return existing

    const { data, error } = await supabase
      .from('users')
      .update({ google_auth_subject: subject })
      .eq('id', userId)
      .select('id, google_auth_subject')
      .single();
    if (error) throw error;
    return data;
  },

  async getUserByAppleSubject(subject: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('apple_auth_subject', subject)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async linkAppleIdentity(userId: string, subject: string) {
    const { data: existing, error: lookupError } = await supabase
      .from('users')
      .select('id, apple_auth_subject')
      .eq('id', userId)
      .single();
    if (lookupError) throw lookupError;

    if (existing.apple_auth_subject && existing.apple_auth_subject !== subject) {
      const error = new Error('Apple identity conflict') as Error & { code?: string }
      error.code = 'APPLE_IDENTITY_CONFLICT'
      throw error
    }
    if (existing.apple_auth_subject === subject) return existing

    const { data, error } = await supabase
      .from('users')
      .update({ apple_auth_subject: subject })
      .eq('id', userId)
      .select('id, apple_auth_subject')
      .single();
    if (error) throw error;
    return data;
  },

  async clearPendingSignupInvite(userId: string) {
    const { error } = await supabase
      .from('users')
      .update({ pending_invite_token: null })
      .eq('id', userId);
    if (error) throw error;
  },

  async getUserById(userId: string): Promise<AccountRow> {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, signup_method, disabled_at, is_test, last_login_at')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data as AccountRow;
  },

  async getAllUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, created_at, signup_method, disabled_at, is_test, last_login_at')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async recordUserLogin(userId: string) {
    const { error } = await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;
  },

  async deleteUser(userId: string) {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);
    
    if (error) throw error;
  },

  async deleteUserWithSignupCleanup(userId: string) {
    const { data, error } = await supabase.rpc('delete_user_with_signup_cleanup', {
      p_user_id: userId,
    });
    if (error) throw error;
    const result = data?.[0];
    return {
      waitlistEntriesDeleted: Number(result?.waitlist_entries_deleted ?? 0),
      publicSignupSeatsReleased: Number(result?.public_signup_seats_released ?? 0),
    };
  },

  async updateUserPassword(userId: string, passwordHash: string) {
    const { error } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', userId);
    
    if (error) throw error;
  },

  // Tasks
  async createTask(taskData: any) {
    const { data, error } = await supabase
      .from('tasks')
      .insert(taskData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async getTasksByUserId(userId: string, date?: string) {
    let query = supabase
      .from('tasks')
      .select('*, project:projects(id, name, color)')
      .eq('user_id', userId)
      .is('deleted_at', null);
    
    if (date) {
      query = query.eq('scheduled_date', date);
    }
    
    const { data, error } = await query
      .order('start_time', { ascending: true })
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    if (data) {
      // One line per account, not one per row — this returns every Item the
      // user has ever created.
      logger.debug('getTasksByUserId - returned rows', { userId, count: data.length });
    }
    return data;
  },

  // Rows the reminder surface could act on, for a caller whose local day is
  // `today`. SmartReminders polls this once a minute per open tab, so it must
  // not grow with account age — but it also cannot be scoped to today, because
  // the overdue branch matches earlier days (issue #20).
  //
  // What bounds it is the last filter: a past item stays only until it has been
  // notified, and the client records that the moment it fires. Everything else
  // is the client's own predicate pushed into SQL. `not.is.true` rather than
  // `eq.false` because both columns were added by migration and older rows can
  // hold NULL, which the client reads through Boolean() as "not yet".
  async getReminderCandidates(userId: string, today: string) {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, start_time, completed, scheduled_date, overdue_notified')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .not('start_time', 'is', null)
      .not('completed', 'is', true)
      .lte('scheduled_date', today)
      .or(`scheduled_date.eq.${today},overdue_notified.is.null,overdue_notified.eq.false`)
      .order('start_time', { ascending: true });

    if (error) throw error;
    return data ?? [];
  },

  async getTaskById(taskId: string) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .is('deleted_at', null)
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateTask(taskId: string, updates: any) {
    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Batch-write positions for the Anytime backlog, scoped to the owner so a user
  // can only reorder their own tasks (mirrors the ownership guard on PUT /:id).
  async reorderTasks(userId: string, pairs: Array<{ id: string; position: number }>) {
    const results = await Promise.all(
      pairs.map(({ id, position }) =>
        supabase
          .from('tasks')
          .update({ position })
          .eq('id', id)
          .eq('user_id', userId)
      )
    );
    const failed = results.find(result => result.error);
    if (failed?.error) throw failed.error;
  },

  async deleteTask(taskId: string) {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);
    
    if (error) throw error;
  },

  async softDeleteTask(taskId: string) {
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taskId);

    if (error) throw error;
  },

  async deleteHabitSeries(parentHabitId: string, userId: string) {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('user_id', userId)
      .or(`id.eq.${parentHabitId},original_habit_id.eq.${parentHabitId}`);

    if (error) throw error;
  },

  async getHabitSeriesRows(parentHabitId: string, userId: string) {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, google_event_id')
      .eq('user_id', userId)
      .or(`id.eq.${parentHabitId},original_habit_id.eq.${parentHabitId}`);

    if (error) throw error;
    return data || [];
  },

  async softDeleteHabitInstance(parentHabitId: string, date: string, userId: string) {
    const instance = await this.createHabitInstance(parentHabitId, date, userId);
    await this.softDeleteTask(instance.id);
  },

  async deleteTasksByUserId(userId: string, date?: string) {
    let query = supabase
      .from('tasks')
      .delete()
      .eq('user_id', userId);
    
    if (date) {
      query = query.eq('scheduled_date', date);
    }
    
    const { error } = await query;
    if (error) throw error;
  },

  async updateTasksOverdueNotified(userId: string, taskIds: string[]) {
    const { error } = await supabase
      .from('tasks')
      .update({ overdue_notified: true })
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('id', taskIds);
    
    if (error) throw error;
  },

  async getNextPosition(userId: string, scheduledDate: string): Promise<number> {
    const { data, error } = await supabase
      .from('tasks')
      .select('position')
      .eq('user_id', userId)
      .eq('scheduled_date', scheduledDate)
      .is('start_time', null)
      .is('deleted_at', null)
      .not('position', 'is', null)
      .order('position', { ascending: false })
      .limit(1)

    if (error) throw error
    if (!data || data.length === 0) return 0
    return (data[0].position as number) + 1
  },

  // Analytics queries
  async getWeeklyTasks(userId: string) {
    const { data, error } = await supabase
      .from('tasks')
      .select('category, completed, type')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
    if (error) throw error;
    return data;
  },

  async getMonthlyCategoryStats(userId: string) {
    const { data, error } = await supabase
      .from('tasks')
      .select('category, completed')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
    if (error) throw error;
    return data;
  },

  async getTodayProgress(userId: string) {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('tasks')
      .select('completed')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('created_at', today);
    
    if (error) throw error;
    return data;
  },

  async getProductivityAnalytics(userId: string, days: number = 7) {
    const { data, error } = await supabase
      .from('tasks')
      .select('created_at, category, type, completed')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
    
    if (error) throw error;
    return data;
  },

  async getHabitStreaks(userId: string) {
    const { data, error } = await supabase
      .from('tasks')
      .select('title, category, completed, completed_at, habit_outcome')
      .eq('user_id', userId)
      .eq('type', 'habit')
      .is('deleted_at', null)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
    if (error) throw error;
    return data;
  },

  async getTimeDistribution(userId: string) {
    const { data, error } = await supabase
      .from('tasks')
      .select('category, duration')
      .eq('user_id', userId)
      .eq('completed', true)
      .is('deleted_at', null)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
    if (error) throw error;
    return data;
  },

  // AI Recommendations
  async createRecommendation(recommendationData: any) {
    const { data, error } = await supabase
      .from('ai_recommendations')
      .insert(recommendationData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async getRecommendationsByUserId(userId: string) {
    const { data, error } = await supabase
      .from('ai_recommendations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async createMultipleRecommendations(recommendations: any[]) {
    const { data, error } = await supabase
      .from('ai_recommendations')
      .insert(recommendations)
      .select();
    
    if (error) throw error;
    return data;
  },

  async deleteRecommendationsByUserId(userId: string) {
    const { error } = await supabase
      .from('ai_recommendations')
      .delete()
      .eq('user_id', userId);
    
    if (error) throw error;
  },

  // Enhanced function to get dated tasks with recurring habit instances for a specific date.
  // Carry-forward task rows live behind Rollover, outside this DB facade.
  async getTasksWithRecurringHabits(userId: string, date: string) {
    try {
      // Get regular tasks for the specific date (excluding daily habits and rolled-over tasks)
      const { data: regularTasks, error: regularError } = await supabase
        .from('tasks')
        .select('*, project:projects(id, name, color)')
        .eq('user_id', userId)
        .eq('scheduled_date', date)
        .is('deleted_at', null)
        .is('rolled_over_from_task_id', null) // Exclude rolled-over tasks
        .order('start_time', { ascending: true })
        .order('created_at', { ascending: true })

      if (regularError) throw regularError

      // Get all daily habit TEMPLATES (original_habit_id IS NULL). Instance rows also
      // have type='habit' + repeat_type='daily', so without this filter the synthesis
      // below would treat another day's instance as a template and fabricate a virtual
      // instance from it — leaking instances across days.
      const { data: dailyHabits, error: habitsError } = await supabase
        .from('tasks')
        .select('*, project:projects(id, name, color)')
        .eq('user_id', userId)
        .eq('type', 'habit')
        .eq('repeat_type', 'daily')
        .is('original_habit_id', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })

      if (habitsError) throw habitsError

      // Get existing habit instances for this date (habit instances have original_habit_id set)
      const { data: existingInstances, error: instancesError } = await supabase
        .from('tasks')
        .select('*, project:projects(id, name, color)')
        .eq('user_id', userId)
        .eq('scheduled_date', date)
        .is('deleted_at', null)
        .not('original_habit_id', 'is', null)

      if (instancesError) throw instancesError

      // NB: a parent habit row is a pure template (scheduled_date NULL) — it never
      // appears as a concrete dated row, so it is NOT queried here. Each habit-day is
      // either a materialized instance (existingInstances) or a virtual instance
      // (synthesized below); the parent can never collide with either. This removes the
      // parent-vs-instance dedup ambiguity that previously dropped dragged per-day times.

      // Build a set of habit ids that already have a real instance for this date
      const habitIdsWithInstance = new Set(
        existingInstances.map(inst => inst.original_habit_id)
      )

      // Create virtual habit instances for habits that don't have a real instance for this date
      const virtualHabitInstances = dailyHabits
        .filter(habit => !habitIdsWithInstance.has(habit.id))
        .map(habit => ({
          id: `${habit.id}-${date}`,
          title: habit.title,
          type: 'habit' as const,
          category: habit.category,
          start_time: habit.start_time,
          duration: habit.duration,
          habit_target_value: habit.habit_target_value ?? null,
          habit_target_unit: habit.habit_target_unit ?? null,
          habit_outcome: 'pending',
          repeat_type: habit.repeat_type,
          completed: false,
          completed_at: null,
          created_at: habit.created_at,
          scheduled_date: date,
          overdue_notified: false,
          user_id: userId,
          original_habit_id: habit.original_habit_id || habit.id,
          isHabitInstance: true
        }))

      // Combine all tasks for the day. Habit instances appear in BOTH regularTasks
      // (scheduled_date = date) and existingInstances, so dedup below collapses that
      // overlap to one row per habit per day.
      const allTasks = [
        ...regularTasks,
        ...existingInstances,
        ...virtualHabitInstances,
      ]

      // Deduplicate habits: exactly one row per habit per day. Non-habit rows pass
      // through untouched. Now that the parent is a pure template (no dated row), the
      // only habit rows that can share a habit id are (a) the same materialized instance
      // arriving via both regularTasks and existingInstances, and (b) a virtual instance
      // (only synthesized when no real instance exists). Pick deterministically:
      //   1. a real materialized instance (original_habit_id set on a real row) wins over
      //      a virtual instance;
      //   2. among real instances — only stale pre-cleanup duplicates should ever collide
      //      here — prefer the OLDEST created_at, the exact row createHabitInstance updates
      //      in place (its idempotency target), so GET returns what the write path mutates.
      const habitWinners = new Map<string, any>()
      const dedupedTasks: any[] = []
      for (const task of allTasks) {
        if (task.type !== 'habit') {
          dedupedTasks.push(task)
          continue
        }
        const habitId = task.original_habit_id || task.id
        const current = habitWinners.get(habitId)
        if (!current) {
          habitWinners.set(habitId, task)
          continue
        }
        // Prefer a materialized instance over a virtual instance, and either over
        // a legacy dated parent template. New parents are always undated, but this
        // ordering keeps reads correct until older rows have been normalized.
        const taskIsVirtual = task.id === `${habitId}-${date}`
        const currentIsVirtual = current.id === `${habitId}-${date}`
        const taskRank = task.original_habit_id ? (taskIsVirtual ? 2 : 3) : 1
        const currentRank = current.original_habit_id ? (currentIsVirtual ? 2 : 3) : 1
        if (taskRank !== currentRank) {
          if (taskRank > currentRank) habitWinners.set(habitId, task)
          continue
        }
        // Both real (only stale pre-cleanup duplicates collide here): prefer the older
        // row (matches createHabitInstance's idempotency target).
        if (task.created_at && current.created_at && task.created_at < current.created_at) {
          habitWinners.set(habitId, task)
        }
      }
      dedupedTasks.push(...habitWinners.values())

      // Sort by start time and creation time (issue #8 fix: use sortTasksForTimeline)
      return sortTasksForTimeline(dedupedTasks)
    } catch (error) {
      console.error('Error getting tasks with recurring habits:', error)
      throw error
    }
  },

  // Materialize the real habit-instance row for a given habit + date (idempotent:
  // at most one row per habit per day). If a row already exists for that date it is
  // UPDATED with only the supplied overrides — so completing a previously-dragged
  // instance keeps its time, and dragging a completed instance keeps it completed.
  // Only callers that pass `completed` change the completion flag; drag/edit must omit
  // it so they never clobber an existing row's done state. Fresh rows default to
  // not-completed.
  async createHabitInstance(
    originalHabitId: string,
    date: string,
    userId: string,
    overrides: {
      completed?: boolean
      start_time?: string | null
      position?: number | null
      title?: string
      category?: string
      duration?: number | null
    } = {}
  ) {
    try {
      // Get the original habit
      const { data: originalHabit, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', originalHabitId)
        .is('deleted_at', null)
        .single()

      if (fetchError) throw fetchError
      if (!originalHabit) throw new Error('Original habit not found')

      // Already materialized for this date? Update it instead of inserting a duplicate.
      const { data: existingRows, error: existingError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('original_habit_id', originalHabitId)
        .eq('scheduled_date', date)
        .order('created_at', { ascending: true })
        .limit(1)
      if (existingError) throw existingError
      const existing = existingRows && existingRows[0]

      if (existing) {
        const upd: any = {}
        if ('completed' in overrides) {
          upd.completed = overrides.completed
          upd.completed_at = overrides.completed ? new Date().toISOString() : null
        }
        if ('start_time' in overrides) upd.start_time = overrides.start_time
        if ('position' in overrides) upd.position = overrides.position
        if ('title' in overrides) upd.title = overrides.title
        if ('category' in overrides) upd.category = overrides.category
        if ('duration' in overrides) upd.duration = overrides.duration
        if (Object.keys(upd).length === 0) return existing
        const { data: updated, error: updateError } = await supabase
          .from('tasks')
          .update(upd)
          .eq('id', existing.id)
          .select()
          .single()
        if (updateError) throw updateError
        return updated
      }

      const isCompleted = overrides.completed ?? false
      // Create the habit instance
      const { data: habitInstance, error: createError } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          // Per-day overrides (this-day-only edit) fall back to the habit's own values
          title: 'title' in overrides ? overrides.title : originalHabit.title,
          type: 'habit',
          category: 'category' in overrides ? overrides.category : originalHabit.category,
          // Allow drag to override start_time; fall back to the habit's own time
          start_time: 'start_time' in overrides ? overrides.start_time : originalHabit.start_time,
          duration: 'duration' in overrides ? overrides.duration : originalHabit.duration,
          habit_target_value: originalHabit.habit_target_value ?? null,
          habit_target_unit: originalHabit.habit_target_unit ?? null,
          habit_outcome: isCompleted ? 'completed' : 'pending',
          repeat_type: originalHabit.repeat_type,
          completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
          scheduled_date: date,
          original_habit_id: originalHabitId,
          position: overrides.position ?? null,
        })
        .select()
        .single()

      if (createError) throw createError
      return habitInstance
    } catch (error) {
      console.error('Error creating habit instance:', error)
      throw error
    }
  },

  async createHabitProgressEntry(row: {
    habit_instance_id: string
    user_id: string
    amount: number
    note?: string | null
  }) {
    const { data, error } = await supabase.from('habit_progress_entries').insert(row).select().single()
    if (error) throw error
    return data
  },

  async getHabitProgressEntries(instanceId: string) {
    const { data, error } = await supabase
      .from('habit_progress_entries')
      .select('*')
      .eq('habit_instance_id', instanceId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async getHabitProgressEntry(entryId: string) {
    const { data, error } = await supabase.from('habit_progress_entries').select('*').eq('id', entryId).maybeSingle()
    if (error) throw error
    return data
  },

  async updateHabitProgressEntry(entryId: string, updates: { amount?: number; note?: string | null }) {
    const { data, error } = await supabase
      .from('habit_progress_entries')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', entryId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteHabitProgressEntry(entryId: string) {
    const { error } = await supabase.from('habit_progress_entries').delete().eq('id', entryId)
    if (error) throw error
  },

  // One batched fetch serves both the per-instance total and the per-chunk
  // timestamps the timeline needs. Ordered so chunks read chronologically.
  async getHabitProgressEntriesForInstances(instanceIds: string[]) {
    if (instanceIds.length === 0) return {} as Record<string, any[]>
    const { data, error } = await supabase
      .from('habit_progress_entries')
      .select('id, habit_instance_id, amount, note, created_at')
      .in('habit_instance_id', instanceIds)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []).reduce((grouped: Record<string, any[]>, row: any) => {
      ;(grouped[row.habit_instance_id] ??= []).push(row)
      return grouped
    }, {})
  },

  async getHabitProgressTotals(instanceIds: string[]) {
    const grouped = await this.getHabitProgressEntriesForInstances(instanceIds)
    return Object.entries(grouped).reduce((totals: Record<string, number>, [id, rows]) => {
      totals[id] = rows.reduce((sum: number, row: any) => sum + Number(row.amount), 0)
      return totals
    }, {})
  },

  // Calorie entries
  async getCalorieEntriesByDay(userId: string, date: string) {
    const { data, error } = await supabase
      .from('calorie_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .order('time', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (error) throw error
    return data
  },

  async createCalorieEntry(entryData: {
    id: string
    user_id: string
    date: string
    time?: string | null
    name: string
    calories: number
    protein?: number | null
    carbs?: number | null
    fat?: number | null
    quantity?: string | null
  }) {
    // Upsert calorie item and update usage
    await this.upsertCalorieItem(entryData.user_id, entryData.name, {
      calories: entryData.calories,
      protein: entryData.protein ?? null,
      carbs: entryData.carbs ?? null,
      fat: entryData.fat ?? null,
      quantity: entryData.quantity ?? null,
    })

    // Insert the entry
    const { data, error } = await supabase
      .from('calorie_entries')
      .insert(entryData)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getCalorieEntryById(entryId: string) {
    const { data, error } = await supabase
      .from('calorie_entries')
      .select('*')
      .eq('id', entryId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async updateCalorieEntry(entryId: string, updates: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('calorie_entries')
      .update(updates)
      .eq('id', entryId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteCalorieEntry(entryId: string) {
    const { error } = await supabase
      .from('calorie_entries')
      .delete()
      .eq('id', entryId)
    if (error) throw error
  },

  // Settings — single JSONB column, upsert keeps it to one row per user
  async getUserSettings(userId: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return (data?.settings as Record<string, unknown>) ?? {}
  },

  async upsertUserSettings(userId: string, settings: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await this.getUserSettings(userId)
    const merged = { ...existing, ...settings }
    const { data, error } = await supabase
      .from('user_settings')
      .upsert({ user_id: userId, settings: merged, updated_at: new Date().toISOString() })
      .select('settings')
      .single()
    if (error) throw error
    return data.settings as Record<string, unknown>
  },

  // Proactivity: rhythm (one JSONB row per user, mirrors user_settings)
  async getUserRhythm(userId: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
      .from('user_rhythm')
      .select('rhythm')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return (data?.rhythm as Record<string, unknown>) ?? {}
  },

  async upsertUserRhythm(userId: string, rhythm: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await this.getUserRhythm(userId)
    const merged = { ...existing, ...rhythm }
    for (const key of ['morning', 'midday', 'weekly']) {
      const existingValue = existing[key]
      const nextValue = rhythm[key]
      if (
        nextValue &&
        typeof nextValue === 'object' &&
        !Array.isArray(nextValue) &&
        existingValue &&
        typeof existingValue === 'object' &&
        !Array.isArray(existingValue)
      ) {
        merged[key] = { ...(existingValue as Record<string, unknown>), ...(nextValue as Record<string, unknown>) }
      }
    }
    const { data, error } = await supabase
      .from('user_rhythm')
      .upsert({ user_id: userId, rhythm: merged, updated_at: new Date().toISOString() })
      .select('rhythm')
      .single()
    if (error) throw error
    return data.rhythm as Record<string, unknown>
  },

  // Returns every rhythm row for the scheduler tick.
  async listAllRhythms(): Promise<Array<{ user_id: string; rhythm: Record<string, unknown> }>> {
    const { data, error } = await supabase
      .from('user_rhythm')
      .select('user_id, rhythm')
    if (error) throw error
    return (data ?? []) as Array<{ user_id: string; rhythm: Record<string, unknown> }>
  },

  // Contact messages
  async createContactMessage(row: {
    user_id: string
    kind: 'subscribe' | 'topup'
    message: string
  }) {
    const { data, error } = await supabase
      .from('contact_messages')
      .insert(row)
      .select('id, user_id, kind, message, status, handled_at, handled_by, created_at, updated_at')
      .single()
    if (error) throw error
    return data
  },

  async getContactMessages(status: 'pending' | 'handled' | 'all' = 'pending') {
    let query = supabase
      .from('contact_messages')
      .select('id, user_id, kind, message, status, handled_at, handled_by, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(100)

    if (status !== 'all') query = query.eq('status', status)

    const { data: messages, error } = await query
    if (error) throw error

    const users = await this.getAllUsers()
    const usersById = new Map(users.map(user => [user.id, user]))
    return (messages ?? []).map(message => {
      const user = usersById.get(message.user_id)
      return {
        id: message.id,
        userId: message.user_id,
        userEmail: user?.email ?? null,
        userName: user?.name ?? null,
        kind: message.kind,
        message: message.message,
        status: message.status,
        handledAt: message.handled_at,
        handledBy: message.handled_by,
        createdAt: message.created_at,
        updatedAt: message.updated_at,
      }
    })
  },

  async updateContactMessageStatus(
    messageId: string,
    status: 'pending' | 'handled',
    handledBy: string | null
  ) {
    const { data, error } = await supabase
      .from('contact_messages')
      .update({
        status,
        handled_at: status === 'handled' ? new Date().toISOString() : null,
        handled_by: status === 'handled' ? handledBy : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .select('id, user_id, kind, message, status, handled_at, handled_by, created_at, updated_at')
      .single()
    if (error) throw error

    const user = await this.getUserById(data.user_id)
    return {
      id: data.id,
      userId: data.user_id,
      userEmail: user?.email ?? null,
      userName: user?.name ?? null,
      kind: data.kind,
      message: data.message,
      status: data.status,
      handledAt: data.handled_at,
      handledBy: data.handled_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  },

  // ponytail: test-mode only — deletes all task rows for the given user
  // Must clear every table that can put a row on a day. Once the timeline became
  // the day's record (ADR-0002 era), Calorie entries, weight, Progress results and
  // Habit progress chunks started earning hour slots too — but this reset still
  // only cleared tasks and workouts. The leftovers silently broke specs in other
  // subjects: items-lifecycle's schedule-compaction assertions fail when a stray
  // Calorie entry from the health specs occupies an hour that should be empty.
  async resetTestUser(
    userId: string,
    options: { onboardingStatus?: 'active' | 'completed' | 'skipped' } = {}
  ) {
    const userScoped = [
      'workout_plans',
      'workout_sessions',
      'workout_exercise_items',
      'calorie_entries',
      'calorie_items',
      'weight_entries',
      'achievement_entries',
      'achievement_definitions',
      'habit_progress_entries',
    ]
    for (const table of userScoped) {
      const { error } = await supabase.from(table).delete().eq('user_id', userId)
      // Deliberately loud: a silently failing reset leaks state into the next
      // spec, which is far harder to debug than a failed reset call.
      if (error) throw new Error(`resetTestUser: ${table}: ${error.message}`)
    }

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('user_id', userId)
    if (error) throw error

    if (options.onboardingStatus) {
      await this.upsertUserSettings(userId, {
        onboardingStatus: options.onboardingStatus,
      })
    }
  },

  // Credits
  async getCreditBalance(userId: string): Promise<number> {
    const { data, error } = await supabase
      .from('user_credits')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data?.balance ?? 0
  },

  // Atomic decrement via Postgres function — returns new balance, or null when
  // the balance is insufficient (no overspend, no read-then-write race).
  async reserveCredits(userId: string, cost: number): Promise<number | null> {
    const { data, error } = await supabase.rpc('reserve_credits', {
      p_user_id: userId,
      p_cost: cost,
    })
    if (error) throw error
    return data ?? null
  },

  async grantCredits(userId: string, amount: number): Promise<number> {
    const { data, error } = await supabase.rpc('grant_credits', {
      p_user_id: userId,
      p_amount: amount,
    })
    if (error) throw error
    return data
  },

  async claimSignupCreditGrant(userId: string, offer: {
    foundingMemberLimit: number
    foundingCredits: number
    standardCredits: number
  }) {
    const { data, error } = await supabase.rpc('claim_signup_credit_grant', {
      p_user_id: userId,
      p_founding_limit: offer.foundingMemberLimit,
      p_founding_credits: offer.foundingCredits,
      p_standard_credits: offer.standardCredits,
    })
    if (error) throw error
    return data
  },

  async getFoundingSignupCreditGrantCount(): Promise<number> {
    const { count, error } = await supabase
      .from('signup_credit_grants')
      .select('user_id', { count: 'exact', head: true })
      .eq('cohort', 'founding')
    if (error) throw error
    return count ?? 0
  },

  async getSignupCreditGrant(userId: string) {
    const { data, error } = await supabase
      .from('signup_credit_grants')
      .select('user_id, cohort, credits, balance_after, created_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async grantSubscriptionCredits(userId: string, amount: number): Promise<number> {
    const { data, error } = await supabase.rpc('grant_subscription_credits', {
      p_user_id: userId,
      p_amount: amount,
    })
    if (error) throw error
    return data
  },

  async insertUsageLog(row: {
    user_id: string
    endpoint?: string
    model?: string
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    credits_delta: number
    reason?: string
    request_id?: string
    reserved_tokens?: number
    base_tokens?: number
    markup_tokens?: number
    estimated?: boolean
    balance_before?: number
    balance_after?: number
  }) {
    const { error } = await supabase.from('ai_usage_log').insert(row)
    if (error) throw error
  },

  async setCreditBalance(userId: string, balance: number): Promise<number> {
    const { data, error } = await supabase
      .from('user_credits')
      .upsert({
        user_id: userId,
        balance,
        subscription_balance: 0,
        topup_balance: balance,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select('balance')
      .single()
    if (error) throw error
    return data.balance
  },

  async getUsersWithCreditBalances() {
    const users = await this.getAllUsers()
    const { data: credits, error } = await supabase
      .from('user_credits')
      .select('user_id, balance, subscription_balance, topup_balance, updated_at')
    if (error) throw error

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from('user_credit_subscriptions')
      .select('user_id, active, price_phase, monthly_credits, renewal_date, last_monthly_grant_at, updated_at')
    if (subscriptionError) throw subscriptionError

    const balances = new Map((credits ?? []).map(row => [row.user_id, row]))
    const subscriptionByUser = new Map((subscriptions ?? []).map(row => [row.user_id, row]))
    return users.map(user => {
      const credit = balances.get(user.id)
      const subscription = subscriptionByUser.get(user.id)
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role ?? 'user',
        created_at: user.created_at,
        balance: credit?.balance ?? 0,
        subscription_balance: credit?.subscription_balance ?? 0,
        topup_balance: credit?.topup_balance ?? credit?.balance ?? 0,
        balance_updated_at: credit?.updated_at ?? null,
        subscription: subscription ? {
          active: subscription.active,
          price_phase: subscription.price_phase,
          monthly_credits: subscription.monthly_credits,
          renewal_date: subscription.renewal_date,
          last_monthly_grant_at: subscription.last_monthly_grant_at,
          updated_at: subscription.updated_at,
        } : null,
      }
    })
  },

  async getCreditBuckets(userId: string) {
    const { data, error } = await supabase
      .from('user_credits')
      .select('balance, subscription_balance, topup_balance, updated_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getCreditSubscriptionSettings() {
    const { data, error } = await supabase
      .from('credit_subscription_settings')
      .select('promo_active, updated_at')
      .eq('id', true)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async updateCreditSubscriptionSettings(settings: { promo_active: boolean }) {
    const { data, error } = await supabase
      .from('credit_subscription_settings')
      .upsert({
        id: true,
        promo_active: settings.promo_active,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select('promo_active, updated_at')
      .single()
    if (error) throw error
    return data
  },

  async getUserCreditSubscription(userId: string) {
    const { data, error } = await supabase
      .from('user_credit_subscriptions')
      .select('user_id, active, price_phase, monthly_credits, renewal_date, last_monthly_grant_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async upsertUserCreditSubscription(row: {
    user_id: string
    active: boolean
    price_phase: 'promo' | 'regular'
    monthly_credits: number
    renewal_date: string | null
    last_monthly_grant_at?: string | null
  }) {
    const { data, error } = await supabase
      .from('user_credit_subscriptions')
      .upsert({
        ...row,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select('user_id, active, price_phase, monthly_credits, renewal_date, last_monthly_grant_at, updated_at')
      .single()
    if (error) throw error
    return data
  },

  async getBillingSettings() {
    const { data, error } = await supabase
      .from('ai_billing_settings')
      .select('app_tokens_per_usd, markup_rate, min_markup_tokens, updated_at')
      .eq('id', true)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async updateBillingSettings(settings: { markup_rate: number; min_markup_tokens: number }) {
    const { data, error } = await supabase
      .from('ai_billing_settings')
      .upsert({
        id: true,
        app_tokens_per_usd: 1000,
        markup_rate: settings.markup_rate,
        min_markup_tokens: settings.min_markup_tokens,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select('app_tokens_per_usd, markup_rate, min_markup_tokens, updated_at')
      .single()
    if (error) throw error
    return data
  },

  // ---- Waitlist access control ----

  async getWaitlistByEmail(email: string) {
    const { data, error } = await supabase
      .from('waitlist')
      .select('*')
      .eq('email', email)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async createWaitlistEntry(entry: {
    email: string
    name?: string | null
    source?: string | null
    utm_source?: string | null
    utm_medium?: string | null
    utm_campaign?: string | null
  }) {
    const { data, error } = await supabase
      .from('waitlist')
      .insert(entry)
      .select('*')
      .single()
    if (error) throw error
    return data
  },

  async listWaitlist(status?: string) {
    let query = supabase.from('waitlist').select('*').order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async setWaitlistStatus(id: string, status: string, invitedAt?: string) {
    const patch: Record<string, unknown> = { status }
    if (invitedAt) patch.invited_at = invitedAt
    const { data, error } = await supabase
      .from('waitlist')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data
  },

  async deleteWaitlistEntry(id: string) {
    const { error } = await supabase.from('waitlist').delete().eq('id', id)
    if (error) throw error
  },

  async createInvite(invite: { token: string; waitlist_id: string }) {
    const { data, error } = await supabase
      .from('invites')
      .insert(invite)
      .select('*')
      .single()
    if (error) throw error
    return data
  },

  async getInviteByToken(token: string) {
    const { data, error } = await supabase
      .from('invites')
      .select('*')
      .eq('token', token)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async redeemInvite(token: string, userId: string) {
    // Guarded on redeemed_at IS NULL so a token cannot be redeemed twice.
    const { data, error } = await supabase
      .from('invites')
      .update({ redeemed_at: new Date().toISOString(), redeemed_by_user_id: userId })
      .eq('token', token)
      .is('redeemed_at', null)
      .select('*')
      .maybeSingle()
    if (error) throw error
    return data
  },

  async listInvitesForWaitlist(waitlistIds: string[]) {
    if (waitlistIds.length === 0) return []
    const { data, error } = await supabase
      .from('invites')
      .select('*')
      .in('waitlist_id', waitlistIds)
    if (error) throw error
    return data ?? []
  },

  async getSignupAccess() {
    const { data, error } = await supabase
      .from('signup_access')
      .select('public_slots_open, public_slots_claimed, updated_at')
      .eq('id', true)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async updateSignupAccess(settings: {
    public_slots_open: number
    public_slots_claimed: number
  }) {
    const { data, error } = await supabase
      .from('signup_access')
      .update({
        public_slots_open: settings.public_slots_open,
        public_slots_claimed: settings.public_slots_claimed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true)
      .select('public_slots_open, public_slots_claimed, updated_at')
      .single()
    if (error) throw error
    return data
  },

  async claimPublicSignupSlot(): Promise<boolean> {
    const { data, error } = await supabase.rpc('claim_public_signup_slot')
    if (error) throw error
    return data === true
  },

  async releasePublicSignupSlot(): Promise<boolean> {
    const { data, error } = await supabase.rpc('release_public_signup_slot')
    if (error) throw error
    return data === true
  },

  async getUsageLogsSince(sinceIso: string) {
    const { data, error } = await supabase
      .from('ai_usage_log')
      .select('id, user_id, endpoint, model, prompt_tokens, completion_tokens, total_tokens, credits_delta, reason, reserved_tokens, base_tokens, markup_tokens, estimated, balance_before, balance_after, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getRecentUsageLogs(limit = 100) {
    const { data, error } = await supabase
      .from('ai_usage_log')
      .select('id, user_id, endpoint, model, prompt_tokens, completion_tokens, total_tokens, credits_delta, reason, reserved_tokens, base_tokens, markup_tokens, estimated, balance_before, balance_after, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  // Calorie items (reusable, tracked by usage)
  async upsertCalorieItem(userId: string, name: string, defaults: {
    calories: number
    protein?: number | null
    carbs?: number | null
    fat?: number | null
    quantity?: string | null
  }) {
    const normalizedName = name.trim().toLowerCase()
    const quantity = typeof defaults.quantity === 'string' && defaults.quantity.trim() ? defaults.quantity.trim() : null
    const normalizedQuantity = quantity ? quantity.toLowerCase().replace(/\s+/g, ' ') : ''
    const now = new Date().toISOString()

    const { data: existing, error: getError } = await supabase
      .from('calorie_items')
      .select('id')
      .eq('user_id', userId)
      .eq('normalized_name', normalizedName)
      .eq('normalized_quantity', normalizedQuantity)
      .maybeSingle()

    if (getError) throw getError

    if (existing) {
      // Increment usage and update last_used_at atomically via RPC
      const { data, error } = await supabase
        .rpc('upsert_calorie_item_usage', {
          p_user_id: userId,
          p_normalized_name: normalizedName,
          p_normalized_quantity: normalizedQuantity,
          p_now: now,
        })
        .single()
      if (error) throw error
      return data
    } else {
      // Create new item
      const { data, error } = await supabase
        .from('calorie_items')
        .insert({
          user_id: userId,
          name,
          normalized_name: normalizedName,
          quantity,
          normalized_quantity: normalizedQuantity,
          calories: defaults.calories,
          protein: defaults.protein ?? null,
          carbs: defaults.carbs ?? null,
          fat: defaults.fat ?? null,
          usage_count: 1,
          last_used_at: now,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
  },

  async incrementCalorieItemUsage(calorieItemId: string) {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .rpc('increment_calorie_item_usage', {
        p_calorie_item_id: calorieItemId,
        p_now: now,
      })
    if (error) throw error
    return data
  },

  async getCalorieItemByNormalizedName(userId: string, normalizedName: string) {
    const { data, error } = await supabase
      .from('calorie_items')
      .select('*')
      .eq('user_id', userId)
      .eq('normalized_name', normalizedName)
      .order('last_used_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getMostUsedCalorieItems(userId: string, limit: number = 10) {
    const { data, error } = await supabase
      .from('calorie_items')
      .select('*')
      .eq('user_id', userId)
      .order('usage_count', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  async getRecentCalorieItems(userId: string, limit: number = 10) {
    const { data, error } = await supabase
      .from('calorie_items')
      .select('*')
      .eq('user_id', userId)
      .order('last_used_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  // Workout Tracker
  async getWorkoutPlans(userId: string) {
    const { data, error } = await supabase
      .from('workout_plans')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async getWorkoutPlanById(planId: string) {
    const { data, error } = await supabase
      .from('workout_plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async createWorkoutPlan(planData: {
    id: string
    user_id: string
    name: string
    color?: string | null
    note?: string | null
    position: number
  }) {
    const { data, error } = await supabase
      .from('workout_plans')
      .insert(planData)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateWorkoutPlan(planId: string, updates: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('workout_plans')
      .update(updates)
      .eq('id', planId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteWorkoutPlan(planId: string) {
    const { error } = await supabase
      .from('workout_plans')
      .delete()
      .eq('id', planId)
    if (error) throw error
  },

  async getWorkoutPlanExercises(planId: string) {
    const { data, error } = await supabase
      .from('workout_plan_items')
      .select('*')
      .eq('plan_id', planId)
      .order('position', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async createWorkoutPlanExercises(exercises: Array<{
    id: string
    plan_id: string
    name: string
    sets?: number | null
    reps?: number | null
    weight_kg?: number | null
    duration_minutes?: number | null
    distance_km?: number | null
    notes?: string | null
    position: number
  }>) {
    if (exercises.length === 0) return []
    const { data, error } = await supabase
      .from('workout_plan_items')
      .insert(exercises)
      .select()
    if (error) throw error
    return data ?? []
  },

  async deleteWorkoutPlanExercises(planId: string) {
    const { error } = await supabase
      .from('workout_plan_items')
      .delete()
      .eq('plan_id', planId)
    if (error) throw error
  },

  async getWorkoutSessionsByDay(userId: string, date: string) {
    const { data, error } = await supabase
      .from('workout_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getWorkoutSessionById(sessionId: string) {
    const { data, error } = await supabase
      .from('workout_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async createWorkoutSession(sessionData: {
    id: string
    user_id: string
    date: string
    title?: string | null
    notes?: string | null
  }) {
    const { data, error } = await supabase
      .from('workout_sessions')
      .insert(sessionData)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateWorkoutSession(sessionId: string, updates: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('workout_sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteWorkoutSession(sessionId: string) {
    const { error } = await supabase
      .from('workout_sessions')
      .delete()
      .eq('id', sessionId)
    if (error) throw error
  },

  async getWorkoutSessionExercises(sessionId: string) {
    const { data, error } = await supabase
      .from('workout_session_exercises')
      .select('*')
      .eq('session_id', sessionId)
      .order('position', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async getWorkoutSessionExerciseById(exerciseId: string) {
    const { data, error } = await supabase
      .from('workout_session_exercises')
      .select('*')
      .eq('id', exerciseId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async createWorkoutSessionExercise(exerciseData: {
    id: string
    session_id: string
    name: string
    sets?: number | null
    reps?: number | null
    weight_kg?: number | null
    duration_minutes?: number | null
    distance_km?: number | null
    notes?: string | null
    position: number
  }) {
    const { data, error } = await supabase
      .from('workout_session_exercises')
      .insert(exerciseData)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async createWorkoutSessionExercises(exercises: Array<{
    id: string
    session_id: string
    name: string
    sets?: number | null
    reps?: number | null
    weight_kg?: number | null
    duration_minutes?: number | null
    distance_km?: number | null
    notes?: string | null
    position: number
  }>) {
    const { data, error } = await supabase
      .from('workout_session_exercises')
      .insert(exercises)
      .select()
    if (error) throw error
    return data ?? []
  },

  async updateWorkoutSessionExercise(exerciseId: string, updates: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('workout_session_exercises')
      .update(updates)
      .eq('id', exerciseId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteWorkoutSessionExercise(exerciseId: string) {
    const { error } = await supabase
      .from('workout_session_exercises')
      .delete()
      .eq('id', exerciseId)
    if (error) throw error
  },

  async upsertWorkoutExerciseItem(userId: string, exercise: {
    name: string
    sets?: number | null
    reps?: number | null
    weightKg?: number | null
    durationMinutes?: number | null
    distanceKm?: number | null
    notes?: string | null
  }) {
    const normalizedName = exercise.name.trim().toLowerCase()
    const now = new Date().toISOString()

    const { data: existing, error: getError } = await supabase
      .from('workout_exercise_items')
      .select('id')
      .eq('user_id', userId)
      .eq('normalized_name', normalizedName)
      .maybeSingle()
    if (getError) throw getError

    if (existing) {
      const { data, error } = await supabase
        .rpc('upsert_workout_exercise_item_usage', {
          p_user_id: userId,
          p_normalized_name: normalizedName,
          p_name: exercise.name,
          p_sets: exercise.sets ?? null,
          p_reps: exercise.reps ?? null,
          p_weight_kg: exercise.weightKg ?? null,
          p_duration_minutes: exercise.durationMinutes ?? null,
          p_distance_km: exercise.distanceKm ?? null,
          p_notes: exercise.notes ?? null,
          p_now: now,
        })
        .single()
      if (error) throw error
      return data
    }

    const { data, error } = await supabase
      .from('workout_exercise_items')
      .insert({
        user_id: userId,
        name: exercise.name,
        normalized_name: normalizedName,
        sets: exercise.sets ?? null,
        reps: exercise.reps ?? null,
        weight_kg: exercise.weightKg ?? null,
        duration_minutes: exercise.durationMinutes ?? null,
        distance_km: exercise.distanceKm ?? null,
        notes: exercise.notes ?? null,
        usage_count: 1,
        last_used_at: now,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getMostUsedWorkoutExerciseItems(userId: string, limit: number = 10) {
    const { data, error } = await supabase
      .from('workout_exercise_items')
      .select('*')
      .eq('user_id', userId)
      .order('usage_count', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  async getRecentWorkoutExerciseItems(userId: string, limit: number = 10) {
    const { data, error } = await supabase
      .from('workout_exercise_items')
      .select('*')
      .eq('user_id', userId)
      .order('last_used_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  // AI control plane
  async createAiAuditLog(row: {
    user_id: string
    caller: 'internal' | 'mcp'
    tool: string
    args_summary?: unknown
    target_ids?: unknown[]
    result?: unknown
    model?: string | null
    request_id?: string | null
  }) {
    const payload = {
      ...row,
      args_summary: row.args_summary ?? {},
      target_ids: row.target_ids ?? [],
      result: row.result ?? {},
    }
    const { data, error } = await supabase
      .from('ai_audit_log')
      .insert(payload)
      .select()
      .single()
    if (error && error.code === '23505' && row.request_id) {
      const { data: existing, error: lookupError } = await supabase
        .from('ai_audit_log')
        .select('*')
        .eq('user_id', row.user_id)
        .eq('request_id', row.request_id)
        .eq('tool', row.tool)
        .single()
      if (lookupError) throw lookupError
      return existing
    }
    if (error) throw error
    return data
  },

  async getAiIdempotency(userId: string, requestId: string, tool: string) {
    const { data, error } = await supabase
      .from('ai_idempotency')
      .select('*')
      .eq('user_id', userId)
      .eq('request_id', requestId)
      .eq('tool', tool)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async createAiIdempotency(row: {
    user_id: string
    request_id: string
    tool: string
    result: unknown
  }) {
    const { data, error } = await supabase
      .from('ai_idempotency')
      .insert(row)
      .select()
      .single()
    if (error && error.code === '23505') {
      const { data: existing, error: lookupError } = await supabase
        .from('ai_idempotency')
        .select('*')
        .eq('user_id', row.user_id)
        .eq('request_id', row.request_id)
        .eq('tool', row.tool)
        .single()
      if (lookupError) throw lookupError
      return existing
    }
    if (error) throw error
    return data
  },

  async createAiPendingAction(row: {
    id?: string
    user_id: string
    capability: string
    args: unknown
    preview: unknown
    caller: 'internal' | 'mcp'
    expires_at: string
    workflow_id?: string
    workflow_revision?: number
    source_fingerprint?: string
    status?: 'presented'
  }) {
    const { data, error } = await supabase
      .from('ai_pending_actions')
      .insert(row)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getAiPendingAction(actionId: string) {
    const { data, error } = await supabase
      .from('ai_pending_actions')
      .select('*')
      .eq('id', actionId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async markAiPendingActionExecuted(actionId: string) {
    const { data, error } = await supabase
      .from('ai_pending_actions')
      .update({
        status: 'executed',
        executed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', actionId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async cancelAiPendingAction(actionId: string, userId: string) {
    const { data, error } = await supabase
      .from('ai_pending_actions')
      .update({
        status: 'declined',
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', actionId)
      .eq('user_id', userId)
      .select()
      .maybeSingle()
    if (error) throw error
    return data
  },

  async createApiToken(row: {
    id: string
    user_id: string
    name: string
    token_hash: string
    scopes: string[]
    audience: string
  }) {
    const { data, error } = await supabase
      .from('api_tokens')
      .insert(row)
      .select('id, user_id, name, scopes, audience, created_at, last_used_at, revoked_at')
      .single()
    if (error) throw error
    return data
  },

  async listApiTokens(userId: string) {
    const { data, error } = await supabase
      .from('api_tokens')
      .select('id, user_id, name, scopes, audience, created_at, last_used_at, revoked_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getApiTokenByHash(tokenHash: string) {
    const { data, error } = await supabase
      .from('api_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async touchApiToken(tokenId: string) {
    const { error } = await supabase
      .from('api_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenId)
    if (error) throw error
  },

  async revokeApiToken(userId: string, tokenId: string) {
    const { data, error } = await supabase
      .from('api_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', tokenId)
      .eq('user_id', userId)
      .select('id, user_id, name, scopes, audience, created_at, last_used_at, revoked_at')
      .maybeSingle()
    if (error) throw error
    return data
  },

  async createMcpOAuthAuthorizationCode(row: {
    id: string
    code_hash: string
    user_id: string
    client_id: string
    client_name: string
    redirect_uri: string
    scopes: string[]
    resource: string
    code_challenge: string
    expires_at: string
  }) {
    const { data, error } = await supabase
      .from('mcp_oauth_authorization_codes')
      .insert(row)
      .select('id')
      .single()
    if (error) throw error
    return data
  },

  async getMcpOAuthAuthorizationCodeByHash(codeHash: string) {
    const { data, error } = await supabase
      .from('mcp_oauth_authorization_codes')
      .select('client_id, code_challenge, expires_at, consumed_at')
      .eq('code_hash', codeHash)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async exchangeMcpOAuthAuthorizationCode(input: {
    code_hash: string
    client_id: string
    redirect_uri: string
    resource: string
    grant_id: string
    refresh_token_hash: string
    refresh_expires_at: string
  }) {
    const { data, error } = await supabase.rpc('exchange_mcp_oauth_code', {
      p_code_hash: input.code_hash,
      p_client_id: input.client_id,
      p_redirect_uri: input.redirect_uri,
      p_resource: input.resource,
      p_grant_id: input.grant_id,
      p_refresh_token_hash: input.refresh_token_hash,
      p_refresh_expires_at: input.refresh_expires_at,
    })
    if (error) throw error
    return data?.[0] ?? null
  },

  async rotateMcpOAuthRefreshToken(input: {
    refresh_token_hash: string
    client_id: string
    resource: string
    new_refresh_token_hash: string
    new_refresh_expires_at: string
  }) {
    const { data, error } = await supabase.rpc(
      'rotate_mcp_oauth_refresh_token',
      {
        p_refresh_token_hash: input.refresh_token_hash,
        p_client_id: input.client_id,
        p_resource: input.resource,
        p_new_refresh_token_hash: input.new_refresh_token_hash,
        p_new_refresh_expires_at: input.new_refresh_expires_at,
      }
    )
    if (error) throw error
    return data?.[0] ?? null
  },

  async getMcpOAuthGrantByRefreshHash(input: {
    refresh_token_hash: string
    client_id: string
    resource: string
  }) {
    const { data, error } = await supabase
      .from('mcp_oauth_grants')
      .select('id, scopes')
      .eq('refresh_token_hash', input.refresh_token_hash)
      .eq('client_id', input.client_id)
      .eq('resource', input.resource)
      .is('revoked_at', null)
      .gt('refresh_expires_at', new Date().toISOString())
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getMcpOAuthGrant(grantId: string) {
    const { data, error } = await supabase
      .from('mcp_oauth_grants')
      .select('id, user_id, client_id, scopes, resource, revoked_at')
      .eq('id', grantId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async touchMcpOAuthGrant(grantId: string) {
    const { error } = await supabase
      .from('mcp_oauth_grants')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', grantId)
      .is('revoked_at', null)
    if (error) throw error
  },

  async listMcpOAuthGrants(userId: string) {
    const { data, error } = await supabase
      .from('mcp_oauth_grants')
      .select('id, client_name, scopes, created_at, last_used_at, revoked_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async revokeMcpOAuthGrant(userId: string, grantId: string) {
    const { data, error } = await supabase
      .from('mcp_oauth_grants')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', grantId)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .select('id, client_name, scopes, created_at, last_used_at, revoked_at')
      .maybeSingle()
    if (error) throw error
    return data
  },

  async revokeMcpOAuthGrantByRefreshHash(input: {
    refresh_token_hash: string
    client_id: string
    resource: string
  }) {
    const { error } = await supabase
      .from('mcp_oauth_grants')
      .update({ revoked_at: new Date().toISOString() })
      .eq('refresh_token_hash', input.refresh_token_hash)
      .eq('client_id', input.client_id)
      .eq('resource', input.resource)
      .is('revoked_at', null)
    if (error) throw error
  },

  async createMcpOAuthClient(row: {
    client_id: string
    client_name: string
    redirect_uris: string[]
    grant_types: string[]
    response_types: string[]
    scope: string | null
    client_uri: string | null
    logo_uri: string | null
    policy_uri: string | null
    tos_uri: string | null
  }) {
    const { data, error } = await supabase
      .from('mcp_oauth_clients')
      .insert(row)
      .select(
        'client_id, client_name, redirect_uris, grant_types, response_types, scope, client_uri, logo_uri, policy_uri, tos_uri, client_id_issued_at'
      )
      .single()
    if (error) throw error
    return data
  },

  async getMcpOAuthClient(clientId: string) {
    const { data, error } = await supabase
      .from('mcp_oauth_clients')
      .select(
        'client_id, client_name, redirect_uris, grant_types, response_types, scope, client_uri, logo_uri, policy_uri, tos_uri, client_id_issued_at'
      )
      .eq('client_id', clientId)
      .maybeSingle()
    if (error) throw error
    return data
  },
};
