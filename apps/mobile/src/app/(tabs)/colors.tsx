import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  analyzeSeasonalProfile,
  getSubSeasonalPalette,
  getSubSeasonLabel,
  COLOUR_CLARITY_SWATCHES,
  SEASONAL_QUESTIONS,
  type SeasonalProfile,
  type SeasonalAnalysisResult,
  type SubSeason,
} from '@swatchwell/color-engine';

import Screen, { styles as shared } from '../../components/Screen';
import { supabase } from '../../lib/supabase';

interface StoredColorProfile {
  profile: SeasonalProfile;
  analysis: SeasonalAnalysisResult;
  updatedAt: string;
}

const INITIAL_PROFILE: SeasonalProfile = {
  undertone: 'uncertain',
  value: 'uncertain',
  chroma: 'uncertain',
  contrast: 'uncertain',
};

function createStoredProfile(
  profile: SeasonalProfile,
): StoredColorProfile {
  return {
    profile,
    analysis: analyzeSeasonalProfile(profile),
    updatedAt: new Date().toISOString(),
  };
}

function readStoredProfile(value: unknown): StoredColorProfile | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Record<string, unknown>;
  const profile = candidate.profile;

  if (!profile || typeof profile !== 'object') return null;

  try {
    const restored = createStoredProfile(profile as SeasonalProfile);

    return {
      ...restored,
      updatedAt:
        typeof candidate.updatedAt === 'string'
          ? candidate.updatedAt
          : restored.updatedAt,
    };
  } catch {
    return null;
  }
}

