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
  async createUser(userData: { email: string; name: string; password_hash: string }) {
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
      .select('id, email, name')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return data;
  },

  async getAllUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, created_at')
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
      .eq('user_id', userId);
    
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
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
    if (error) throw error;
    return data;
  },

  async getMonthlyCategoryStats(userId: string) {
    const { data, error } = await supabase
      .from('tasks')
      .select('category, completed')
      .eq('user_id', userId)
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
      .gte('created_at', today);
    
    if (error) throw error;
    return data;
  },

  async getProductivityAnalytics(userId: string, days: number = 7) {
    const { data, error } = await supabase
      .from('tasks')
      .select('created_at, category, type, completed')
      .eq('user_id', userId)
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
        .is('rolled_over_from_task_id', null) // Exclude rolled-over tasks
        .order('start_time', { ascending: true })
        .order('created_at', { ascending: true })

      if (regularError) throw regularError

      // Get all daily habits (original habits with repeat_type = 'daily')
      const { data: dailyHabits, error: habitsError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'habit')
        .eq('repeat_type', 'daily')
        .order('created_at', { ascending: true })

      if (habitsError) throw habitsError

      // Get existing habit instances for this date (habit instances have original_habit_id set)
      const { data: existingInstances, error: instancesError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('scheduled_date', date)
        .not('original_habit_id', 'is', null)

      if (instancesError) throw instancesError

      // Get original habits scheduled for this date (original_habit_id is null, scheduled_date = date)
      const { data: originalHabitsForDate, error: origHabitsError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'habit')
        .eq('repeat_type', 'daily')
        .eq('scheduled_date', date)
        .is('original_habit_id', null)

      if (origHabitsError) throw origHabitsError

      // Rollover rows (virtual incomplete + completed-undated for the day) live behind Rollover.
      const rolloverRows = await Rollover.listForDay(userId, date)

      // Build a set of habit ids that already have a real or original instance for this date
      const habitIdsWithInstance = new Set([
        ...existingInstances.map(inst => inst.original_habit_id),
        ...originalHabitsForDate.map(orig => orig.id)
      ])

      // Create virtual habit instances for habits that don't have a real or original instance for this date
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

      // Combine all tasks for the day (deduplicate by habit id: only one per habit per day)
      const allTasks = [
        ...regularTasks,
        ...existingInstances,
        ...originalHabitsForDate,
        ...virtualHabitInstances,
        ...rolloverRows,
      ]

      // Sort so that completed habit instances come first, then originals, then virtuals
      allTasks.sort((a, b) => {
        if (a.type === 'habit' && b.type === 'habit') {
          // Prefer completed habit instances
          const aIsCompletedInstance = a.completed && a.original_habit_id
          const bIsCompletedInstance = b.completed && b.original_habit_id
          if (aIsCompletedInstance && !bIsCompletedInstance) return -1
          if (!aIsCompletedInstance && bIsCompletedInstance) return 1
        }
        // Otherwise, keep original order
        return 0
      })

      // Deduplicate habits: only one per habit id per day, prefer completed instance
      const seenHabitIds = new Set()
      const dedupedTasks = allTasks.filter(task => {
        if (task.type !== 'habit') return true
        const habitId = task.original_habit_id || task.id
        if (seenHabitIds.has(habitId)) return false
        seenHabitIds.add(habitId)
        return true
      })

      // Sort by start time and creation time (issue #8 fix: use sortTasksForTimeline)
      return sortTasksForTimeline(dedupedTasks)
    } catch (error) {
      console.error('Error getting tasks with recurring habits:', error)
      throw error
    }
  },

  // Create a real habit instance for a specific date.
  // overrides: optional fields that replace the habit's defaults (drag case uses
  // completed:false + start_time or position; completion case uses the defaults).
  async createHabitInstance(
    originalHabitId: string,
    date: string,
    userId: string,
    overrides: {
      completed?: boolean
      start_time?: string | null
      position?: number | null
    } = {}
  ) {
    try {
      // Get the original habit
      const { data: originalHabit, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', originalHabitId)
        .single()

      if (fetchError) throw fetchError
      if (!originalHabit) throw new Error('Original habit not found')

      const isCompleted = overrides.completed ?? true
      // Create the habit instance
      const { data: habitInstance, error: createError } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          title: originalHabit.title,
          type: 'habit',
          category: originalHabit.category,
          // Allow drag to override start_time; fall back to the habit's own time
          start_time: 'start_time' in overrides ? overrides.start_time : originalHabit.start_time,
          duration: originalHabit.duration,
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
}; 