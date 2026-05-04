import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { SettingsProvider, useSettings } from '@/lib/settings';

export const unstable_settings = {
  anchor: 'index',
};

function ThemedStack() {
  const colorScheme = useColorScheme() ?? 'dark';
  const { settings } = useSettings();
  const navTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider value={navTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0b0b0f' },
          headerTitleStyle: { color: 'white', fontWeight: '700' },
          headerTintColor: settings.accent,
          contentStyle: { backgroundColor: '#0b0b0f' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{ title: 'Settings', presentation: 'modal' }}
        />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <ThemedStack />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
