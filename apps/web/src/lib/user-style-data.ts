import { supabase } from './supabase'
import type { StoredColorProfile } from '../features/color-profile/color-profile'

export interface UserStyleData {
  userId: string
  wardrobe: unknown[]
  savedOutfits: unknown[]
  colorProfile: StoredColorProfile | null
}

const LEGACY_WARDROBE_KEY = 'swatchwell-wardrobe-items'
const LEGACY_OUTFITS_KEY = 'swatchwell-saved-outfits'
const MIGRATION_KEY = 'swatchwell-style-data-migrated-v1'
const DB_NAME = 'swatchwell-wardrobe'
const STORE_NAME = 'photos'

function readLegacyArray(key: string): unknown[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function openPhotoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function copyLegacyPhotos(
  userId: string,
  wardrobe: unknown[],
): Promise<void> {
  const db = await openPhotoDatabase()

  try {
    if (!db.objectStoreNames.contains(STORE_NAME)) return

    for (const entry of wardrobe) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        !('imageKey' in entry) ||
        typeof entry.imageKey !== 'string'
      ) continue

      const item = entry as Record<string, unknown>
      const oldKey = item.imageKey
      if (typeof oldKey !== 'string') continue
      if (oldKey.startsWith(`${userId}:`)) continue
      const newKey = `${userId}:${oldKey}`

      const photo = await new Promise<Blob | undefined>((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly')
          .objectStore(STORE_NAME)
          .get(oldKey)

        request.onsuccess = () => resolve(
          request.result instanceof Blob ? request.result : undefined,
        )
        request.onerror = () => reject(request.error)
      })

      if (photo) {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, 'readwrite')
          transaction.objectStore(STORE_NAME).put(photo, newKey)
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
        })
      }

    }
  } finally {
    db.close()
  }
}

export async function getCurrentStyleUserId(): Promise<string | null> {
  if (!supabase) return null

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null

  return data.user.id
}

export async function loadUserStyleData(): Promise<UserStyleData | null> {
  if (!supabase) return null

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return null

  const userId = authData.user.id

  const { data, error } = await supabase
    .from('user_style_data')
    .select('wardrobe, saved_outfits, color_profile')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error

  if (data) {
    return {
      userId,
      wardrobe: Array.isArray(data.wardrobe) ? data.wardrobe : [],
      savedOutfits: Array.isArray(data.saved_outfits)
        ? data.saved_outfits
        : [],
      colorProfile: data.color_profile && typeof data.color_profile === 'object'
        ? data.color_profile as StoredColorProfile
        : null,
    }
  }

  let wardrobe = readLegacyArray(LEGACY_WARDROBE_KEY)
  const savedOutfits = readLegacyArray(LEGACY_OUTFITS_KEY)

  if (localStorage.getItem(MIGRATION_KEY) === 'done') {
    wardrobe = []
  } else {
    await copyLegacyPhotos(userId, wardrobe)
    wardrobe = wardrobe.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry
      const item = entry as Record<string, unknown>
      return typeof item.imageKey === 'string'
        ? {
            ...item,
            imageKey: item.imageKey.startsWith(`${userId}:`)
              ? item.imageKey
              : `${userId}:${item.imageKey}`,
          }
        : item
    })
  }

  const { error: saveError } = await supabase
    .from('user_style_data')
    .upsert({
      user_id: userId,
      wardrobe,
      saved_outfits: savedOutfits,
      updated_at: new Date().toISOString(),
    })

  if (saveError) throw saveError

  localStorage.setItem(MIGRATION_KEY, 'done')
  localStorage.removeItem(LEGACY_WARDROBE_KEY)
  localStorage.removeItem(LEGACY_OUTFITS_KEY)

  return { userId, wardrobe, savedOutfits, colorProfile: null }
}

export async function saveUserStyleData(
  patch: Partial<Pick<UserStyleData, 'wardrobe' | 'savedOutfits' | 'colorProfile'>>,
): Promise<void> {
  if (!supabase) throw new Error('Account storage is not configured.')

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    throw new Error('Sign in to save your personal style data.')
  }

  const userId = authData.user.id
  const updatedAt = new Date().toISOString()

  const values: {
    wardrobe?: unknown[]
    saved_outfits?: unknown[]
    color_profile?: StoredColorProfile | null
    updated_at: string
  } = { updated_at: updatedAt }

  if (patch.wardrobe !== undefined) {
    values.wardrobe = patch.wardrobe
  }

  if (patch.savedOutfits !== undefined) {
    values.saved_outfits = patch.savedOutfits
  }

  if (patch.colorProfile !== undefined) {
    values.color_profile = patch.colorProfile
  }

  if (
    values.wardrobe === undefined &&
    values.saved_outfits === undefined &&
    values.color_profile === undefined
  ) {
    return
  }

  // Update only the requested columns. This prevents concurrent changes
  // to wardrobe and saved outfits from overwriting one another.
  const { data, error: updateError } = await supabase
    .from('user_style_data')
    .update(values)
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle()

  if (updateError) throw updateError
  if (data) return

  // First save for an account: create the row with safe defaults.
  const { error: insertError } = await supabase
    .from('user_style_data')
    .insert({
      user_id: userId,
      wardrobe: patch.wardrobe ?? [],
      saved_outfits: patch.savedOutfits ?? [],
      color_profile: patch.colorProfile ?? null,
      updated_at: updatedAt,
    })

  if (!insertError) return

  // Another device may have created the row simultaneously.
  // Retry as a column-specific update rather than overwriting the row.
  if (insertError.code !== '23505') throw insertError

  const { error: retryError } = await supabase
    .from('user_style_data')
    .update(values)
    .eq('user_id', userId)

  if (retryError) throw retryError
}
