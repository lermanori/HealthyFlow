import { supabase } from './client'

// Persistence primitives only. Workflow decisions and state transitions live
// in the deep talk-workflow service.
export const talkWorkflowsDb = {
  async getTalkWorkflowByConversation(userId: string, conversationId: string) {
    const { data, error } = await supabase
      .from('talk_workflows')
      .select('*')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  // Phase 6: a conversation keeps its workflow history and holds at most one
  // active workflow, enforced by a partial unique index.
  async getActiveTalkWorkflowByConversation(userId: string, conversationId: string) {
    const { data, error } = await supabase
      .from('talk_workflows')
      .select('*')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .eq('status', 'active')
      .maybeSingle()
    if (error) throw error
    return data
  },

  async listTalkWorkflowsByConversation(userId: string, conversationId: string) {
    const { data, error } = await supabase
      .from('talk_workflows')
      .select('*')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getTalkWorkflowById(userId: string, workflowId: string) {
    const { data, error } = await supabase
      .from('talk_workflows')
      .select('*')
      .eq('user_id', userId)
      .eq('id', workflowId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async createTalkWorkflow(row: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('talk_workflows')
      .insert(row)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateTalkWorkflowCas(
    userId: string,
    workflowId: string,
    expectedRevision: number,
    updates: Record<string, unknown>,
  ) {
    const { data, error } = await supabase
      .from('talk_workflows')
      .update({
        ...updates,
        revision: expectedRevision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId)
      .eq('user_id', userId)
      .eq('revision', expectedRevision)
      .select()
      .maybeSingle()
    if (error) throw error
    return data
  },

  async claimAiPendingAction(actionId: string, userId: string) {
    const { data, error } = await supabase.rpc('claim_ai_pending_action', {
      p_action_id: actionId,
      p_user_id: userId,
    })
    if (error) throw error
    return data?.[0] ?? null
  },

  async completeAiPendingAction(actionId: string, userId: string, result: unknown) {
    const { data, error } = await supabase.rpc('complete_ai_pending_action', {
      p_action_id: actionId,
      p_user_id: userId,
      p_result: result,
    })
    if (error) throw error
    return data?.[0] ?? null
  },

  async setAiPendingActionState(
    actionId: string,
    userId: string,
    status: 'presented' | 'declined' | 'stale' | 'failed',
    updates: Record<string, unknown> = {},
  ) {
    const terminal = status === 'declined'
      ? { canceled_at: new Date().toISOString() }
      : {}
    let query = supabase
      .from('ai_pending_actions')
      .update({
        ...updates,
        ...terminal,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', actionId)
      .eq('user_id', userId)
      .is('executed_at', null)
    if (status === 'declined') query = query.eq('status', 'presented')
    if (status === 'presented') query = query.eq('status', 'executing')
    if (status === 'stale') query = query.in('status', ['presented', 'executing'])
    const { data, error } = await query
      .select()
      .maybeSingle()
    if (error) throw error
    return data
  },
}
