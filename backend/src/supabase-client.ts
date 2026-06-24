import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { Rollover } from './rollover';
import { sortTasksForTimeline } from './utils/sortTasksForTimeline';

// Load .env from parent directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Enhanced functions to replace SQLite operations
export const db = {
  // Users
  async createUser(userData: { email: string; name: string; password_hash: string; role?: 'admin' | 'user' }) {
    const { data, error } = await supabase
      .from('users')
      .insert(userData)
      .select();
    
    if (error) throw error;
    if (!data || data.length === 0) return null;
    return data[0];
  },

  async getUserByEmail(email: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getUserById(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return data;
  },

  async getAllUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, created_at')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async deleteUser(userId: string) {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);
    
    if (error) throw error;
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
      .select('*')
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
      console.log('getTasksByUserId - Returned tasks:', data.map(t => ({ id: t.id, title: t.title, scheduled_date: t.scheduled_date, rolled_over_from_task_id: t.rolled_over_from_task_id })));
    }
    return data;
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
    await Promise.all(
      pairs.map(({ id, position }) =>
        supabase
          .from('tasks')
          .update({ position })
          .eq('id', id)
          .eq('user_id', userId)
      )
    );
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
      .select('title, category, completed, completed_at')
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

  // Enhanced function to get tasks with recurring habits and virtual rollover tasks for a specific date
  async getTasksWithRecurringHabits(userId: string, date: string) {
    try {
      // Get regular tasks for the specific date (excluding daily habits and rolled-over tasks)
      const { data: regularTasks, error: regularError } = await supabase
        .from('tasks')
        .select('*')
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
        .select('*')
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
        .select('*')
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

      // Carry-forward rows (real tasks with scheduled_date NULL or < date, plus those
      // completed today) live behind Rollover. Disjoint from regularTasks (= date), so
      // no task appears twice; task rows are not run through the habit dedup below.
      const rolloverRows = await Rollover.listForDay(userId, date)

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
        ...rolloverRows,
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
        // A virtual instance has the synthetic id `${habitId}-${date}`; a real
        // materialized row has a plain UUID. Prefer the real row.
        const taskIsVirtual = task.id === `${habitId}-${date}`
        const currentIsVirtual = current.id === `${habitId}-${date}`
        if (taskIsVirtual !== currentIsVirtual) {
          if (currentIsVirtual) habitWinners.set(habitId, task) // real beats virtual
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

  // Projects
  async getProjectsByUserId(userId: string) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async createProject(projectData: {
    id: string
    user_id: string
    name: string
    description?: string | null
    color: string
    is_archived: boolean
  }) {
    const { data, error } = await supabase
      .from('projects')
      .insert(projectData)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getProjectById(projectId: string) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async updateProject(projectId: string, updates: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteProject(projectId: string) {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
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

  // ponytail: test-mode only — deletes all task rows for the given user
  async resetTestUser(userId: string) {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('user_id', userId)
    if (error) throw error
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
      .upsert({ user_id: userId, balance, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select('balance')
      .single()
    if (error) throw error
    return data.balance
  },

  async getUsersWithCreditBalances() {
    const users = await this.getAllUsers()
    const { data: credits, error } = await supabase
      .from('user_credits')
      .select('user_id, balance, updated_at')
    if (error) throw error

    const balances = new Map((credits ?? []).map(row => [row.user_id, row]))
    return users.map(user => {
      const credit = balances.get(user.id)
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role ?? 'user',
        created_at: user.created_at,
        balance: credit?.balance ?? 0,
        balance_updated_at: credit?.updated_at ?? null,
      }
    })
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
};
