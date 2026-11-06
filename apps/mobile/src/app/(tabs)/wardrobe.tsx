import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Screen from '../../components/Screen';
import { supabase } from '../../lib/supabase';


const CATEGORIES = [
  'All',
  'Shirts',
  'T-shirts',
  'Polo shirts',
  'Sweaters',
  'Knitwear',
  'Trousers',
  'Outerwear',
  'Shoes',
  'Accessories',
] as const;

type Category = Exclude<(typeof CATEGORIES)[number], 'All'>;

interface Garment {
  id: string;
  name: string;
  category: Category;
  brand: string;
  color: string;
  extraColors: string[];
  imageUri: string | null;
  imageKey: string;
  notes: string;
  createdAt: number;
}

const COLOR_PALETTE: { name: string; colors: string[] }[] = [
  {
    name: 'Reds',
    colors: ['#FCE4E4', '#F5B7B1', '#E99696', '#E57373', '#D9534F', '#C0392B', '#A93226', '#7B241C'],
  },
  {
    name: 'Oranges',
    colors: ['#FDEBD0', '#FAD7A0', '#F8C471', '#F0B27A', '#E59866', '#DC7633', '#BA4A00', '#873600'],
  },
  {
    name: 'Yellows',
    colors: ['#FFF9C4', '#FFF176', '#FFEE58', '#F7DC6F', '#F4D03F', '#D4AC0D', '#B7950B', '#7D6608'],
  },
  {
    name: 'Greens',
    colors: ['#E8F5E9', '#C8E6C9', '#A5D6A7', '#81C784', '#66BB6A', '#388E3C', '#287A45', '#145A32'],
  },
  {
    name: 'Blues',
    colors: ['#E3F2FD', '#BBDEFB', '#90CAF9', '#64B5F6', '#42A5F5', '#2874A6', '#1F618D', '#154360'],
  },
  {
    name: 'Purples',
    colors: ['#F3E5F5', '#E1BEE7', '#CE93D8', '#BA68C8', '#AB47BC', '#884EA0', '#6C3483', '#4A235A'],
  },
  {
    name: 'Pinks',
    colors: ['#FCE4EC', '#F8BBD0', '#F48FB1', '#F06292', '#EC407A', '#D81B60', '#AD1457', '#880E4F'],
  },
  {
    name: 'Browns',
    colors: ['#EFEBE9', '#D7CCC8', '#BCAAA4', '#A1887F', '#8D6E63', '#795548', '#5D4037', '#3E2723'],
  },
  {
    name: 'Neutrals',
    colors: ['#FFFFFF', '#F5F5F0', '#E8E6DF', '#D6D3CA', '#B8B5AC', '#99968D', '#77776F', '#4A4A46'],
  },
  {
    name: 'Dark tones',
    colors: ['#ECEFF1', '#CFD8DC', '#90A4AE', '#607D8B', '#455A64', '#37474F', '#263238', '#17212B'],
  },
];

const EMPTY_FORM = {
  name: '',
  category: 'T-shirts' as Category,
  brand: '',
  color: '#34495E',
  extraColors: [] as string[],
  imageUri: null as string | null,
};

function normalizeHex(value: string): string | null {
  const hex = value.trim().startsWith('#')
    ? value.trim()
    : `#${value.trim()}`;

  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.toUpperCase() : null;
}

