import { useEffect, useMemo, useRef, useState } from 'react'
import './Wardrobe.css'

type Category =
  | 'Shirts'
  | 'T-shirts'
  | 'Knitwear'
  | 'Trousers'
  | 'Outerwear'
  | 'Shoes'
  | 'Accessories'

interface ClothingItem {
  id: string
  name: string
  category: Category
  color: string
  brand: string
  notes: string
  imageKey: string
  createdAt: number
}

interface Draft {
  name: string
  category: Category
  color: string
  brand: string
  notes: string
  image: File | null
}

const categories: Category[] = [
  'Shirts',
  'T-shirts',
  'Knitwear',
  'Trousers',
  'Outerwear',
  'Shoes',
  'Accessories',
]

const emptyDraft: Draft = {
  name: '',
  category: 'Shirts',
  color: '#D8D4C9',
  brand: '',
  notes: '',
  image: null,
}

const DB_NAME = 'swatchwell-wardrobe'
const STORE_NAME = 'photos'
const ITEMS_KEY = 'swatchwell-wardrobe-items'

function openDatabase(): Promise<IDBDatabase> {
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

async function savePhoto(key: string, file: Blob): Promise<void> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(file, key)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

async function getPhoto(key: string): Promise<Blob | undefined> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key)
    request.onsuccess = () => {
      db.close()
      resolve(request.result as Blob | undefined)
    }
    request.onerror = () => {
      db.close()
      reject(request.error)
    }
  })
}

async function deletePhoto(key: string): Promise<void> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(key)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

function readItems(): ClothingItem[] {
  try {
    return JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]') as ClothingItem[]
  } catch {
    return []
  }
}

function saveItems(items: ClothingItem[]) {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items))
}

