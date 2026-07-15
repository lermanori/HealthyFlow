import { supabase } from './client'

// Projects domain queries. Composed into the `db` facade in supabase-client.ts.
export const projectsDb = {
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
}
