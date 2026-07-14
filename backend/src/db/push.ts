import { supabase } from './client'

// Web-push subscription storage. Composed into the `db` facade in supabase-client.ts.
export const pushDb = {
  async addPushSubscription(row: { user_id: string; endpoint: string; p256dh: string; auth: string }) {
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({ ...row, last_seen_at: new Date().toISOString() }, { onConflict: 'endpoint' })
    if (error) throw error
  },

  async listPushSubscriptions(userId: string): Promise<Array<{ endpoint: string; p256dh: string; auth: string }>> {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)
    if (error) throw error
    return (data ?? []) as Array<{ endpoint: string; p256dh: string; auth: string }>
  },

  async deletePushSubscriptionByEndpoint(endpoint: string) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
    if (error) throw error
  },
}
