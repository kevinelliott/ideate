/**
 * Native notification utility using Tauri's notification plugin.
 * Provides the same interface as the toast store for easy migration.
 */

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'

let permissionChecked = false
let hasPermission = false

async function ensurePermission(): Promise<boolean> {
  if (permissionChecked) {
    return hasPermission
  }

  try {
    hasPermission = await isPermissionGranted()
    if (!hasPermission) {
      const permission = await requestPermission()
      hasPermission = permission === 'granted'
    }
    permissionChecked = true
    return hasPermission
  } catch (error) {
    console.error('Failed to check notification permission:', error)
    return false
  }
}

async function send(title: string, body?: string): Promise<void> {
  const granted = await ensurePermission()
  if (!granted) {
    console.warn('Notification permission not granted')
    return
  }

  try {
    sendNotification({
      title,
      body: body || undefined,
    })
  } catch (error) {
    console.error('Failed to send notification:', error)
  }
}

/**
 * Native notification functions matching the toast API.
 * All types map to native notifications (no visual distinction).
 */
export const notify = {
  success: (title: string, message?: string) => send(title, message),
  error: (title: string, message?: string) => send(title, message),
  warning: (title: string, message?: string) => send(title, message),
  info: (title: string, message?: string) => send(title, message),
}
