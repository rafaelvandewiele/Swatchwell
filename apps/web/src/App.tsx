import { useState } from 'react'
import './App.css'
import Wardrobe from './features/wardrobe/Wardrobe'

type Page = 'Overview' | 'My wardrobe' | 'Color analysis' | 'Outfits'

const navigation: { name: Page; icon: string }[] = [
  { name: 'Overview', icon: '◫' },
  { name: 'My wardrobe', icon: '▤' },
  { name: 'Color analysis', icon: '◉' },
  { name: 'Outfits', icon: '◇' },
]

const colors = [
  { name: 'Warm ivory', hex: '#EAE1D2' },
  { name: 'Camel', hex: '#B58D65' },
  { name: 'Olive', hex: '#777B5B' },
  { name: 'Chocolate', hex: '#594236' },
  { name: 'Navy', hex: '#24364B' },
  { name: 'Soft white', hex: '#F5F3EE' },
]

const wardrobeItems = [
  { name: 'Classic Oxford Shirt', category: 'Shirts', color: '#D9D4C8', label: 'ESSENTIAL' },
  { name: 'Relaxed Wool Sweater', category: 'Knitwear', color: '#A99A83', label: 'FAVOURITE' },
  { name: 'Tailored Trousers', category: 'Trousers', color: '#333D48', label: 'ESSENTIAL' },
  { name: 'Everyday Overshirt', category: 'Outerwear', color: '#777B66', label: 'NEW' },
]

