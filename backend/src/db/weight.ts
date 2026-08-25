import { supabase } from './client'

// Weight-entry domain queries. Composed into the `db` facade in supabase-client.ts.
export const weightDb = {
  async getWeightEntryByDay(userId: string, date: string) {
    const { data, error } = await supabase
      .from('weight_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getRecentWeightEntries(userId: string, limit: number) {
    const { data, error } = await supabase
      .from('weight_entries')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data
  },

  async createWeightEntry(entryData: {
    id: string
    user_id: string
    date: string
    weight_kg: number
  }) {
    const { data, error } = await supabase
      .from('weight_entries')
      .upsert(
        { ...entryData, deleted_at: null, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date' },
      )
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getWeightEntryById(entryId: string) {
    const { data, error } = await supabase
      .from('weight_entries')
      .select('*')
      .eq('id', entryId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async updateWeightEntry(entryId: string, updates: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('weight_entries')
      .update(updates)
      .eq('id', entryId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteWeightEntry(entryId: string) {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('weight_entries')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', entryId)
    if (error) throw error
  },
}
