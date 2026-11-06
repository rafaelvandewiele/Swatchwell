import { useEffect, useState } from 'react';

import "./App.css";

import Wardrobe from "./features/wardrobe/Wardrobe";
import OutfitGenerator from "./features/outfits/OutfitGenerator";
import ColorProfile from "./features/color-profile/ColorProfile";
import AuthPanel from "./features/auth/AuthPanel";
import { supabase } from "./lib/supabase";
import { loadUserStyleData } from "./lib/user-style-data";
import { getWardrobePhotoUrl } from "./lib/wardrobe-photos";

import {
  getSeasonalPalette,
  getAllSeasonalPalettes,
} from "@swatchwell/color-engine";

import {
  readColorProfile,
  getSeasonLabel,
} from "./features/color-profile/color-profile";

type Page =
  | "Overview"
  | "My wardrobe"
  | "Color analysis"
  | "Outfits";

const navigation: { name: Page; icon: string }[] = [
  { name: "Overview", icon: "◫" },
  { name: "My wardrobe", icon: "▤" },
  { name: "Color analysis", icon: "◉" },
  { name: "Outfits", icon: "◇" },
];

type WardrobeCategory =
  | "Shirts"
  | "T-shirts"
  | "Polo shirts"
  | "Sweaters"
  | "Knitwear"
  | "Trousers"
  | "Outerwear"
  | "Shoes"
  | "Accessories";

interface DashboardWardrobeItem {
  id: string;
  name: string;
  category: WardrobeCategory;
  color: string;
  extraColors?: string[];
  imageKey?: string;
}

