// ============================================================================
// Web push — enable / disable reminders on THIS device (post_deploy_27).
// ----------------------------------------------------------------------------
// The subscription (endpoint + keys) is stored in push_subscriptions; the
// push-notify edge function sends to it. On iPhone this only works when MaxxIt
// is added to the home screen (iOS 16.4+) and opened from there.
// ============================================================================
import { supabase } from './supabase'

// Public VAPID key (safe to ship; the private half lives in Supabase secrets).
export const VAPID_PUBLIC_KEY = 'BI6M3mjHz_dHS9WUMWWwXPsyo-MbvWvliN3HRTs3bct0vd-id3y8oXH9x_5Yl6uiBh8B02nAQE1VhOhAqDVY4UA'

const b64ToBytes = (b64) => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

export function pushSupport() {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: ios && !standalone ? 'ios-not-installed' : 'unsupported' }
  }
  return { ok: true, permission: Notification.permission }
}

export async function currentSubscription() {
  if (!pushSupport().ok) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

export async function enablePush(userId) {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notiser nekades i webbläsaren/telefonen.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) })
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
    user_agent: navigator.userAgent.slice(0, 200),
  }, { onConflict: 'endpoint' })
  if (error) throw error
  return sub
}

export async function disablePush(userId) {
  const sub = await currentSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', sub.endpoint)
    await sub.unsubscribe().catch(() => {})
  }
}

export async function sendTestPush() {
  const { data, error } = await supabase.functions.invoke('push-notify', { body: { test: true } })
  if (error) throw error
  return data?.sent ?? 0
}
