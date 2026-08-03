import { supabase } from './client'

// Persistence primitives for the deep Work service. Every user-owned query is
// owner-scoped even when the service has already checked Project ownership.
export const workDb = {
  async getTasksByProjectId(userId: string, projectId: string) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async getTasksByIds(userId: string, taskIds: string[], includeDeleted = false) {
    if (taskIds.length === 0) return []
    let query = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .in('id', taskIds)
    if (!includeDeleted) query = query.is('deleted_at', null)
    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async getOpenTaskCountsByUserId(userId: string) {
    const { data, error } = await supabase
      .from('tasks')
      .select('project_id')
      .eq('user_id', userId)
      .not('project_id', 'is', null)
      .eq('completed', false)
      .is('deferred_at', null)
      .is('deleted_at', null)
    if (error) throw error

    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      const projectId = (row as { project_id: string }).project_id
      counts.set(projectId, (counts.get(projectId) ?? 0) + 1)
    }
    return counts
  },

  async createFocusBlock(data: Record<string, unknown>) {
    const { data: row, error } = await supabase
      .from('focus_blocks')
      .insert(data)
      .select()
      .single()
    if (error) throw error
    return row
  },

  async getFocusBlockById(userId: string, focusBlockId: string) {
    const { data, error } = await supabase
      .from('focus_blocks')
      .select('*')
      .eq('id', focusBlockId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getFocusBlocksByProjectId(userId: string, projectId: string, limit = 50) {
    const { data, error } = await supabase
      .from('focus_blocks')
      .select('*')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('scheduled_date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  async getStandaloneFocusBlocks(userId: string, limit = 50) {
    const { data, error } = await supabase
      .from('focus_blocks')
      .select('*')
      .eq('user_id', userId)
      .is('project_id', null)
      .order('scheduled_date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  async updateFocusBlock(userId: string, focusBlockId: string, updates: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('focus_blocks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', focusBlockId)
      .eq('user_id', userId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getWorkSessionsByProjectId(userId: string, projectId: string, limit = 50) {
    const { data, error } = await supabase
      .from('work_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('occurred_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  async getStandaloneWorkSessions(userId: string, limit = 50) {
    const { data, error } = await supabase
      .from('work_sessions')
      .select('*')
      .eq('user_id', userId)
      .is('project_id', null)
      .order('occurred_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  async getWorkSessionById(userId: string, sessionId: string) {
    const { data, error } = await supabase
      .from('work_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async createWorkSession(sessionData: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('work_sessions')
      .insert(sessionData)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteWorkSession(userId: string, sessionId: string) {
    const { error } = await supabase
      .from('work_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId)
    if (error) throw error
  },

  async getWorkReviewsByIds(userId: string, reviewIds: string[]) {
    if (reviewIds.length === 0) return []
    const { data, error } = await supabase
      .from('work_reviews')
      .select('*')
      .eq('user_id', userId)
      .in('id', reviewIds)
    if (error) throw error
    return data ?? []
  },

  async completeWorkReview(input: {
    userId: string
    focusBlockId: string
    review: Record<string, unknown>
    updates: Record<string, unknown>
  }) {
    const { data, error } = await supabase.rpc('complete_work_review', {
      p_user_id: input.userId,
      p_focus_block_id: input.focusBlockId,
      p_review: input.review,
      p_updates: input.updates,
    })
    if (error) throw error
    return data as { focusBlockId: string; reviewId: string; sessionId: string }
  },

  async deleteWorkProjectSafely(userId: string, projectId: string) {
    const { data, error } = await supabase.rpc('delete_work_project_safely', {
      p_user_id: userId,
      p_project_id: projectId,
    })
    if (error) throw error
    return data
  },
}
