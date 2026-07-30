import { supabase } from './client'

export interface NativePushDeviceRow {
  device_token: string
  platform: 'ios'
  app_id: string
}

// Web and native push destination storage. Composed into the `db` facade in
// supabase-client.ts.
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

  async addNativePushDevice(row: {
    user_id: string
    device_token: string
    platform: 'ios'
    app_id: string
  }) {
    const { error } = await supabase
      .from('native_push_devices')
      .upsert({ ...row, last_seen_at: new Date().toISOString() }, {
        onConflict: 'device_token,app_id',
      })
    if (error) throw error
  },

  async listNativePushDevices(userId: string): Promise<NativePushDeviceRow[]> {
    const { data, error } = await supabase
      .from('native_push_devices')
      .select('device_token, platform, app_id')
      .eq('user_id', userId)
    if (error) throw error
    return (data ?? []) as NativePushDeviceRow[]
  },

  async deleteNativePushDevice(userId: string, deviceToken: string, appId: string) {
    const { error } = await supabase
      .from('native_push_devices')
      .delete()
      .eq('user_id', userId)
      .eq('device_token', deviceToken)
      .eq('app_id', appId)
    if (error) throw error
  },
}
