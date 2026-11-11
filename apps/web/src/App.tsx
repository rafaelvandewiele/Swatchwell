import { useEffect, useState } from 'react';

import "./App.css";

import Wardrobe from "./features/wardrobe/Wardrobe";
import OutfitGenerator from "./features/outfits/OutfitGenerator";
import ColorCombinations from "./features/color-combinations/ColorCombinations";
import ColorProfile from "./features/color-profile/ColorProfile";
import AuthPanel from "./features/auth/AuthPanel";
import SettingsPage from "./features/settings/SettingsPage";
import LegalPage from "./features/legal/LegalPage";
import { supabase } from "./lib/supabase";
import { loadUserStyleData } from "./lib/user-style-data";
import type { StoredColorProfile } from "./features/color-profile/color-profile";
import { getWardrobePhotoUrl } from "./lib/wardrobe-photos";

import {
  getSubSeasonalPalette,
  getAllSeasonalPalettes,
} from "@swatchwell/color-engine";

import { getSeasonLabel } from "./features/color-profile/color-profile";
import { useI18n, translateCategory, type Language } from "./lib/i18n";

type Page =
  | "Overview"
  | "My wardrobe"
  | "Color analysis"
  | "Outfits"
  | "Colour combinations"
  | "Settings"
  | "Privacy policy"
  | "Terms and conditions"
  | "Cookie policy"
  | "Confirm account deletion";

