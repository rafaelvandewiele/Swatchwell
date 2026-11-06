import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import type { ClothingCategory, ClothingItem } from '@swatchwell/shared';
import { generateOutfits, type OutfitRecommendation } from '@swatchwell/outfit-engine';
import Screen, { styles } from '../../components/Screen';
import { supabase } from '../../lib/supabase';

type StoredOutfit = { outfit: OutfitRecommendation };

const CATEGORY_MAP: Record<string, ClothingCategory | undefined> = {
  Shirts: 'shirt',
  'T-shirts': 'tshirt',
  'Polo shirts': 'polo',
  Sweaters: 'sweater',
  Knitwear: 'sweater',
  Trousers: 'pants',
  Outerwear: 'jacket',
  Shoes: 'shoes',
  Accessories: 'accessory',
};

function isStoredOutfit(value: unknown): value is StoredOutfit {
  if (!value || typeof value !== 'object') return false;
  const outfit = (value as { outfit?: unknown }).outfit;
  return Boolean(
    outfit &&
    typeof outfit === 'object' &&
    typeof (outfit as OutfitRecommendation).id === 'string' &&
    Array.isArray((outfit as OutfitRecommendation).items),
  );
}

export default function OutfitsScreen() {
  const loadVersion = useRef(0);
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>([]);
  const [savedOutfits, setSavedOutfits] = useState<StoredOutfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const generatedOutfits = useMemo(() => {
    try {
      return generateOutfits(wardrobe, { limit: 10 });
    } catch {
      return [];
    }
  }, [wardrobe]);

  const loadData = useCallback(async () => {
    const client = supabase;
    const requestVersion = ++loadVersion.current;
    const isCurrent = () => requestVersion === loadVersion.current;

    if (!client) {
      setError('Supabase is not configured.');
      setUserId(null);
      setWardrobe([]);
      setSavedOutfits([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError) throw authError;
      if (!isCurrent()) return;

      setUserId(user?.id ?? null);

      if (!user) {
        setWardrobe([]);
        setSavedOutfits([]);
        setError('');
        return;
      }

      const { data, error: dataError } = await client
        .from('user_style_data')
        .select('wardrobe, saved_outfits')
        .eq('user_id', user.id)
        .maybeSingle();

      if (dataError) throw dataError;
      if (!isCurrent()) return;

      const rawWardrobe = Array.isArray(data?.wardrobe) ? data.wardrobe : [];

      const mapped: ClothingItem[] = rawWardrobe.flatMap((entry: any) => {
        const category = CATEGORY_MAP[entry?.category];

        if (!category || !entry?.id || !entry?.name || !entry?.color) {
          return [];
        }

        return [{
          id: String(entry.id),
          name: String(entry.name),
          category,
          color: String(entry.color),
          ...(Array.isArray(entry.extraColors)
            ? { extraColors: entry.extraColors }
            : {}),
        }];
      });

      const { data: { user: latestUser }, error: latestAuthError } =
        await client.auth.getUser();

      if (latestAuthError) throw latestAuthError;
      if (!isCurrent() || latestUser?.id !== user.id) return;

      setWardrobe(mapped);
      setSavedOutfits(
        (Array.isArray(data?.saved_outfits) ? data.saved_outfits : [])
          .filter(isStoredOutfit),
      );
      setError('');
    } catch {
      if (isCurrent()) {
        setError('Your outfits could not be synchronised. Please try again.');
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();

    const auth = supabase?.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;

      // Invalideer onmiddellijk alle lopende laadopdrachten.
      loadVersion.current += 1;
      setUserId(session?.user.id ?? null);
      setWardrobe([]);
      setSavedOutfits([]);
      setLoading(true);
      setError('');

      // Supabase-aanroepen buiten de auth-callback uitvoeren.
      queueMicrotask(() => {
        void loadData();
      });
    });

    return () => {
      loadVersion.current += 1;
      auth?.data.subscription.unsubscribe();
    };
  }, [loadData]);

  useEffect(() => {
    if (!supabase || !userId) return;

    const channel = supabase
      .channel(`mobile-style-data-outfits-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_style_data',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadData();
        },
      )
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [userId, loadData]);

  async function toggleSaved(outfit: OutfitRecommendation) {
    const client = supabase;

    if (!client || !userId) {
      Alert.alert('Sign in required', 'Sign in to save your favourite outfits.');
      return;
    }

    const exists = savedOutfits.some(
      (entry) => entry.outfit.id === outfit.id,
    );

    const next = exists
      ? savedOutfits.filter((entry) => entry.outfit.id !== outfit.id)
      : [...savedOutfits, { outfit }];

    try {
      const { data: updated, error: updateError } = await client
        .from('user_style_data')
        .update({
          saved_outfits: next,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select('user_id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) {
        const { error: insertError } = await client
          .from('user_style_data')
          .insert({ user_id: userId, saved_outfits: next });
        if (insertError && insertError.code === '23505') {
          const { error: retryError } = await client
            .from('user_style_data')
            .update({
              saved_outfits: next,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);
          if (retryError) throw retryError;
        } else if (insertError) {
          throw insertError;
        }
      }
      setSavedOutfits(next);
    } catch {
      Alert.alert('Save error', 'Your favourite outfit could not be saved.');
    }
  }

  function renderOutfit(outfit: OutfitRecommendation) {
    const saved = savedOutfits.some(
      (entry) => entry.outfit.id === outfit.id,
    );

    return (
      <View key={outfit.id} style={styles.card}>
        <Text style={styles.cardTitle}>
          {outfit.items.map((item) => item.name).join(' · ')}
        </Text>
        <Text style={styles.body}>
          {outfit.rating.toUpperCase()} · {outfit.score}/100
        </Text>

        {outfit.explanation.map((line, index) => (
          <Text key={`${outfit.id}-${index}`} style={styles.body}>
            {line}
          </Text>
        ))}

        <Pressable
          onPress={() => void toggleSaved(outfit)}
          style={{ paddingVertical: 10 }}
        >
          <Text style={{ color: '#243B53', fontWeight: '600' }}>
            {saved ? '★  Remove from favourites' : '☆  Save outfit'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Screen
      eyebrow="Made for your wardrobe"
      title="Outfits"
      subtitle="Discover combinations from the clothes you already own."
    >
      {error ? <Text style={styles.body}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your next outfit</Text>
        <Text style={styles.body}>
          {loading
            ? 'Loading your wardrobe...'
            : wardrobe.length === 0
              ? 'Your account wardrobe is empty. Add clothes in Wardrobe to get started.'
              : generatedOutfits.length === 0
                ? 'Add at least one shirt, T-shirt or polo and one pair of trousers to generate outfits.'
                : `${generatedOutfits.length} combinations generated from your ${wardrobe.length} garments.`}
        </Text>

        <Pressable
          onPress={() => void loadData()}
          disabled={loading}
          style={{ paddingVertical: 10 }}
        >
          <Text style={{ color: '#243B53', fontWeight: '600' }}>
            ↻  Refresh outfits
          </Text>
        </Pressable>
      </View>

      {generatedOutfits.map(renderOutfit)}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Saved outfits ({savedOutfits.length})
        </Text>
        {savedOutfits.length === 0 ? (
          <Text style={styles.body}>
            Your favourite combinations will appear here.
          </Text>
        ) : null}
      </View>

      {savedOutfits.map(({ outfit }) => renderOutfit(outfit))}
    </Screen>
  );
}
