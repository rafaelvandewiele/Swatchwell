import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Linking } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const router = useRouter();
  const handledCodes = useRef(new Set<string>());

  useEffect(() => {
    if (!supabase) return;

    let active = true;

    async function handleUrl(url: string) {
      const parsed = ExpoLinking.parse(url);
      const code = parsed.queryParams?.code;
      const recovery = parsed.queryParams?.type === 'recovery';

      if (typeof code !== 'string' || handledCodes.current.has(code)) return;

      handledCodes.current.add(code);

      const { error } = await supabase!.auth.exchangeCodeForSession(code);

      if (!active) return;

      if (error) {
        console.error('Swatchwell authentication callback failed:', error.message);
        return;
      }

      if (recovery) {
        router.replace('/(tabs)/account?recovery=1' as never);
      } else {
        router.replace('/(tabs)/account' as never);
      }
    }

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });

    void Linking.getInitialURL().then((url) => {
      if (url) return handleUrl(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