const navigation: { name: Page; icon: string }[] = [
  { name: "Overview", icon: "◫" },
  { name: "My wardrobe", icon: "▤" },
  { name: "Color analysis", icon: "◉" },
  { name: "Outfits", icon: "◇" },
  { name: "Colour combinations", icon: "◈" },
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
  const { t, language, setLanguage } = useI18n();
  const pageFromPath = (): Page => {
    const routes: Record<string, Page> = { "/":"Overview", "/wardrobe":"My wardrobe", "/color-analysis":"Color analysis", "/outfits":"Outfits", "/colour-combinations":"Colour combinations", "/settings":"Settings", "/privacy":"Privacy policy", "/terms":"Terms and conditions", "/cookies":"Cookie policy", "/account-deletion/confirm":"Confirm account deletion" };
    return routes[window.location.pathname.replace(/\/$/, "") || "/"] ?? "Overview";
  };
  const [page, setPage] = useState<Page>(pageFromPath);
  const [activeNav, setActiveNav] = useState<Page>(pageFromPath());
  const [recoveryMode, setRecoveryMode] = useState(
    () => new URLSearchParams(window.location.search).get("type") === "recovery",
  );
  const [showProfile, setShowProfile] = useState(
    () => new URLSearchParams(window.location.search).get("type") === "recovery",
  );
  const [profileInitial, setProfileInitial] = useState("S");

  const [authReady, setAuthReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    let active = true;

    const updateProfileInitial = (
      session: import('@supabase/supabase-js').Session | null,
    ) => {
      const firstName = session?.user.user_metadata?.first_name;
      const email = session?.user.email;
      const initial =
        typeof firstName === 'string' && firstName.trim()
          ? firstName.trim().charAt(0)
          : typeof email === 'string' && email.trim()
            ? email.trim().charAt(0)
            : 'S';

      setProfileInitial(initial.toUpperCase());
    };

    const handleSession = (
      session: import('@supabase/supabase-js').Session | null,
      event?: string,
    ) => {
      if (!active) return;

      if (session && !session.user.email_confirmed_at) {
        setProfileInitial('S');
        setRecoveryMode(false);
        setShowProfile(false);
        setAuthReady(false);

        window.setTimeout(() => {
          if (active) {
            void supabase.auth.signOut({ scope: 'local' });
          }
        }, 0);

        return;
      }

      updateProfileInitial(session);
      setAuthReady(true);

      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setShowProfile(true);
      }
    };

    const { data } = supabase.auth.onAuthStateChange(
      (event, session) => handleSession(session, event),
    );

    void supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (!active) return;

      if (error) {
        console.error('Unable to restore authentication session:', error);
        setAuthReady(true);
        return;
      }

      handleSession(sessionData.session, 'INITIAL_SESSION');
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);


  const [dashboardItems, setDashboardItems] = useState<
    DashboardWardrobeItem[]
  >([]);

  const [dashboardPhotos, setDashboardPhotos] = useState<
    Record<string, string>
  >({});
  const [savedOutfitCount, setSavedOutfitCount] = useState(0);
  const [colorProfile, setColorProfile] = useState<StoredColorProfile | null>(null);

  function navigate(name: Page) {
    const paths: Record<Page, string> = { "Overview":"/", "My wardrobe":"/wardrobe", "Color analysis":"/color-analysis", "Outfits":"/outfits", "Colour combinations":"/colour-combinations", "Settings":"/settings", "Privacy policy":"/privacy", "Terms and conditions":"/terms", "Cookie policy":"/cookies", "Confirm account deletion":"/account-deletion/confirm" };
    window.history.pushState({}, "", paths[name]);
    setPage(name);
    setActiveNav(["Overview", "My wardrobe", "Color analysis", "Outfits", "Colour combinations"].includes(name) ? name : "Overview");
    setShowProfile(false);
  }

  useEffect(() => {
    const onPopState = () => { const next = pageFromPath(); setPage(next); setActiveNav(["Overview", "My wardrobe", "Color analysis", "Outfits", "Colour combinations"].includes(next) ? next : "Overview"); setShowProfile(false); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  async function changeLanguage(next: Language) {
    if (supabase) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: profile } = await supabase.from("profiles").select("first_name,last_name").eq("id", userData.user.id).maybeSingle();
        const { error } = await supabase.rpc("update_my_profile", { p_first_name: profile?.first_name ?? "", p_last_name: profile?.last_name ?? "", p_language: next });
        if (error) return;
      }
    }
    setLanguage(next);
  }

  useEffect(() => {
    if (page !== "Overview" || !authReady) return;

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
      setColorProfile(null);

      if (!userId) return;

      try {
        const data = await loadUserStyleData();
        if (!active || current !== generation || data?.userId !== userId) return;

        const items = data.wardrobe as DashboardWardrobeItem[];
        setDashboardItems(items);
        setSavedOutfitCount(data.savedOutfits.length);
        setColorProfile(data.colorProfile);

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
          setColorProfile(null);
        }
      }
    }

    if (!supabase) {
      setDashboardItems([]);
      setDashboardPhotos({});
      setSavedOutfitCount(0);
      setColorProfile(null);
      return () => {
        active = false;
        objectUrls.forEach(URL.revokeObjectURL);
      };
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void loadDashboard(session?.user.email_confirmed_at ? session.user.id : null);
      },
    );

    void supabase.auth.getSession().then(({ data }) => {
      if (active) void loadDashboard(data.session?.user.email_confirmed_at ? data.session.user.id : null);
    });

    return () => {
      active = false;
      generation++;
      authListener.subscription.unsubscribe();
      objectUrls.forEach(URL.revokeObjectURL);
    };
  }, [page, authReady]);

  const season = colorProfile?.analysis.season;

  const wardrobeCount = dashboardItems.length;

  const dashboardColors = colorProfile
    ? getSubSeasonalPalette(colorProfile.analysis.subSeason).colors
    : getAllSeasonalPalettes()
        .flatMap((palette) => palette.colors)
        .filter((color) => color.category === "neutral")
        .filter(
          (color, index, all) =>
            all.findIndex((item) => item.hex === color.hex) === index,
        )
        .slice(0, 6);

  if (!authReady) {
    return (
      <div className="app-shell">
        <div className="loading-state">{t("Checking your session...")}</div>
      </div>
    );
  }

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
          <img
            className="brand-logo"
            src="/logo.png"
            alt="Swatchwell"
          />
        </a>

        <div className="sidebar-label">{t("MENU")}</div>

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
              {t(item.name)}
            </button>
          ))}
        </nav>

        <button className="settings-shortcut" type="button" aria-label={t("Settings")} title={t("Settings")} onClick={() => navigate("Settings")}>⚙</button>

        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-eyebrow">{t("YOUR STYLE JOURNEY")}</span>
            <p>{t("Good style starts with knowing your colours.")}</p>

            <button
              type="button"
              onClick={() => navigate("Color analysis")}
            >
              {t("Discover your palette")} <span>↗</span>
            </button>
          </div>

          <button
            className="profile-button"
            onClick={() => setShowProfile((current) => !current)}
            type="button"
            aria-expanded={showProfile}
          >
            <span className="avatar">{profileInitial}</span>

            <span className="profile-info">
              <strong>{t("Your profile")}</strong>
              <small>{t("Personal account")}</small>
            </span>

            <span className="profile-menu">···</span>
          </button>



        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            {t("YOUR SPACE")} <span>/</span> {t(page).toUpperCase()}
          </div>

          <div className="topbar-right">
            <label className="top-language" aria-label={t("Preferred language")}>
              <span aria-hidden="true">文</span>
              <select value={language} onChange={(event) => void changeLanguage(event.target.value as Language)}>
                <option value="nl">NL</option><option value="en">EN</option><option value="fr">FR</option><option value="de">DE</option>
              </select>
            </label>
            <button className="top-avatar" onClick={() => setShowProfile((current) => !current)} type="button" aria-label={t("Open profile")} aria-expanded={showProfile}>
              {profileInitial}
            </button>
          </div>
        </header>

        {page === "Overview" && (
          <div className="page-content">
            <section className="welcome-section">
              <div>
                <div className="eyebrow">
                  {t("YOUR PERSONAL STYLE EDITION")}
                </div>

                <h1>
                  {t("Discover your")}
                  <br />
                  <em>{t("personal style.")}</em>
                </h1>

                <p className="welcome-copy">
                  {t("A considered wardrobe. Colours that complement.")}
                  <br className="desktop-break" />
                  {t("A little more intention in everything you wear.")}
                </p>

                <button
                  className="primary-button"
                  onClick={() => navigate("Color analysis")}
                  type="button"
                >
                  {t("Explore your colours")} <span>↗</span>
                </button>
              </div>

              <div className="hero-art">
                <div className="hero-image">
                  <div className="hero-circle circle-one" />
                  <div className="hero-circle circle-two" />
                  <div className="hero-circle circle-three" />

                  <div className="hero-caption">
                    <span>{t("THE ART OF")}</span>
                    <strong>{t("PERSONAL STYLE")}</strong>
                  </div>

                  <div className="hero-number">№ 01 — 2026</div>
                </div>

                <span className="image-credit">
                  {t("A MORE CONSIDERED WAY TO DRESS")}
                </span>
              </div>
            </section>

            <section className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">{t("WARDROBE PIECES")}</span>

                <strong>
                  {String(wardrobeCount).padStart(2, "0")}
                </strong>

                <span className="stat-foot">
                  {t("Your personal collection")}
                </span>
              </div>

              <div className="stat-card">
                <span className="stat-label">
                  {t("YOUR COLOUR PROFILE")}
                </span>

                {season ? (
                  <>
                    <strong className="stat-pending">
                      {t(getSeasonLabel(season))}
                    </strong>

                    <span className="stat-foot">
                      {t("Your seasonal colour profile")}
                    </span>
                  </>
                ) : (
                  <>
                    <strong className="stat-pending">
                      {t("Not yet defined")}
                    </strong>

                    <span className="stat-foot">
                      {t("Discover your personal palette")}
                    </span>
                  </>
                )}
              </div>

              <div className="stat-card">
                <span className="stat-label">{t("SAVED OUTFITS")}</span>

                <strong>
                  {String(savedOutfitCount).padStart(2, "0")}
                </strong>

                <span className="stat-foot">
                  {t("Looks worth keeping")}
                </span>
              </div>
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">
                    {t("A GOOD PLACE TO START")}
                  </div>

                  <h2>{t("Your style essentials")}</h2>
                </div>

                <button
                  className="text-link"
                  onClick={() => navigate("My wardrobe")}
                  type="button"
                >
                  {t("View wardrobe")} <span>↗</span>
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
                          {translateCategory(item.category, t).toUpperCase()}
                        </span>
                      </div>

                      <div className="item-details">
                        <div>
                          <strong>{item.name}</strong>
                          <span>{translateCategory(item.category, t)}</span>
                        </div>

                        <div
                          aria-label={t("Garment colours")}
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
                    <h2>{t("Your collection starts here.")}</h2>

                    <p>
                      {t("Add your first clothing piece to see it on your dashboard.")}
                    </p>

                    <button
                      className="text-link"
                      onClick={() => navigate("My wardrobe")}
                      type="button"
                    >
                      {t("Add your first piece")} <span>↗</span>
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
                      ? t("YOUR PERSONAL COLOURS")
                      : t("COLOUR INSPIRATION")}
                  </div>

                  <h2>
                    {season
                      ? `${t("Your")} ${t(getSeasonLabel(season))} ${t("palette")}`
                      : t("A timeless palette")}
                  </h2>
                </div>

                <button
                  className="text-link"
                  onClick={() => navigate("Color analysis")}
                  type="button"
                >
                  {season
                    ? t("View full palette")
                    : t("Discover your palette")}
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

                    <span>{t(color.name)}</span>
                    <small>{color.hex}</small>
                  </div>
                ))}
              </div>

              <p className="disclaimer">
                {season
                  ? t("Your seasonal palette is a styling guide to inspire your wardrobe.")
                  : t("A selection of neutral colours from the Swatchwell seasonal palettes. Complete your colour analysis to discover your personal selection.")}
              </p>
            </section>
          </div>
        )}

        {page === "My wardrobe" && <Wardrobe />}
        {page === "Outfits" && <OutfitGenerator />}
        {page === "Colour combinations" && <ColorCombinations />}
        {page === "Color analysis" && <ColorProfile />}
        {page === "Settings" && <SettingsPage /> }
        {page === "Privacy policy" && <LegalPage kind="privacy" /> }
        {page === "Terms and conditions" && <LegalPage kind="terms" /> }
        {page === "Cookie policy" && <LegalPage kind="cookies" /> }
        {page === "Confirm account deletion" && <SettingsPage confirmDeletion /> }

        {showProfile && <AuthPanel initialMode={recoveryMode ? "update" : undefined} onClose={() => setShowProfile(false)} onRecoveryComplete={() => setRecoveryMode(false)} /> }

        <footer className="footer">
          <span>
            SWATCHWELL<span className="brand-period">.</span>
          </span>

          <nav className="footer-links" aria-label="Legal">
            <button type="button" onClick={() => navigate("Privacy policy")}>{language === "nl" ? "Privacybeleid" : language === "fr" ? "Confidentialité" : language === "de" ? "Datenschutz" : "Privacy policy"}</button>
            <button type="button" onClick={() => navigate("Terms and conditions")}>{language === "nl" ? "Algemene voorwaarden" : language === "fr" ? "Conditions générales" : language === "de" ? "Nutzungsbedingungen" : "Terms and conditions"}</button>
            <button type="button" onClick={() => navigate("Cookie policy")}>{language === "nl" ? "Cookiebeleid" : language === "fr" ? "Politique relative aux cookies" : language === "de" ? "Cookie-Richtlinie" : "Cookie policy"}</button>
          </nav>
          <span>© {new Date().getFullYear()} SWATCHWELL</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