function App() {
  const [page, setPage] = useState<Page>('Overview')
  const [activeNav, setActiveNav] = useState('Overview')
  const [showProfile, setShowProfile] = useState(false)
  const [savedOutfits, setSavedOutfits] = useState<string[]>([])

  function navigate(name: Page) {
    setPage(name)
    setActiveNav(name)
  }

  function toggleSaved(name: string) {
    setSavedOutfits((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => navigate('Overview')}>
          <span className="brand-mark">s.</span>
          <span>swatchwell<span className="brand-period">.</span></span>
        </a>

        <div className="sidebar-label">MENU</div>
        <nav className="navigation">
          {navigation.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${activeNav === item.name ? 'active' : ''}`}
              onClick={() => navigate(item.name)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-eyebrow">YOUR STYLE JOURNEY</span>
            <p>Good style starts with knowing your colours.</p>
            <button onClick={() => navigate('Color analysis')}>
              Discover your palette <span>↗</span>
            </button>
          </div>
          <button className="profile-button" onClick={() => setShowProfile(!showProfile)}>
            <span className="avatar">R</span>
            <span className="profile-info">
              <strong>Your profile</strong>
              <small>Personal account</small>
            </span>
            <span className="profile-menu">···</span>
          </button>
          {showProfile && (
            <div className="profile-popover">
              <strong>Profile settings</strong>
              <p>Your personal style profile will be available here.</p>
            </div>
          )}
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">YOUR SPACE <span>/</span> {page.toUpperCase()}</div>
          <div className="topbar-right">
            <span className="date-label">YOUR PERSONAL STYLE SPACE</span>
            <button className="top-avatar" onClick={() => setShowProfile(!showProfile)}>R</button>
          </div>
        </header>

        {page === 'Overview' && (
          <div className="page-content">
            <section className="welcome-section">
              <div>
                <div className="eyebrow">TUESDAY, YOUR STYLE EDITION</div>
                <h1>Discover your<br /><em>personal style.</em></h1>
                <p className="welcome-copy">
                  A considered wardrobe. Colours that complement.<br className="desktop-break" />
                  A little more intention in everything you wear.
                </p>
                <button className="primary-button" onClick={() => navigate('Color analysis')}>
                  Explore your colours <span>↗</span>
                </button>
              </div>
              <div className="hero-art">
                <div className="hero-image">
                  <div className="hero-circle circle-one" />
                  <div className="hero-circle circle-two" />
                  <div className="hero-circle circle-three" />
                  <div className="hero-caption">
                    <span>THE ART OF</span>
                    <strong>PERSONAL STYLE</strong>
                  </div>
                  <div className="hero-number">№ 01 — 2026</div>
                </div>
                <span className="image-credit">A MORE CONSIDERED WAY TO DRESS</span>
              </div>
            </section>

            <section className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">WARDROBE PIECES</span>
                <strong>04</strong>
                <span className="stat-foot">Your collection starts here</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">YOUR COLOUR PROFILE</span>
                <strong className="stat-pending">Not yet defined</strong>
                <span className="stat-foot">Discover your ideal palette</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">SAVED OUTFITS</span>
                <strong>{String(savedOutfits.length).padStart(2, '0')}</strong>
                <span className="stat-foot">Looks worth keeping</span>
              </div>
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">A GOOD PLACE TO START</div>
                  <h2>Your style essentials</h2>
                </div>
                <button className="text-link" onClick={() => navigate('My wardrobe')}>
                  View wardrobe <span>↗</span>
                </button>
              </div>
              <div className="wardrobe-grid">
                {wardrobeItems.slice(0, 3).map((item, index) => (
                  <article className="wardrobe-card" key={item.name}>
                    <div className={`item-visual item-${index + 1}`}>
                      <div className="garment-shape" style={{ backgroundColor: item.color }} />
                      <span className="item-label">{item.label}</span>
                    </div>
                    <div className="item-details">
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.category}</span>
                      </div>
                      <span className="item-color" style={{ backgroundColor: item.color }} />
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="section-block palette-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">COLOUR INSPIRATION</div>
                  <h2>A timeless palette</h2>
                </div>
                <button className="text-link" onClick={() => navigate('Color analysis')}>
                  Discover your palette <span>↗</span>
                </button>
              </div>
              <div className="palette-strip">
                {colors.map((color) => (
                  <div className="palette-color" key={color.name}>
                    <div className="palette-swatch" style={{ backgroundColor: color.hex }} />
                    <span>{color.name}</span>
                    <small>{color.hex}</small>
                  </div>
                ))}
              </div>
              <p className="disclaimer">An editorial colour selection for inspiration — not your personal colour analysis.</p>
            </section>
          </div>
        )}

        {page === 'My wardrobe' && <Wardrobe />}

        {page === 'Color analysis' && (
          <div className="page-content subpage">
            <div className="eyebrow">UNDERSTAND YOUR COLOURS</div>
            <h1>The language<br />of <em>colour.</em></h1>
            <p className="welcome-copy">Discover the shades that bring harmony to your personal style.</p>
            <div className="analysis-card">
              <div className="analysis-copy">
                <div className="eyebrow">YOUR PERSONAL COLOUR PROFILE</div>
                <h2>Your palette<br />begins with you.</h2>
                <p>A personal colour analysis considers undertone, contrast and natural colouring. Your profile has not been created yet.</p>
                <button className="primary-button" onClick={() => alert('The guided colour analysis is coming soon.')}>Start colour analysis <span>↗</span></button>
              </div>
              <div className="analysis-art">
                {colors.map((color) => <div key={color.name} style={{ backgroundColor: color.hex }} />)}
              </div>
            </div>
            <div className="section-heading"><h2>Explore the colour spectrum</h2></div>
            <div className="palette-strip">
              {colors.map((color) => (
                <div className="palette-color" key={color.name}>
                  <div className="palette-swatch" style={{ backgroundColor: color.hex }} />
                  <span>{color.name}</span><small>{color.hex}</small>
                </div>
              ))}
            </div>
          </div>
        )}

        {page === 'Outfits' && (
          <div className="page-content subpage">
            <div className="eyebrow">THOUGHTFULLY PUT TOGETHER</div>
            <h1>Less guessing.<br /><em>More styling.</em></h1>
            <p className="welcome-copy">Build a wardrobe that works together, one outfit at a time.</p>
            <div className="outfit-feature">
              <div className="outfit-art">
                <div className="outfit-piece outfit-top" />
                <div className="outfit-piece outfit-bottom" />
                <div className="outfit-piece outfit-shoe" />
              </div>
              <div className="outfit-info">
                <div className="eyebrow">THE EDIT · 001</div>
                <h2>The everyday classic</h2>
                <p>A considered combination of neutral tones, timeless shapes and understated details.</p>
                <div className="outfit-tags"><span>TIMELESS</span><span>SMART CASUAL</span><span>NEUTRAL</span></div>
                <button className="primary-button" onClick={() => toggleSaved('The everyday classic')}>
                  {savedOutfits.includes('The everyday classic') ? '✓ Saved to favourites' : 'Save this outfit'}
                </button>
              </div>
            </div>
          </div>
        )}

        <footer className="footer">
          <span>SWATCHWELL<span className="brand-period">.</span></span>
          <span>PERSONAL STYLE, CONSIDERED.</span>
          <span>© 2026 SWATCHWELL</span>
        </footer>
      </main>
    </div>
  )
}

export default App
