import { supabase } from './client'

// Weight-entry domain queries. Composed into the `db` facade in supabase-client.ts.
export const weightDb = {
  async getWeightEntryByDay(userId: string, date: string) {
    const { data, error } = await supabase
      .from('weight_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getRecentWeightEntries(userId: string, limit: number) {
    const { data, error } = await supabase
      .from('weight_entries')
      .select('*')
      .eq('user_id', userId)
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
      .insert(entryData)
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
    const { error } = await supabase
      .from('weight_entries')
      .delete()
      .eq('id', entryId)
    if (error) throw error
  },
}
