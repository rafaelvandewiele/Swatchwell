import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { DEFAULT_STYLE_PROFILE, STYLE_CATEGORIES, STYLE_FORMALITY_LEVELS, normalizeStyleProfile, type StyleProfile, type StyleProfileInput } from "./profiles";
import "./style-profiles.css";

interface WardrobeOption { id: string; name: string; category: string }
interface Props { userId: string | null; isPremium: boolean; wardrobe: WardrobeOption[]; onChange: (profile: StyleProfile | null) => void }

export default function StyleProfiles({ userId, isPremium, wardrobe, onChange }: Props) {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState<StyleProfileInput>(DEFAULT_STYLE_PROFILE);
  const [editing, setEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const active = useMemo(() => profiles.find((profile) => profile.id === activeId) ?? null, [profiles, activeId]);

  useEffect(() => {
    let live = true;
    if (!userId || !isPremium || !supabase) {
      setProfiles([]);
      setActiveId("");
      onChange(null);
      return () => { live = false; };
    }
    void supabase.from("user_style_profiles").select("*").eq("user_id", userId).order("created_at", { ascending: true }).then(({ data, error: loadError }) => {
      if (!live) return;
      if (loadError) { setError(loadError.message); return; }
      const normalized = (data ?? []).map(normalizeStyleProfile).filter((profile): profile is StyleProfile => profile !== null);
      setProfiles(normalized);
      const selected = normalized.find((profile) => profile.is_default) ?? normalized[0] ?? null;
      setActiveId(selected?.id ?? "");
      onChange(selected);
    });
    return () => { live = false; };
  }, [userId, isPremium]);

  useEffect(() => { onChange(active); }, [active?.id, active?.updated_at]);

  function beginCreate() {
    setDraft({ ...DEFAULT_STYLE_PROFILE, name: "New profile", is_default: profiles.length === 0 });
    setEditing(true);
    setError("");
  }

  function beginEdit() {
    if (!active) return;
    setDraft({
      name: active.name,
      is_default: active.is_default,
      preferred_categories: [...active.preferred_categories],
      preferred_colours: [...active.preferred_colours],
      formality: active.formality,
      excluded_item_ids: [...active.excluded_item_ids],
    });
    setEditing(true);
  }

  async function save() {
    if (!userId || !supabase || !draft.name.trim()) return;
    setBusy(true); setError("");
    try {
      if (draft.is_default) {
        const { error: clearError } = await supabase.from("user_style_profiles").update({ is_default: false }).eq("user_id", userId);
        if (clearError) throw clearError;
      }
      const payload = { ...draft, name: draft.name.trim(), updated_at: new Date().toISOString() };
      const result = !isCreating && active && profiles.some((profile) => profile.id === active.id)
        ? await supabase.from("user_style_profiles").update(payload).eq("id", active.id).eq("user_id", userId).select("*").single()
        : await supabase.from("user_style_profiles").insert({ ...payload, user_id: userId }).select("*").single();
      if (result.error) throw result.error;
      const saved = normalizeStyleProfile(result.data);
      if (!saved) throw new Error("The saved style profile could not be read.");
      const next = [...profiles.filter((profile) => profile.id !== saved.id && !(saved.is_default && profile.is_default)), saved];
      setProfiles(next); setActiveId(saved.id); setEditing(false); setIsCreating(false);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : t("Your style profile could not be saved.")); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!active || !userId || !supabase || !window.confirm(t("Delete this style profile?"))) return;
    setBusy(true); setError("");
    const { error: deleteError } = await supabase.from("user_style_profiles").delete().eq("id", active.id).eq("user_id", userId);
    if (deleteError) setError(deleteError.message);
    else {
      const next = profiles.filter((profile) => profile.id !== active.id);
      setProfiles(next); setActiveId(next.find((profile) => profile.is_default)?.id ?? next[0]?.id ?? "");
    }
    setBusy(false);
  }

  if (!isPremium || !userId) return null;

  return <section className="style-profiles-panel">
    <div className="style-profiles-heading">
      <div><span>{t("PERSONAL PREFERENCES")}</span><h2>{t("Your style profiles")}</h2><p>{t("Save different preferences for everyday, smart casual or formal outfits.")}</p></div>
      <button type="button" onClick={beginCreate}>{t("New profile")}</button>
    </div>
    {profiles.length > 0 && <div className="style-profiles-toolbar">
      <label>{t("Active profile")}<select value={activeId} onChange={(event) => { setActiveId(event.target.value); setEditing(false); }}><option value="">{t("Choose a profile")}</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.is_default ? " · " + t("Default") : ""}</option>)}</select></label>
      {active && <div className="style-profiles-actions"><button type="button" onClick={beginEdit}>{t("Edit")}</button><button type="button" onClick={() => void remove()} disabled={busy}>{t("Delete")}</button></div>}
    </div>}
    {editing && <div className="style-profile-editor">
      <label>{t("Profile name")}<input maxLength={48} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}/></label>
      <label>{t("Formality")}<select value={draft.formality} onChange={(event) => setDraft((current) => ({ ...current, formality: event.target.value as StyleProfileInput["formality"] }))}>{STYLE_FORMALITY_LEVELS.map((level) => <option key={level} value={level}>{t(level)}</option>)}</select></label>
      <label>{t("Preferred colours")}<input placeholder="#243447, #e8e0d2" value={draft.preferred_colours.join(", ")} onChange={(event) => setDraft((current) => ({ ...current, preferred_colours: event.target.value.split(",").map((value) => value.trim()).filter((value) => /^#[0-9a-f]{6}$/i.test(value)).slice(0, 12) }))}/><small>{t("Enter hex colours separated by commas.")}</small></label>
      <fieldset><legend>{t("Preferred categories")}</legend><div className="style-profile-checks">{STYLE_CATEGORIES.map((category) => <label key={category}><input type="checkbox" checked={draft.preferred_categories.includes(category)} onChange={(event) => setDraft((current) => ({ ...current, preferred_categories: event.target.checked ? [...current.preferred_categories, category] : current.preferred_categories.filter((value) => value !== category) }))}/>{t(category)}</label>)}</div></fieldset>
      <fieldset><legend>{t("Exclude specific wardrobe items")}</legend><div className="style-profile-checks style-profile-items">{wardrobe.map((item) => <label key={item.id}><input type="checkbox" checked={draft.excluded_item_ids.includes(item.id)} onChange={(event) => setDraft((current) => ({ ...current, excluded_item_ids: event.target.checked ? [...current.excluded_item_ids, item.id] : current.excluded_item_ids.filter((id) => id !== item.id) }))}/>{item.name}</label>)}</div></fieldset>
      <label className="style-profile-default"><input type="checkbox" checked={draft.is_default} onChange={(event) => setDraft((current) => ({ ...current, is_default: event.target.checked }))}/>{t("Make this my default profile")}</label>
      <div className="style-profile-footer"><button type="button" onClick={() => setEditing(false)}>{t("Cancel")}</button><button type="button" onClick={() => void save()} disabled={busy || !draft.name.trim()}>{busy ? t("Saving...") : t("Save profile")}</button></div>
    </div>}
    {error && <p className="style-profile-error" role="alert">{error}</p>}
    {active && !editing && <p className="style-profile-summary">{t("Suggestions are ranked using this profile. You can switch profiles without changing your saved preferences.")} {active.is_default ? t("Default profile") : ""}</p>}
  </section>;
}
