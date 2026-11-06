import { Text, View, StyleSheet } from 'react-native';
import Screen, { styles as shared } from '../../components/Screen';

const colors = [
  { name: 'Warm beige', hex: '#D6B69A' },
  { name: 'Muted olive', hex: '#A8A58B' },
  { name: 'Sage', hex: '#879487' },
  { name: 'Navy', hex: '#34495E' },
  { name: 'Soft ivory', hex: '#E8E1D5' },
];

export default function ColorsScreen() {
  return (
    <Screen
      eyebrow="Personal color analysis"
      title="Your colors"
      subtitle="Understand your palette and explore colors that work together."
    >
      <View style={shared.card}>
        <Text style={shared.cardTitle}>Color profile</Text>
        <Text style={shared.body}>
          Complete your color analysis to receive a personal seasonal palette.
        </Text>
      </View>

      <View style={shared.card}>
        <Text style={shared.cardTitle}>Explore the palette</Text>
        {colors.map((item) => (
          <View key={item.hex} style={styles.colorRow}>
            <View style={[styles.swatch, { backgroundColor: item.hex }]} />
            <View>
              <Text style={styles.colorName}>{item.name}</Text>
              <Text style={styles.hex}>{item.hex}</Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 5,
  },
  swatch: {
    width: 43,
    height: 43,
    borderRadius: 11,
  },
  colorName: {
    color: '#243B53',
    fontSize: 14,
    fontWeight: '600',
  },
  hex: {
    color: '#969184',
    fontSize: 11,
    marginTop: 3,
  },
});
