import { supabase } from './client'

// Achievement-tracker domain queries (definitions + entries).
// Composed into the `db` facade in supabase-client.ts.
export const achievementsDb = {
  async getAchievementDefinitions(userId: string, includeArchived = false) {
    let query = supabase
      .from('achievement_definitions')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)

    if (!includeArchived) {
      query = query.is('archived_at', null)
    }

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async createAchievementDefinition(definitionData: {
    id: string
    user_id: string
    name: string
    category?: string | null
    metric_type: string
    unit: string
    better_direction: string
    target_value?: number | null
  }) {
    const { data, error } = await supabase
      .from('achievement_definitions')
      .insert(definitionData)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getAchievementDefinitionById(achievementId: string) {
    const { data, error } = await supabase
      .from('achievement_definitions')
      .select('*')
      .eq('id', achievementId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async updateAchievementDefinition(achievementId: string, updates: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('achievement_definitions')
      .update(updates)
      .eq('id', achievementId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteAchievementDefinition(achievementId: string) {
    const now = new Date().toISOString()
    const { error: entriesError } = await supabase
      .from('achievement_entries')
      .update({ deleted_at: now, updated_at: now })
      .eq('achievement_id', achievementId)
      .is('deleted_at', null)
    if (entriesError) throw entriesError

    const { error } = await supabase
      .from('achievement_definitions')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', achievementId)
    if (error) throw error
  },

  async getAchievementEntries(achievementId: string, userId: string, limit: number) {
    const { data, error } = await supabase
      .from('achievement_entries')
      .select('*')
      .eq('achievement_id', achievementId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data || []
  },

  async getAchievementEntryByDay(achievementId: string, userId: string, date: string) {
    const { data, error } = await supabase
      .from('achievement_entries')
      .select('*')
      .eq('achievement_id', achievementId)
      .eq('user_id', userId)
      .eq('date', date)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async createAchievementEntry(entryData: {
    id: string
    achievement_id: string
    user_id: string
    date: string
    value: number
    supporting_value?: number | null
    supporting_unit?: string | null
    notes?: string | null
  }) {
    const { data, error } = await supabase
      .from('achievement_entries')
      .upsert(
        { ...entryData, deleted_at: null, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,achievement_id,date' },
      )
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getAchievementEntryById(entryId: string) {
    const { data, error } = await supabase
      .from('achievement_entries')
      .select('*')
      .eq('id', entryId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async updateAchievementEntry(entryId: string, updates: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('achievement_entries')
      .update(updates)
      .eq('id', entryId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteAchievementEntry(entryId: string) {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('achievement_entries')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', entryId)
    if (error) throw error
  },
}