function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [activeNav, setActiveNav] = useState<Page>("Overview");
  const [recoveryMode, setRecoveryMode] = useState(
    () => new URLSearchParams(window.location.search).get("type") === "recovery",
  );
  const [showProfile, setShowProfile] = useState(
    () => new URLSearchParams(window.location.search).get("type") === "recovery",
  );

  useEffect(() => {
    if (!supabase) return;

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setShowProfile(true);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);


  const [dashboardItems, setDashboardItems] = useState<
    DashboardWardrobeItem[]
  >([]);

  const [dashboardPhotos, setDashboardPhotos] = useState<
    Record<string, string>
  >({});
  const [savedOutfitCount, setSavedOutfitCount] = useState(0);

  function navigate(name: Page) {
    setPage(name);
    setActiveNav(name);
    setShowProfile(false);
  }

  useEffect(() => {
    if (page !== "Overview") return;

    let active = true;
    let generation = 0;
    let objectUrls: string[] = [];

    async function loadDashboard(userId: string | null) {
      const current = ++generation;
      objectUrls.forEach(URL.revokeObjectURL);
      objectUrls = [];
      setDashboardItems([]);
      setDashboardPhotos({});
      setSavedOutfitCount(0);

      if (!userId) return;

      try {
        const data = await loadUserStyleData();
        if (!active || current !== generation || data?.userId !== userId) return;

        const items = data.wardrobe as DashboardWardrobeItem[];
        setDashboardItems(items);
        setSavedOutfitCount(data.savedOutfits.length);

        const photos: Record<string, string> = {};
        for (const item of items) {
          if (!item.imageKey) continue;
          try {
            const url = await getWardrobePhotoUrl(userId, item.id, item.imageKey);
            if (!active || current !== generation) return;
            if (url) photos[item.id] = url;
          } catch {
            // Ontbrekende foto's blokkeren het dashboard niet.
          }
        }
        if (active && current === generation) setDashboardPhotos(photos);
      } catch {
        if (active && current === generation) {
          setDashboardItems([]);
          setDashboardPhotos({});
          setSavedOutfitCount(0);
        }
      }
    }

    if (!supabase) {
      setDashboardItems([]);
      setDashboardPhotos({});
      setSavedOutfitCount(0);
      return () => {
        active = false;
        objectUrls.forEach(URL.revokeObjectURL);
      };
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void loadDashboard(session?.user.id ?? null);
      },
    );

    void supabase.auth.getSession().then(({ data }) => {
      if (active) void loadDashboard(data.session?.user.id ?? null);
    });

    return () => {
      active = false;
      generation++;
      authListener.subscription.unsubscribe();
      objectUrls.forEach(URL.revokeObjectURL);
    };
  }, [page]);

  const colorProfile = readColorProfile();
  const season = colorProfile?.analysis.season;

  const wardrobeCount = dashboardItems.length;

  const dashboardColors = season
    ? getSeasonalPalette(season).colors
    : getAllSeasonalPalettes()
        .flatMap((palette) => palette.colors)
        .filter((color) => color.category === "neutral")
        .filter(
          (color, index, all) =>
            all.findIndex((item) => item.hex === color.hex) === index,
        )
        .slice(0, 6);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            navigate("Overview");
          }}
        >
          <span className="brand-mark">s.</span>
          <span>
            swatchwell<span className="brand-period">.</span>
          </span>
        </a>

        <div className="sidebar-label">MENU</div>

        <nav className="navigation">
          {navigation.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${
                activeNav === item.name ? "active" : ""
              }`}
              onClick={() => navigate(item.name)}
              type="button"
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

            <button
              type="button"
              onClick={() => navigate("Color analysis")}
            >
              Discover your palette <span>↗</span>
            </button>
          </div>

          <button
            className="profile-button"
            onClick={() => setShowProfile((current) => !current)}
            type="button"
            aria-expanded={showProfile}
          >
            <span className="avatar">R</span>

            <span className="profile-info">
              <strong>Your profile</strong>
              <small>Personal account</small>
            </span>

            <span className="profile-menu">···</span>
          </button>

          {showProfile && (
        <AuthPanel
              initialMode={recoveryMode ? "update" : undefined}
              onClose={() => setShowProfile(false)}
            />
      )}

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
          <div className="breadcrumb">
            YOUR SPACE <span>/</span> {page.toUpperCase()}
          </div>

          <div className="topbar-right">
            <span className="date-label">
              YOUR PERSONAL STYLE SPACE
            </span>

            <button
              className="top-avatar"
              onClick={() => setShowProfile((current) => !current)}
              type="button"
              aria-label="Open profile settings"
            >
              R
            </button>
          </div>
        </header>

        {page === "Overview" && (
          <div className="page-content">
            <section className="welcome-section">
              <div>
                <div className="eyebrow">
                  YOUR PERSONAL STYLE EDITION
                </div>

                <h1>
                  Discover your
                  <br />
                  <em>personal style.</em>
                </h1>

                <p className="welcome-copy">
                  A considered wardrobe. Colours that complement.
                  <br className="desktop-break" />
                  A little more intention in everything you wear.
                </p>

                <button
                  className="primary-button"
                  onClick={() => navigate("Color analysis")}
                  type="button"
                >
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

                <span className="image-credit">
                  A MORE CONSIDERED WAY TO DRESS
                </span>
              </div>
            </section>

            <section className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">WARDROBE PIECES</span>

                <strong>
                  {String(wardrobeCount).padStart(2, "0")}
                </strong>

                <span className="stat-foot">
                  Your personal collection
                </span>
              </div>

              <div className="stat-card">
                <span className="stat-label">
                  YOUR COLOUR PROFILE
                </span>

                {season ? (
                  <>
                    <strong className="stat-pending">
                      {getSeasonLabel(season)}
                    </strong>

                    <span className="stat-foot">
                      Your seasonal colour profile
                    </span>
                  </>
                ) : (
                  <>
                    <strong className="stat-pending">
                      Not yet defined
                    </strong>

                    <span className="stat-foot">
                      Discover your personal palette
                    </span>
                  </>
                )}
              </div>

              <div className="stat-card">
                <span className="stat-label">SAVED OUTFITS</span>

                <strong>
                  {String(savedOutfitCount).padStart(2, "0")}
                </strong>

                <span className="stat-foot">
                  Looks worth keeping
                </span>
              </div>
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">
                    A GOOD PLACE TO START
                  </div>

                  <h2>Your style essentials</h2>
                </div>

                <button
                  className="text-link"
                  onClick={() => navigate("My wardrobe")}
                  type="button"
                >
                  View wardrobe <span>↗</span>
                </button>
              </div>

              <div className="wardrobe-grid">
                {dashboardItems.length > 0 ? (
                  dashboardItems.slice(0, 3).map((item, index) => (
                    <article
                      className="wardrobe-card"
                      key={item.id}
                    >
                      <div className={`item-visual item-${index + 1}`}>
                        {dashboardPhotos[item.id] ? (
                          <img
                            src={dashboardPhotos[item.id]}
                            alt={item.name}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                        ) : (
                          <div
                            className="garment-shape"
                            style={{
                              backgroundColor: item.color,
                            }}
                          />
                        )}

                        <span className="item-label">
                          {item.category.toUpperCase()}
                        </span>
                      </div>

                      <div className="item-details">
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.category}</span>
                        </div>

                        <div
                          aria-label="Garment colours"
                          style={{
                            display: "flex",
                            gap: "5px",
                            alignItems: "center",
                          }}
                        >
                          {[item.color, ...(item.extraColors ?? [])].map(
                            (color, index) => (
                              <span
                                key={`${item.id}-color-${index}`}
                                title={color}
                                style={{
                                  width: "11px",
                                  height: "11px",
                                  flexShrink: 0,
                                  borderRadius: "50%",
                                  backgroundColor: color,
                                  border: "1px solid rgba(0,0,0,0.12)",
                                }}
                              />
                            ),
                          )}
                        </div>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="wardrobe-empty">
                    <h2>Your collection starts here.</h2>

                    <p>
                      Add your first clothing piece to see it on
                      your dashboard.
                    </p>

                    <button
                      className="text-link"
                      onClick={() => navigate("My wardrobe")}
                      type="button"
                    >
                      Add your first piece <span>↗</span>
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="section-block palette-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">
                    {season
                      ? "YOUR PERSONAL COLOURS"
                      : "COLOUR INSPIRATION"}
                  </div>

                  <h2>
                    {season
                      ? `Your ${getSeasonLabel(season)} palette`
                      : "A timeless palette"}
                  </h2>
                </div>

                <button
                  className="text-link"
                  onClick={() => navigate("Color analysis")}
                  type="button"
                >
                  {season
                    ? "View full palette"
                    : "Discover your palette"}
                  <span> ↗</span>
                </button>
              </div>

              <div className="palette-strip">
                {dashboardColors.map((color) => (
                  <div className="palette-color" key={color.hex}>
                    <div
                      className="palette-swatch"
                      style={{ backgroundColor: color.hex }}
                    />

                    <span>{color.name}</span>
                    <small>{color.hex}</small>
                  </div>
                ))}
              </div>

              <p className="disclaimer">
                {season
                  ? "Your seasonal palette is a styling guide to inspire your wardrobe."
                  : "A selection of neutral colours from the Swatchwell seasonal palettes. Complete your colour analysis to discover your personal selection."}
              </p>
            </section>
          </div>
        )}

        {page === "My wardrobe" && <Wardrobe />}
        {page === "Outfits" && <OutfitGenerator />}
        {page === "Color analysis" && <ColorProfile />}

        <footer className="footer">
          <span>
            SWATCHWELL<span className="brand-period">.</span>
          </span>

          <span>PERSONAL STYLE, CONSIDERED.</span>
          <span>© 2026 SWATCHWELL</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