export default function ColorsScreen() {
  const loadVersion = useRef(0);

  const [profile, setProfile] = useState<SeasonalProfile>(INITIAL_PROFILE);
  const [storedProfile, setStoredProfile] =
    useState<StoredColorProfile | null>(null);

  const [step, setStep] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const currentQuestion = SEASONAL_QUESTIONS[step];

  const result = useMemo(
    () => storedProfile?.analysis ?? null,
    [storedProfile],
  );

  const palette = useMemo(
    () =>
      result
        ? getSubSeasonalPalette(result.subSeason)
        : null,
    [result],
  );

  const loadData = useCallback(async () => {
    const client = supabase;
    const version = ++loadVersion.current;
    const isCurrent = () => version === loadVersion.current;

    if (!client) {
      setError('Supabase is not configured.');
      setUserId(null);
      setStoredProfile(null);
      setProfile(INITIAL_PROFILE);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const {
        data: { user },
        error: authError,
      } = await client.auth.getUser();

      if (authError) throw authError;
      if (!isCurrent()) return;

      setUserId(user?.id ?? null);

      if (!user) {
        setStoredProfile(null);
        setProfile(INITIAL_PROFILE);
        setStep(0);
        setError('Sign in to create and save your personal colour profile.');
        return;
      }

      const { data, error: dataError } = await client
        .from('user_style_data')
        .select('color_profile')
        .eq('user_id', user.id)
        .maybeSingle();

      if (dataError) throw dataError;
      if (!isCurrent()) return;

      const {
        data: { user: latestUser },
        error: latestAuthError,
      } = await client.auth.getUser();

      if (latestAuthError) throw latestAuthError;
      if (!isCurrent() || latestUser?.id !== user.id) return;

      const restored = readStoredProfile(data?.color_profile);

      setStoredProfile(restored);
      setProfile(restored?.profile ?? INITIAL_PROFILE);
      setStep(0);
      setError('');
    } catch {
      if (isCurrent()) {
        setError('Your colour profile could not be loaded. Please try again.');
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();

    const auth = supabase?.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;

      loadVersion.current += 1;

      setUserId(session?.user.id ?? null);
      setStoredProfile(null);
      setProfile(INITIAL_PROFILE);
      setStep(0);
      setLoading(true);
      setError('');

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
      .channel(`mobile-style-data-colors-${userId}`)
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

  function updateAnswer(value: string) {
    setProfile((current) => ({
      ...current,
      [currentQuestion.key]: value,
    }) as SeasonalProfile);

    setStoredProfile(null);
    setError('');
  }

  async function saveProfile() {
    const client = supabase;

    if (!client || !userId) {
      setError('Sign in to save your colour profile.');
      return;
    }

    const nextProfile = createStoredProfile(profile);

    try {
      setSaving(true);
      setError('');

      const {
        data: { user },
        error: authError,
      } = await client.auth.getUser();

      if (authError) throw authError;
      if (!user || user.id !== userId) {
        throw new Error('Your account changed. Please try again.');
      }

      const values = {
        color_profile: nextProfile,
        updated_at: new Date().toISOString(),
      };

      const { data, error: updateError } = await client
        .from('user_style_data')
        .update(values)
        .eq('user_id', user.id)
        .select('user_id')
        .maybeSingle();

      if (updateError) throw updateError;

      if (!data) {
        const { error: insertError } = await client
          .from('user_style_data')
          .insert({
            user_id: user.id,
            wardrobe: [],
            saved_outfits: [],
            ...values,
          });

        if (insertError) {
          if (insertError.code !== '23505') throw insertError;

          const { error: retryError } = await client
            .from('user_style_data')
            .update(values)
            .eq('user_id', user.id);

          if (retryError) throw retryError;
        }
      }

      const {
        data: { user: latestUser },
        error: latestAuthError,
      } = await client.auth.getUser();

      if (latestAuthError) throw latestAuthError;
      if (latestUser?.id !== user.id) return;

      setStoredProfile(nextProfile);
      Alert.alert('Profile saved', 'Your colour profile is now saved to your account.');
    } catch {
      setError('Your colour profile could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function resetProfile() {
    const client = supabase;

    if (!client || !userId) return;

    try {
      setSaving(true);
      setError('');

      const {
        data: { user },
        error: authError,
      } = await client.auth.getUser();

      if (authError) throw authError;
      if (!user || user.id !== userId) {
        throw new Error('Your account changed.');
      }

      const { error: resetError } = await client
        .from('user_style_data')
        .update({
          color_profile: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (resetError) throw resetError;

      setStoredProfile(null);
      setProfile(INITIAL_PROFILE);
      setStep(0);

      Alert.alert('Profile reset', 'You can complete the questionnaire again.');
    } catch {
      setError('Your colour profile could not be reset. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmReset() {
    Alert.alert(
      'Reset colour profile?',
      'Your saved seasonal profile will be removed from your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => void resetProfile(),
        },
      ],
    );
  }

  if (loading) {
    return (
      <Screen
        eyebrow="PERSONAL COLOUR ANALYSIS"
        title="Your colours"
        subtitle="Loading your account colour profile."
      >
        <View style={styles.loading}>
          <ActivityIndicator color="#243B53" size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow="PERSONAL COLOUR ANALYSIS"
      title="Your colours"
      subtitle="Understand your colour characteristics and explore your seasonal palette."
    >
      {!userId ? (
        <View style={shared.card}>
          <Text style={shared.cardTitle}>Account required</Text>
          <Text style={shared.body}>
            Sign in to create and save a personal colour profile.
          </Text>
        </View>
      ) : storedProfile && result && palette ? (
        <>
          <View style={shared.card}>
            <Text style={styles.eyebrow}>YOUR CURRENT PROFILE</Text>
            <Text style={styles.seasonTitle}>{palette.label}</Text>
            <Text style={shared.body}>
              {result.season.charAt(0).toUpperCase() + result.season.slice(1)}
              {' · '}
              {result.confidence.charAt(0).toUpperCase() +
                result.confidence.slice(1)}{' '}
              confidence
            </Text>
            <Text style={shared.body}>
              {result.status === 'needs_review'
                ? 'There was limited information available. Use this palette as a starting point.'
                : 'Your answers have been matched with the closest seasonal profile.'}
            </Text>

            <Pressable
              style={styles.secondaryButton}
              disabled={saving}
              onPress={() => {
                setStoredProfile(null);
                setStep(0);
              }}
            >
              <Text style={styles.secondaryButtonText}>Edit answers</Text>
            </Pressable>

            <Pressable
              style={styles.resetButton}
              disabled={saving}
              onPress={confirmReset}
            >
              <Text style={styles.resetButtonText}>Reset profile</Text>
            </Pressable>
          </View>

          <View style={shared.card}>
            <Text style={shared.cardTitle}>Your seasonal palette</Text>
            <Text style={shared.body}>
              Explore the colours associated with {palette.label}.
            </Text>

            {palette.colors.map((color) => (
              <View key={color.hex} style={styles.colorRow}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: color.hex },
                  ]}
                />
                <View style={styles.colorDetails}>
                  <Text style={styles.colorName}>{color.name}</Text>
                  <Text style={styles.hex}>{color.hex}</Text>
                </View>
                <Text style={styles.category}>
                  {color.category}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          <View style={shared.card}>
            <Text style={styles.eyebrow}>PERSONAL COLOUR CHARACTERISTICS</Text>
            <Text style={shared.cardTitle}>
              {currentQuestion.title}
            </Text>
            <Text style={shared.body}>
              {currentQuestion.description}
            </Text>

            {currentQuestion.key === 'chroma' ? (
              <View style={styles.clarityComparison}>
                {[
                  { label: 'Soft', colours: COLOUR_CLARITY_SWATCHES.soft },
                  { label: 'Clear', colours: COLOUR_CLARITY_SWATCHES.clear },
                ].map((group) => (
                  <View key={group.label} style={styles.clarityGroup}>
                    <Text style={styles.clarityLabel}>{group.label}</Text>
                    <View style={styles.claritySwatches}>
                      {group.colours.map((colour) => (
                        <View key={colour} accessible accessibilityLabel={group.label + ' colour example'} style={[styles.claritySwatch, { backgroundColor: colour }]} />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${((step + 1) / SEASONAL_QUESTIONS.length) * 100}%`,
                  },
                ]}
              />
            </View>

            <Text style={styles.progressLabel}>
              STEP {step + 1} OF {SEASONAL_QUESTIONS.length}
            </Text>

            {currentQuestion.options.map((option) => {
              const selected =
                profile[currentQuestion.key] === option.value;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => updateAnswer(option.value)}
                  style={[
                    styles.option,
                    selected && styles.optionSelected,
                  ]}
                >
                  <View style={styles.optionHeader}>
                    <Text
                      style={[
                        styles.optionTitle,
                        selected && styles.optionTitleSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    <View
                      style={[
                        styles.radio,
                        selected && styles.radioSelected,
                      ]}
                    >
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </View>
                  <Text style={styles.optionDetail}>
                    {option.detail}
                  </Text>
                </Pressable>
              );
            })}

            <View style={styles.navigation}>
              {step > 0 ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => setStep((current) => current - 1)}
                  disabled={saving}
                >
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </Pressable>
              ) : (
                <View />
              )}

              {step < SEASONAL_QUESTIONS.length - 1 ? (
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => setStep((current) => current + 1)}
                >
                  <Text style={styles.primaryButtonText}>Continue</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[
                    styles.primaryButton,
                    saving && styles.disabledButton,
                  ]}
                  onPress={() => void saveProfile()}
                  disabled={saving}
                >
                  <Text style={styles.primaryButtonText}>
                    {saving ? 'Saving…' : 'Save colour profile'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <Text style={styles.disclaimer}>
            This twelve-profile seasonal system is an experimental styling
            guide, not a scientific assessment or a definitive determination
            of personal colour suitability. If you are unsure about an answer,
            you can select Not sure.
          </Text>
        </>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    padding: 40,
    alignItems: 'center',
  },
  eyebrow: {
    color: '#969184',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  seasonTitle: {
    color: '#243B53',
    fontSize: 27,
    fontWeight: '600',
    letterSpacing: -0.7,
  },
  clarityComparison: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 18,
    marginBottom: 8,
  },
  clarityGroup: {
    flex: 1,
    gap: 9,
  },
  clarityLabel: {
    color: '#243B53',
    fontSize: 12,
    fontWeight: '600',
  },
  claritySwatches: {
    flexDirection: 'row',
    gap: 6,
  },
  claritySwatch: {
    flex: 1,
    height: 42,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(30, 30, 30, 0.08)',
  },
  progressTrack: {
    height: 4,
    borderRadius: 4,
    backgroundColor: '#ECE9E1',
    overflow: 'hidden',
    marginTop: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#647C70',
    borderRadius: 4,
  },
  progressLabel: {
    color: '#969184',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  option: {
    padding: 15,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#ECE9E1',
    gap: 7,
  },
  optionSelected: {
    borderColor: '#647C70',
    backgroundColor: '#F2F5F0',
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionTitle: {
    color: '#243B53',
    fontSize: 14,
    fontWeight: '600',
  },
  optionTitleSelected: {
    color: '#496655',
  },
  optionDetail: {
    color: '#77776F',
    fontSize: 12,
    lineHeight: 18,
  },
  radio: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#C7C4B9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#647C70',
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#647C70',
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: '#243B53',
    borderRadius: 12,
    paddingHorizontal: 19,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#DCD8CE',
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#243B53',
    fontSize: 12,
    fontWeight: '600',
  },
  resetButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#9B625C',
    fontSize: 12,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.55,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EEE8',
  },
  swatch: {
    width: 42,
    height: 42,
    borderRadius: 11,
  },
  colorDetails: {
    flex: 1,
    gap: 3,
  },
  colorName: {
    color: '#243B53',
    fontSize: 13,
    fontWeight: '600',
  },
  hex: {
    color: '#969184',
    fontSize: 11,
  },
  category: {
    color: '#969184',
    fontSize: 10,
    textTransform: 'capitalize',
  },
  disclaimer: {
    color: '#969184',
    fontSize: 11,
    lineHeight: 18,
    paddingHorizontal: 3,
  },
  errorBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F8EEEC',
  },
  errorText: {
    color: '#965D55',
    fontSize: 12,
    lineHeight: 18,
  },
});
