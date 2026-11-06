import { useEffect, useMemo, useRef, useState } from 'react'
import './Wardrobe.css'
import { supabase } from '../../lib/supabase'
import { loadUserStyleData, saveUserStyleData } from '../../lib/user-style-data'
import { getWardrobePhotoUrl, uploadWardrobePhoto, deleteWardrobePhoto, wardrobePhotoPath } from '../../lib/wardrobe-photos'

type Category =
  | 'Shirts'
  | 'T-shirts'
  | 'Polo shirts'
  | 'Sweaters'
  | 'Trousers'
  | 'Outerwear'
  | 'Shoes'
  | 'Accessories'

interface ClothingItem {
  id: string
  name: string
  category: Category
  color: string
  extraColors?: string[]
  brand: string
  notes: string
  imageKey: string
  createdAt: number
}

interface Draft {
  name: string
  category: Category
  color: string
  extraColors: string[]
  brand: string
  notes: string
  image: File | null
}

const categories: Category[] = [
  'Shirts',
  'T-shirts',
  'Polo shirts',
  'Sweaters',
  'Trousers',
  'Outerwear',
  'Shoes',
  'Accessories',
]

const emptyDraft: Draft = {
  name: '',
  category: 'Shirts',
  color: '#D8D4C9',
  extraColors: [],
  brand: '',
  notes: '',
  image: null,
}


export default function Wardrobe() {
  const [items, setItems] = useState<ClothingItem[]>([])
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All pieces')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true
    let generation = 0
    let urls: string[] = []

    async function loadForUser(id: string | null) {
      const current = ++generation
      urls.forEach(URL.revokeObjectURL)
      urls = []
      setUserId(id)
      setItems([])
      setPhotos({})
      setError('')
      setLoading(Boolean(id))

      if (!id) {
        setLoading(false)
        return
      }

      try {
        const data = await loadUserStyleData()
        if (!active || current !== generation || data?.userId !== id) return

        const stored = data.wardrobe as ClothingItem[]
        setItems(stored)
        const loadedPhotos: Record<string, string> = {}

        for (const item of stored) {
          try {
            const url = await getWardrobePhotoUrl(id, item.id, item.imageKey)
            if (!active || current !== generation) return
            if (url) loadedPhotos[item.id] = url
          } catch {
            // Missing photos do not prevent the wardrobe from loading.
          }
        }

        if (active && current === generation) setPhotos(loadedPhotos)
      } catch {
        if (active && current === generation) {
          setError('Your wardrobe could not be loaded. Please refresh the page.')
        }
      } finally {
        if (active && current === generation) setLoading(false)
      }
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadForUser(session?.user.id ?? null)
    })

    void supabase.auth.getSession().then(({ data }) => {
      if (active) void loadForUser(data.session?.user.id ?? null)
    })

    return () => {
      active = false
      generation++
      data.subscription.unsubscribe()
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

  async function persist(next: ClothingItem[]) {
    if (!userId) throw new Error('Sign in before saving wardrobe items.')
    await saveUserStyleData({ wardrobe: next })
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
      extraColors: item.extraColors ?? [],
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
      if (!userId) throw new Error('Sign in before saving wardrobe items.')
      const imageKey = wardrobePhotoPath(userId, id)
      if (draft.image) {
        await uploadWardrobePhoto(userId, id, draft.image)
      }

      const updated: ClothingItem = {
        id,
        name: draft.name.trim(),
        category: draft.category,
        color: draft.color,
        extraColors: [...new Set(
          draft.extraColors.filter((color) =>
            /^#[0-9a-fA-F]{6}$/.test(color),
          ),
        )].slice(0, 5),
        brand: draft.brand.trim(),
        notes: draft.notes.trim(),
        imageKey,
        createdAt: existing?.createdAt ?? Date.now(),
      }

      const next = existing
        ? items.map((item) => (item.id === id ? updated : item))
        : [updated, ...items]

      await persist(next)

      if (draft.image) {


        const photoUrl = await getWardrobePhotoUrl(userId, id)
        if (photoUrl) {
          setPhotos((current) => ({ ...current, [id]: photoUrl }))
        }
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
      const next = items.filter((entry) => entry.id !== item.id)
      await persist(next)
      await deleteWardrobePhoto(userId, item.id)



      setPhotos((current) => {
        const nextPhotos = { ...current }
        delete nextPhotos[item.id]
        return nextPhotos
      })
    } catch {
      setError('Could not remove this piece. Please try again.')
    }
  }

  if (!userId && !loading) {
    return (
      <div className="page-content subpage wardrobe-page">
        <div className="wardrobe-intro">
          <h1>Your wardrobe</h1>
          <p>Sign in through your profile to view and manage your personal wardrobe.</p>
        </div>
      </div>
    )
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
          <strong>{new Set(
                        items.flatMap((item) => [
                          item.color.toLowerCase(),
                          ...(item.extraColors ?? []).map((color) =>
                            color.toLowerCase(),
                          ),
                        ]),
                      ).size.toString().padStart(2, '0')}</strong>
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
                <div className="wardrobe-live-colors" aria-label="Garment colours">
                {[item.color, ...(item.extraColors ?? [])].map((color, index) => (
                  <span
                    className="wardrobe-live-color"
                    key={`${item.id}-${index}`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
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

            <div className="wardrobe-field">
              <span>EXTRA COLOURS (OPTIONAL)</span>
              <p className="wardrobe-field-hint">
                Add up to five additional colours. Leave empty for a single-colour piece.
              </p>

              {draft.extraColors.map((color, index) => (
                <div className="wardrobe-extra-color-row" key={index}>
                  <input
                    type="color"
                    value={color}
                    aria-label={`Extra colour ${index + 1}`}
                    onChange={(event) => {
                      const next = [...draft.extraColors]
                      next[index] = event.target.value
                      setDraft({ ...draft, extraColors: next })
                    }}
                  />
                  <span>{color.toUpperCase()}</span>
                  <button
                    type="button"
                    className="remove-extra-color"
                    onClick={() => setDraft({
                      ...draft,
                      extraColors: draft.extraColors.filter((_, i) => i !== index),
                    })}
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="add-extra-color"
                disabled={draft.extraColors.length >= 5}
                onClick={() => setDraft({
                  ...draft,
                  extraColors: [...draft.extraColors, '#808080'],
                })}
              >
                + Add another colour
              </button>
            </div>

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