export default function WardrobeScreen() {
  const loadVersion = useRef(0);
  const [items, setItems] = useState<Garment[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] =
    useState<(typeof CATEGORIES)[number]>('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [colorPickerTarget, setColorPickerTarget] = useState<'main' | number | null>(null);

  useEffect(() => {
    let active = true;

    async function refresh() {
      await loadItems();
    }

    void refresh();

    const client = supabase;
    const authListener = client?.auth.onAuthStateChange((event) => {
      if (!active) return;

      if (event === 'SIGNED_OUT') {
        loadVersion.current += 1;
        setItems([]);
        setPhotoUrls({});
        setCurrentUserId(null);
        setLoading(false);
        setModalVisible(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
        return;
      }

      if (event === 'SIGNED_IN') {
        loadVersion.current += 1;
        setItems([]);
        setPhotoUrls({});
        setCurrentUserId(null);
        setLoading(true);
        setModalVisible(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
        queueMicrotask(() => {
          if (active) void loadItems();
        });
      }
    });
    return () => {
      active = false;
      loadVersion.current += 1;
      authListener?.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!currentUserId || !supabase) return;

    const channel = supabase
      .channel(`mobile-wardrobe-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_style_data',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          void loadItems();
        },
      )
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [currentUserId]);

  async function loadItems() {
    const client = supabase;
    const requestVersion = ++loadVersion.current;
    const isCurrent = () => requestVersion === loadVersion.current;

    try {
      if (!client) throw new Error('Supabase is not configured.');
      setLoading(true);

      const { data: { user }, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (!isCurrent()) return;

      if (!user) {
        setItems([]);
        setPhotoUrls({});
        setCurrentUserId(null);
        return;
      }

      setCurrentUserId(user.id);

      const { data, error } = await client
        .from('user_style_data')
        .select('wardrobe')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (!isCurrent()) return;

      const stored = Array.isArray(data?.wardrobe) ? data.wardrobe : [];
      const garments: Garment[] = stored
        .filter((entry: unknown) => entry !== null && typeof entry === 'object')
        .map((entry: any) => ({
          id: String(entry.id ?? ''),
          name: String(entry.name ?? ''),
          category: entry.category as Category,
          brand: String(entry.brand ?? ''),
          color: String(entry.color ?? '#34495E'),
          extraColors: Array.isArray(entry.extraColors) ? entry.extraColors : [],
          imageUri: null,
          imageKey: String(entry.imageKey ?? ''),
          notes: String(entry.notes ?? ''),
          createdAt: Number(entry.createdAt ?? Date.now()),
        }))
        .filter((entry) => entry.id && entry.name);

      const urls: Record<string, string> = {};
      await Promise.all(garments.map(async (item) => {
        const path = `${user.id}/${item.id}`;
        const { data: signed, error: photoError } = await client.storage
          .from('wardrobe-photos')
          .createSignedUrl(path, 3600);

        if (!photoError && signed?.signedUrl) {
          urls[item.id] = signed.signedUrl;
        }
      }));

      if (!isCurrent()) return;

      const { data: { user: latestUser } } = await client.auth.getUser();
      if (!isCurrent() || latestUser?.id !== user.id) return;

      setItems(garments);
      setPhotoUrls(urls);
    } catch {
      if (isCurrent()) {
        Alert.alert('Storage error', 'Your cloud wardrobe could not be loaded.');
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }

  async function persistItems(nextItems: Garment[]) {
    const client = supabase;

    try {
      if (!client) throw new Error('Supabase is not configured.');

      const { data: { user }, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        setItems([]);
        Alert.alert('Sign in required', 'Sign in to save your wardrobe.');
        return;
      }

      const wardrobe = nextItems.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        brand: item.brand,
        color: item.color,
        extraColors: item.extraColors,
        imageKey: item.imageKey,
        notes: item.notes,
        createdAt: item.createdAt,
      }));
      const { data: updated, error: updateError } = await client
        .from('user_style_data')
        .update({ wardrobe, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .select('user_id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) {
        const { error: insertError } = await client
          .from('user_style_data')
          .insert({ user_id: user.id, wardrobe });
        if (insertError && insertError.code === '23505') {
          const { error: retryError } = await client
            .from('user_style_data')
            .update({ wardrobe, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
          if (retryError) throw retryError;
        } else if (insertError) {
          throw insertError;
        }
      }
      setItems(nextItems);
    } catch {
      Alert.alert('Save error', 'Your cloud changes could not be saved. Please try again.');
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory =
        selectedCategory === 'All' || item.category === selectedCategory;

      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.brand.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [items, selectedCategory, search]);

  function openNewItem() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function openEditItem(item: Garment) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category,
      brand: item.brand,
      color: item.color,
      extraColors: [...item.extraColors],
      imageUri: photoUrls[item.id] ?? null,
    });
    setModalVisible(true);
  }

  function updateForm<K extends keyof typeof EMPTY_FORM>(
    key: K,
    value: (typeof EMPTY_FORM)[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addExtraColor() {
    if (form.extraColors.length >= 5) return;
    updateForm('extraColors', [...form.extraColors, '#A8A58B']);
  }

  function updateExtraColor(index: number, value: string) {
    const next = [...form.extraColors];
    next[index] = value;
    updateForm('extraColors', next);
  }

  function selectPaletteColor(color: string) {
    if (colorPickerTarget === 'main') {
      updateForm('color', color);
    } else if (typeof colorPickerTarget === 'number') {
      updateExtraColor(colorPickerTarget, color);
    }

    setColorPickerTarget(null);
  }

  function removeExtraColor(index: number) {
    updateForm(
      'extraColors',
      form.extraColors.filter((_, i) => i !== index),
    );
  }

  async function choosePhoto() {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Permission required',
        'Allow photo library access to add garment photos.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      updateForm('imageUri', result.assets[0].uri);
    }
  }

  async function saveItem() {
    const name = form.name.trim();
    const mainColor = normalizeHex(form.color);
    const extraColors = form.extraColors.map(normalizeHex);

    if (!name) {
      Alert.alert('Missing name', 'Give your garment a name first.');
      return;
    }

    if (!mainColor) {
      Alert.alert('Invalid color', 'Enter a valid HEX color, for example #34495E.');
      return;
    }

    if (extraColors.some((color) => !color)) {
      Alert.alert('Invalid color', 'Check the HEX values of your extra colors.');
      return;
    }

    const id = editingId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const existingItem = items.find((item) => item.id === id);
    let imageKey = existingItem?.imageKey ?? '';

    try {
      const client = supabase;
      if (!client) throw new Error('Supabase is not configured.');

      const { data: { user }, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        Alert.alert('Sign in required', 'Sign in to save your wardrobe.');
        return;
      }

      const selectedPhotoIsNew =
        Boolean(form.imageUri) && form.imageUri !== photoUrls[id];

      if (selectedPhotoIsNew && form.imageUri) {
        const photoFile = new File(form.imageUri);
        if (!photoFile.exists) {
          throw new Error('The selected photo could not be found on this device.');
        }

        const fileData = await photoFile.arrayBuffer();
        const extension = form.imageUri.split('?')[0].split('.').pop()?.toLowerCase();
        const contentType =
          extension === 'png' ? 'image/png' :
          extension === 'webp' ? 'image/webp' :
          extension === 'heic' ? 'image/heic' : 'image/jpeg';

        const path = `${user.id}/${id}`;
        const { error: uploadError } = await client.storage
          .from('wardrobe-photos')
          .upload(path, fileData, { upsert: true, contentType });

        if (uploadError) throw uploadError;
        imageKey = path;
      }
    } catch (error) {
      console.error('Swatchwell garment photo upload failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Photo upload failed', message);
      return;
    }

    const garment: Garment = {
      id,
      name,
      category: form.category,
      brand: form.brand.trim(),
      color: mainColor,
      extraColors: extraColors.filter((color): color is string => Boolean(color)),
      imageUri: form.imageUri,
      imageKey,
      notes: items.find((item) => item.id === editingId)?.notes ?? '',
      createdAt: editingId
        ? items.find((item) => item.id === editingId)?.createdAt ?? Date.now()
        : Date.now(),
    };

    const nextItems = editingId
      ? items.map((item) => item.id === editingId ? garment : item)
      : [garment, ...items];

    await persistItems(nextItems);
    setModalVisible(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function deleteItem(item: Garment) {
    Alert.alert(
      'Delete garment',
      `Remove "${item.name}" from your wardrobe?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const client = supabase;
            if (client && currentUserId) {
              void client.storage
                .from('wardrobe-photos')
                .remove([`${currentUserId}/${item.id}`]);
            }
            void persistItems(items.filter((entry) => entry.id !== item.id));
            setPhotoUrls((current) => {
              const next = { ...current };
              delete next[item.id];
              return next;
            });
          },
        },
      ],
    );
  }

  return (
    <>
      <Screen
        eyebrow="Your collection"
        title="Wardrobe"
        subtitle="Your clothes, colours and combinations in one place."
      >
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{items.length}</Text>
            <Text style={styles.statLabel}>GARMENTS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {new Set(items.flatMap((item) => [item.color, ...item.extraColors])).size}
            </Text>
            <Text style={styles.statLabel}>COLOURS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {new Set(items.map((item) => item.category)).size}
            </Text>
            <Text style={styles.statLabel}>CATEGORIES</Text>
          </View>
        </View>

        <Pressable style={styles.addButton} onPress={openNewItem}>
          <Text style={styles.addButtonText}>＋  Add garment</Text>
        </Pressable>

        <TextInput
          style={styles.search}
          placeholder="Search your wardrobe..."
          placeholderTextColor="#99968D"
          value={search}
          onChangeText={setSearch}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        >
          {CATEGORIES.map((category) => {
            const active = selectedCategory === category;
            return (
              <Pressable
                key={category}
                onPress={() => setSelectedCategory(category)}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
              >
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                  {category}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {selectedCategory === 'All' ? 'All garments' : selectedCategory}
          </Text>
          <Text style={styles.count}>{filteredItems.length} ITEMS</Text>
        </View>

        {loading ? (
          <Text style={styles.emptyText}>Loading wardrobe...</Text>
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {items.length === 0 ? 'Your wardrobe starts here' : 'No garments found'}
            </Text>
            <Text style={styles.emptyText}>
              {items.length === 0
                ? 'Add your first garment to start building your collection.'
                : 'Try another search or category.'}
            </Text>
            {items.length === 0 && (
              <Pressable onPress={openNewItem} style={styles.emptyButton}>
                <Text style={styles.emptyButtonText}>Add your first garment</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.grid}>
            {filteredItems.map((item) => (
              <Pressable
                key={item.id}
                style={styles.garmentCard}
                onPress={() => openEditItem(item)}
                onLongPress={() => deleteItem(item)}
              >
                {photoUrls[item.id] ? (
                  <Image source={{ uri: photoUrls[item.id] }} style={styles.garmentImage} />
                ) : (
                  <View style={[styles.garmentImage, styles.imagePlaceholder]}>
                    <View
                      style={[
                        styles.placeholderSwatch,
                        { backgroundColor: item.color },
                      ]}
                    />
                  </View>
                )}
                <View style={styles.garmentInfo}>
                  <Text style={styles.garmentName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.garmentCategory}>{item.category}</Text>
                  {item.brand ? (
                    <Text style={styles.garmentBrand} numberOfLines={1}>
                      {item.brand}
                    </Text>
                  ) : null}
                  <View style={styles.swatches}>
                    {[item.color, ...item.extraColors].map((color, index) => (
                      <View
                        key={`${item.id}-${index}`}
                        style={[styles.swatch, { backgroundColor: color }]}
                      />
                    ))}
                  </View>
                </View>
                <Text style={styles.editHint}>EDIT</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.helperText}>
          Tap a garment to edit it. Press and hold to delete it.
        </Text>
      </Screen>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackground}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>YOUR COLLECTION</Text>
                <Text style={styles.modalTitle}>
                  {editingId ? 'Edit garment' : 'New garment'}
                </Text>
              </View>
              <Pressable onPress={() => setModalVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>GARMENT NAME *</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(value) => updateForm('name', value)}
              placeholder="e.g. White Oxford shirt"
              placeholderTextColor="#99968D"
            />

            <Text style={styles.fieldLabel}>CATEGORY *</Text>
            <View style={styles.categoryOptions}>
              {CATEGORIES.filter((category) => category !== 'All').map((category) => (
                <Pressable
                  key={category}
                  onPress={() => updateForm('category', category)}
                  style={[
                    styles.optionChip,
                    form.category === category && styles.optionChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      form.category === category && styles.optionTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>BRAND</Text>
            <TextInput
              style={styles.input}
              value={form.brand}
              onChangeText={(value) => updateForm('brand', value)}
              placeholder="e.g. Ralph Lauren"
              placeholderTextColor="#99968D"
            />

            <Text style={styles.fieldLabel}>MAIN COLOUR *</Text>
            <View style={styles.colorInputRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose main colour"
                onPress={() => setColorPickerTarget('main')}
                style={[
                  styles.colorPreview,
                  { backgroundColor: normalizeHex(form.color) ?? '#FFFFFF' },
                ]}
              />
              <TextInput
                style={[styles.input, styles.colorInput]}
                value={form.color}
                onChangeText={(value) => updateForm('color', value)}
                placeholder="#34495E"
                autoCapitalize="characters"
                maxLength={7}
              />
            </View>

            <View style={styles.extraHeader}>
              <Text style={styles.fieldLabel}>EXTRA COLOURS</Text>
              <Text style={styles.optional}>OPTIONAL · MAX 5</Text>
            </View>

            {form.extraColors.map((color, index) => (
              <View key={index} style={styles.colorInputRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Choose extra colour ${index + 1}`}
                  onPress={() => setColorPickerTarget(index)}
                  style={[
                    styles.colorPreview,
                    { backgroundColor: normalizeHex(color) ?? '#FFFFFF' },
                  ]}
                />
                <TextInput
                  style={[styles.input, styles.colorInput]}
                  value={color}
                  onChangeText={(value) => updateExtraColor(index, value)}
                  placeholder="#A8A58B"
                  autoCapitalize="characters"
                  maxLength={7}
                />
                <Pressable
                  style={styles.removeColorButton}
                  onPress={() => removeExtraColor(index)}
                >
                  <Text style={styles.removeColorText}>−</Text>
                </Pressable>
              </View>
            ))}

            {form.extraColors.length < 5 && (
              <Pressable style={styles.addColorButton} onPress={addExtraColor}>
                <Text style={styles.addColorText}>＋  Add another colour</Text>
              </Pressable>
            )}


            {colorPickerTarget !== null && (
              <View style={styles.inlineColorPicker}>
                <View style={styles.colorPickerHeader}>
                  <View>
                    <Text style={styles.modalEyebrow}>SWATCHWELL COLOUR SELECTOR</Text>
                    <Text style={styles.colorPickerTitle}>Choose a colour</Text>
                  </View>
                  <Pressable onPress={() => setColorPickerTarget(null)}>
                    <Text style={styles.closeButton}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.colorPickerScroll}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {COLOR_PALETTE.map((family) => (
                    <View key={family.name} style={styles.paletteFamily}>
                      <Text style={styles.paletteFamilyTitle}>{family.name}</Text>
                      <View style={styles.paletteGrid}>
                        {family.colors.map((color) => {
                          const currentColor =
                            colorPickerTarget === 'main'
                              ? form.color
                              : form.extraColors[colorPickerTarget];

                          const selected =
                            normalizeHex(currentColor ?? '') === color;

                          return (
                            <Pressable
                              key={color}
                              accessibilityRole="button"
                              accessibilityLabel={`Select ${color}`}
                              onPress={() => selectPaletteColor(color)}
                              style={[
                                styles.paletteSwatch,
                                { backgroundColor: color },
                                selected && styles.paletteSwatchSelected,
                              ]}
                            >
                              {selected && (
                                <Text style={styles.paletteCheck}>✓</Text>
                              )}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={styles.fieldLabel}>GARMENT PHOTO</Text>
            <Pressable style={styles.photoButton} onPress={choosePhoto}>
              {form.imageUri ? (
                <Image source={{ uri: form.imageUri }} style={styles.photoPreview} />
              ) : (
                <Text style={styles.photoButtonText}>＋  Choose a photo</Text>
              )}
            </Pressable>

            <Pressable style={styles.saveButton} onPress={saveItem}>
              <Text style={styles.saveButtonText}>
                {editingId ? 'Save changes' : 'Add to wardrobe'}
              </Text>
            </Pressable>

            {editingId && (
              <Pressable
                style={styles.deleteButton}
                onPress={() => {
                  const item = items.find((entry) => entry.id === editingId);
                  if (item) {
                    setModalVisible(false);
                    deleteItem(item);
                  }
                }}
              >
                <Text style={styles.deleteButtonText}>Delete garment</Text>
              </Pressable>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

    </>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    gap: 9,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFEFA',
    borderRadius: 15,
    padding: 13,
    borderWidth: 1,
    borderColor: '#ECE9E1',
    gap: 5,
  },
  statNumber: {
    color: '#243B53',
    fontSize: 25,
    fontWeight: '600',
  },
  statLabel: {
    color: '#969184',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  addButton: {
    backgroundColor: '#243B53',
    borderRadius: 13,
    padding: 16,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  search: {
    backgroundColor: '#FFFEFA',
    borderWidth: 1,
    borderColor: '#ECE9E1',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 13,
    color: '#243B53',
    fontSize: 14,
  },
  categoryList: {
    gap: 8,
    paddingRight: 20,
  },
  categoryChip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3E0D7',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#FFFEFA',
  },
  categoryChipActive: {
    backgroundColor: '#243B53',
    borderColor: '#243B53',
  },
  categoryText: {
    color: '#77776F',
    fontSize: 11,
    fontWeight: '500',
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listTitle: {
    color: '#243B53',
    fontSize: 20,
    fontWeight: '600',
  },
  count: {
    color: '#969184',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  grid: {
    gap: 12,
  },
  garmentCard: {
    backgroundColor: '#FFFEFA',
    borderRadius: 16,
    padding: 11,
    borderWidth: 1,
    borderColor: '#ECE9E1',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  garmentImage: {
    width: 83,
    height: 93,
    borderRadius: 11,
  },
  imagePlaceholder: {
    backgroundColor: '#F0EEE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderSwatch: {
    width: 38,
    height: 38,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  garmentInfo: {
    flex: 1,
    gap: 4,
  },
  garmentName: {
    color: '#243B53',
    fontSize: 14,
    fontWeight: '600',
  },
  garmentCategory: {
    color: '#77776F',
    fontSize: 11,
  },
  garmentBrand: {
    color: '#969184',
    fontSize: 10,
  },
  swatches: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 5,
  },
  swatch: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E5E1D8',
  },
  editHint: {
    color: '#AAA69B',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  emptyCard: {
    backgroundColor: '#FFFEFA',
    borderRadius: 17,
    padding: 25,
    borderWidth: 1,
    borderColor: '#ECE9E1',
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    color: '#243B53',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyText: {
    color: '#77776F',
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#243B53',
    borderRadius: 11,
    paddingHorizontal: 17,
    paddingVertical: 12,
    marginTop: 5,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  helperText: {
    color: '#969184',
    fontSize: 10,
    textAlign: 'center',
  },
  modalBackground: {
    flex: 1,
    backgroundColor: '#F7F6F1',
  },
  modalContent: {
    paddingHorizontal: 22,
    paddingTop: 25,
    paddingBottom: 45,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalEyebrow: {
    color: '#969184',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  modalTitle: {
    color: '#243B53',
    fontSize: 29,
    fontWeight: '600',
    marginTop: 5,
  },
  closeButton: {
    color: '#243B53',
    fontSize: 22,
    padding: 8,
  },
  fieldLabel: {
    color: '#77776F',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#FFFEFA',
    borderWidth: 1,
    borderColor: '#E8E4DA',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#243B53',
    fontSize: 14,
  },
  categoryOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  optionChip: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#E3E0D7',
    backgroundColor: '#FFFEFA',
  },
  optionChipActive: {
    backgroundColor: '#243B53',
    borderColor: '#243B53',
  },
  optionText: {
    color: '#77776F',
    fontSize: 11,
  },
  optionTextActive: {
    color: '#FFFFFF',
  },
  colorInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  colorPreview: {
    width: 35,
    height: 35,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E1D8',
  },
  colorInput: {
    flex: 1,
  },
  extraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optional: {
    color: '#AAA69B',
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1,
  },
  removeColorButton: {
    width: 35,
    height: 35,
    borderRadius: 10,
    backgroundColor: '#EEEAE1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeColorText: {
    color: '#243B53',
    fontSize: 22,
  },
  addColorButton: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C9C4B8',
    alignItems: 'center',
  },
  addColorText: {
    color: '#596D7E',
    fontSize: 12,
    fontWeight: '600',
  },
  photoButton: {
    height: 130,
    backgroundColor: '#FFFEFA',
    borderWidth: 1,
    borderColor: '#E8E4DA',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoButtonText: {
    color: '#596D7E',
    fontSize: 13,
    fontWeight: '600',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  saveButton: {
    backgroundColor: '#243B53',
    borderRadius: 13,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    padding: 14,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#A64B45',
    fontSize: 12,
    fontWeight: '600',
  },

  inlineColorPicker: {
    backgroundColor: '#F7F6F1',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E3E0D7',
    padding: 15,
    marginBottom: 18,
    maxHeight: 390,
  },
  colorPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(25, 34, 42, 0.48)',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 35,
  },
  colorPickerPanel: {
    backgroundColor: '#F7F6F1',
    borderRadius: 22,
    padding: 20,
    maxHeight: '90%',
  },
  colorPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  colorPickerTitle: {
    color: '#243B53',
    fontSize: 25,
    fontWeight: '600',
    marginTop: 5,
  },
  colorPickerDescription: {
    color: '#77776F',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 10,
    marginBottom: 15,
  },
  colorPickerScroll: {
    flexGrow: 0,
  },
  paletteFamily: {
    marginBottom: 17,
  },
  paletteFamilyTitle: {
    color: '#243B53',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  paletteSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(36, 59, 83, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paletteSwatchSelected: {
    borderWidth: 3,
    borderColor: '#243B53',
  },
  paletteCheck: {
    color: '#243B53',
    fontSize: 15,
    fontWeight: '800',
    textShadowColor: '#FFFFFF',
    textShadowRadius: 3,
  },
  colorPickerCancel: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#EAE7DE',
    alignItems: 'center',
  },
  colorPickerCancelText: {
    color: '#243B53',
    fontSize: 13,
    fontWeight: '600',
  },
});
