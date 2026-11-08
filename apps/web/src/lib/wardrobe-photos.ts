import { supabase } from './supabase'

const BUCKET = 'wardrobe-photos'
const DB_NAME = 'swatchwell-wardrobe'
const STORE_NAME = 'photos'

function openPhotoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readLegacyPhoto(keys: string[]): Promise<Blob | null> {
  const db = await openPhotoDatabase()

  try {
    if (!db.objectStoreNames.contains(STORE_NAME)) return null

    for (const key of [...new Set(keys.filter(Boolean))]) {
      const photo = await new Promise<Blob | null>((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly')
          .objectStore(STORE_NAME)
          .get(key)

        request.onsuccess = () => {
          resolve(request.result instanceof Blob ? request.result : null)
        }
        request.onerror = () => reject(request.error)
      })

      if (photo) return photo
    }

    return null
  } finally {
    db.close()
  }
}

export function wardrobePhotoPath(userId: string, itemId: string): string {
  return `${userId}/${itemId}`
}

export async function uploadWardrobePhoto(
  userId: string,
  itemId: string,
  photo: Blob,
): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const path = wardrobePhotoPath(userId, itemId)

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo, {
      upsert: true,
      contentType: photo.type || 'image/jpeg',
    })

  if (error) throw error

  return path
}

export async function getWardrobePhotoUrl(
  userId: string,
  itemId: string,
  legacyKey?: string,
): Promise<string | null> {
  if (!supabase) return null

  const path = wardrobePhotoPath(userId, itemId)

  const { data: existing } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600)

  if (existing?.signedUrl) return existing.signedUrl

  // Migrate a legacy browser photo only when no cloud photo exists.
  // Only read legacy photos explicitly scoped to this account.
  const scopedLegacyKey = legacyKey?.startsWith(`${userId}:`)
    ? legacyKey
    : ''

  const legacyPhoto = await readLegacyPhoto([
    scopedLegacyKey,
    `${userId}:${itemId}`,
  ])

  if (!legacyPhoto) return null

  await uploadWardrobePhoto(userId, itemId, legacyPhoto)

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600)

  if (error) throw error

  return data?.signedUrl ?? null
}

export async function deleteWardrobePhoto(
  userId: string,
  itemId: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([wardrobePhotoPath(userId, itemId)])

  if (error) throw error
}
