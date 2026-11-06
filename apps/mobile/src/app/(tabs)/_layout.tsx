import { Tabs } from 'expo-router';
import { Text } from 'react-native';

const icons: Record<string, string> = {
  index: '⌂',
  wardrobe: '▤',
  colors: '◉',
  outfits: '◇',
  account: '○',
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#243B53',
        tabBarInactiveTintColor: '#9A9A91',
        tabBarStyle: {
          height: 82,
          paddingTop: 10,
          paddingBottom: 20,
          backgroundColor: '#FFFEFA',
          borderTopColor: '#EAE7DF',
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 21 }}>
            {icons[route.name] ?? '○'}
          </Text>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="wardrobe" options={{ title: 'Wardrobe' }} />
      <Tabs.Screen name="colors" options={{ title: 'Colors' }} />
      <Tabs.Screen name="outfits" options={{ title: 'Outfits' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
