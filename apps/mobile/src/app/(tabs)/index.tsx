import { Text, View, StyleSheet } from 'react-native';
import Screen, { styles as shared } from '../../components/Screen';

export default function HomeScreen() {
  return (
    <Screen
      showBrandLogo
      title="Your personal style"
      subtitle="Build a wardrobe that works together."
    >
      <View style={shared.card}>
        <Text style={styles.sectionLabel}>YOUR STYLE PROFILE</Text>
        <Text style={shared.cardTitle}>Discover your colors</Text>
        <Text style={shared.body}>
          Find the color palette that complements your personal style.
        </Text>
        <View style={styles.palette}>
          {['#D6B69A', '#A8A58B', '#6E7C70', '#34495E', '#D4C9B8'].map((color) => (
            <View key={color} style={[styles.swatch, { backgroundColor: color }]} />
          ))}
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Your wardrobe</Text>
        <Text style={styles.smallLabel}>GET STARTED</Text>
      </View>

      <View style={shared.card}>
        <Text style={shared.cardTitle}>Create your wardrobe</Text>
        <Text style={shared.body}>
          Add your clothes and let Swatchwell help you discover new combinations.
        </Text>
      </View>

      <View style={shared.card}>
        <Text style={shared.cardTitle}>Outfit inspiration</Text>
        <Text style={shared.body}>
          Your outfit recommendations will appear here once your wardrobe is ready.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: '#969184',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.7,
  },
  palette: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 7,
  },
  swatch: {
    flex: 1,
    height: 42,
    borderRadius: 9,
  },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#243B53',
    fontSize: 20,
    fontWeight: '600',
  },
  smallLabel: {
    color: '#969184',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
});