export default function Wardrobe() {
  const [items, setItems] = useState<ClothingItem[]>([])
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All pieces')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    const urls: string[] = []

    async function load() {
      const stored = readItems()
      if (active) setItems(stored)

      const loadedPhotos: Record<string, string> = {}

      for (const item of stored) {
        try {
          const blob = await getPhoto(item.imageKey)
          if (blob) {
            const url = URL.createObjectURL(blob)
            urls.push(url)
            loadedPhotos[item.id] = url
          }
        } catch {
          // A missing photo does not prevent the wardrobe from loading.
        }
      }

      if (active) {
        setPhotos(loadedPhotos)
        setLoading(false)
      } else {
        urls.forEach(URL.revokeObjectURL)
      }
    }

    load().catch(() => {
      if (active) {
        setError('Your wardrobe could not be loaded. Please refresh the page.')
        setLoading(false)
      }
    })

    return () => {
      active = false
      urls.forEach(URL.revokeObjectURL)
    }
  }, [])

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase()

    return items.filter((item) => {
      const matchesCategory = filter === 'All pieces' || item.category === filter
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.brand.toLowerCase().includes(query) ||
        item.notes.toLowerCase().includes(query)

      return matchesCategory && matchesSearch
    })
  }, [items, search, filter])

  function persist(next: ClothingItem[]) {
    saveItems(next)
    setItems(next)
  }

  function openNew() {
    setEditing(null)
    setDraft(emptyDraft)
    setError('')
    setModalOpen(true)
  }

  function openEdit(item: ClothingItem) {
    setEditing(item.id)
    setDraft({
      name: item.name,
      category: item.category,
      color: item.color,
      brand: item.brand,
      notes: item.notes,
      image: null,
    })
    setError('')
    setModalOpen(true)
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('Please enter a name for this piece.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const existing = items.find((item) => item.id === editing)
      const id = existing?.id ?? crypto.randomUUID()
      const imageKey = existing?.imageKey ?? id

      if (draft.image) {
        await savePhoto(imageKey, draft.image)
      }

      const updated: ClothingItem = {
        id,
        name: draft.name.trim(),
        category: draft.category,
        color: draft.color,
        brand: draft.brand.trim(),
        notes: draft.notes.trim(),
        imageKey,
        createdAt: existing?.createdAt ?? Date.now(),
      }

      const next = existing
        ? items.map((item) => (item.id === id ? updated : item))
        : [updated, ...items]

      persist(next)

      if (draft.image) {
        const oldUrl = photos[id]
        if (oldUrl) URL.revokeObjectURL(oldUrl)

        setPhotos((current) => ({
          ...current,
          [id]: URL.createObjectURL(draft.image!),
        }))
      }

      setModalOpen(false)
      setDraft(emptyDraft)
    } catch {
      setError('Could not save this piece. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item: ClothingItem) {
    if (!window.confirm(`Remove "${item.name}" from your wardrobe?`)) return

    try {
      await deletePhoto(item.imageKey)
      const next = items.filter((entry) => entry.id !== item.id)
      persist(next)

      if (photos[item.id]) URL.revokeObjectURL(photos[item.id])

      setPhotos((current) => {
        const nextPhotos = { ...current }
        delete nextPhotos[item.id]
        return nextPhotos
      })
    } catch {
      setError('Could not remove this piece. Please try again.')
    }
  }

  return (
    <div className="page-content subpage wardrobe-page">
      <div className="wardrobe-intro">
        <div>
          <div className="eyebrow">YOUR PERSONAL COLLECTION</div>
          <h1>My <em>wardrobe.</em></h1>
          <p className="welcome-copy">
            Everything you own, thoughtfully brought together.
          </p>
        </div>

        <button className="primary-button wardrobe-add" onClick={openNew}>
          <span className="add-symbol">+</span> Add a piece
        </button>
      </div>

      <div className="wardrobe-summary">
        <div>
          <strong>{items.length.toString().padStart(2, '0')}</strong>
          <span>PIECES IN YOUR WARDROBE</span>
        </div>
        <div>
          <strong>{new Set(items.map((item) => item.category)).size.toString().padStart(2, '0')}</strong>
          <span>CATEGORIES</span>
        </div>
        <div>
          <strong>{new Set(items.map((item) => item.color.toLowerCase())).size.toString().padStart(2, '0')}</strong>
          <span>UNIQUE COLOURS</span>
        </div>
      </div>

      <div className="wardrobe-toolbar">
        <label className="wardrobe-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your wardrobe..."
            aria-label="Search wardrobe"
          />
        </label>

        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="Filter by category"
        >
          <option>All pieces</option>
          {categories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </div>

      {error && !modalOpen && <p className="wardrobe-error">{error}</p>}

      {loading ? (
        <div className="wardrobe-empty">Preparing your collection...</div>
      ) : visibleItems.length === 0 ? (
        <div className="wardrobe-empty">
          <div className="empty-symbol">◇</div>
          <h2>{items.length === 0 ? 'A wardrobe of your own.' : 'No pieces found.'}</h2>
          <p>
            {items.length === 0
              ? 'Start with a favourite piece. Add a photo and a few details to make it yours.'
              : 'Try another search or category, or add a new piece.'}
          </p>
          {items.length === 0 && (
            <button className="primary-button" onClick={openNew}>Add your first piece <span>↗</span></button>
          )}
        </div>
      ) : (
        <div className="wardrobe-live-grid">
          {visibleItems.map((item) => (
            <article className="wardrobe-live-card" key={item.id}>
              <div className="wardrobe-live-image">
                {photos[item.id] ? (
                  <img src={photos[item.id]} alt={item.name} />
                ) : (
                  <div className="wardrobe-no-photo">
                    <span>SWATCHWELL</span>
                    <div style={{ backgroundColor: item.color }} />
                    <small>NO IMAGE</small>
                  </div>
                )}
                <div className="wardrobe-card-actions">
                  <button onClick={() => openEdit(item)} aria-label={`Edit ${item.name}`}>Edit</button>
                  <button onClick={() => handleDelete(item)} aria-label={`Delete ${item.name}`}>×</button>
                </div>
              </div>
              <div className="wardrobe-live-details">
                <div>
                  <span className="wardrobe-category">{item.category}</span>
                  <h3>{item.name}</h3>
                  <p>{item.brand || 'No brand added'}</p>
                </div>
                <span
                  className="wardrobe-live-color"
                  style={{ backgroundColor: item.color }}
                  title={item.color}
                />
              </div>
              {item.notes && <p className="wardrobe-notes">{item.notes}</p>}
            </article>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="wardrobe-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setModalOpen(false)
        }}>
          <form className="wardrobe-modal" onSubmit={handleSave}>
            <div className="wardrobe-modal-header">
              <div>
                <div className="eyebrow">{editing ? 'REFINE YOUR COLLECTION' : 'ADD TO YOUR COLLECTION'}</div>
                <h2>{editing ? 'Edit your piece.' : 'A new favourite.'}</h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setModalOpen(false)}>×</button>
            </div>

            <label className="photo-upload">
              {draft.image ? (
                <span>{draft.image.name}</span>
              ) : (
                <>
                  <span className="upload-icon">↑</span>
                  <strong>{editing ? 'Choose a new photo' : 'Add a photograph'}</strong>
                  <small>JPG, PNG or WEBP · Up to 10 MB</small>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return

                  if (file.size > 10 * 1024 * 1024) {
                    setError('Please choose an image smaller than 10 MB.')
                    event.target.value = ''
                    return
                  }

                  setError('')
                  setDraft((current) => ({ ...current, image: file }))
                }}
              />
            </label>

            <label className="wardrobe-field">
              <span>NAME *</span>
              <input
                required
                maxLength={70}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="e.g. Classic Oxford Shirt"
              />
            </label>

            <div className="wardrobe-form-row">
              <label className="wardrobe-field">
                <span>CATEGORY</span>
                <select
                  value={draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value as Category })}
                >
                  {categories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label className="wardrobe-field">
                <span>BRAND</span>
                <input
                  maxLength={50}
                  value={draft.brand}
                  onChange={(event) => setDraft({ ...draft, brand: event.target.value })}
                  placeholder="Brand name"
                />
              </label>
            </div>

            <label className="wardrobe-field">
              <span>COLOUR</span>
              <div className="wardrobe-color-input">
                <input
                  type="color"
                  value={draft.color}
                  onChange={(event) => setDraft({ ...draft, color: event.target.value })}
                />
                <span>{draft.color.toUpperCase()}</span>
              </div>
            </label>

            <label className="wardrobe-field">
              <span>NOTES</span>
              <textarea
                rows={3}
                maxLength={300}
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                placeholder="Fit, material, occasion or anything worth remembering..."
              />
            </label>

            {error && <p className="wardrobe-error">{error}</p>}

            <div className="wardrobe-modal-footer">
              <button type="button" className="cancel-button" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Save changes' : 'Add to wardrobe'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

