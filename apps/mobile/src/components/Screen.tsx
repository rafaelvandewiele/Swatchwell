import type { ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

interface ScreenProps {
  eyebrow?: string;
  showBrandLogo?: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function Screen({
  eyebrow,
  showBrandLogo = false,
  title,
  subtitle,
  children,
}: ScreenProps) {
  return (
    <ScrollView
      style={styles.background}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        {showBrandLogo ? (
          <Image
            source={require('../../assets/logo.png')}
            style={styles.brandLogo}
            resizeMode="contain"
            accessibilityLabel="Swatchwell"
          />
        ) : null}
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

export const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#F7F6F1',
  },
  content: {
    paddingHorizontal: 23,
    paddingTop: 66,
    paddingBottom: 36,
    gap: 24,
  },
  header: {
    gap: 8,
  },
  brandLogo: {
    width: 210,
    height: 65,
    alignSelf: 'flex-start',
    marginBottom: 5,
  },
  eyebrow: {
    color: '#8B887D',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.2,
  },
  title: {
    color: '#243B53',
    fontSize: 34,
    fontWeight: '600',
    letterSpacing: -1.2,
  },
  subtitle: {
    color: '#77776F',
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    backgroundColor: '#FFFEFA',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ECE9E1',
    gap: 12,
  },
  cardTitle: {
    color: '#243B53',
    fontSize: 17,
    fontWeight: '600',
  },
  body: {
    color: '#77776F',
    fontSize: 13,
    lineHeight: 20,
  },
});
