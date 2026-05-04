import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';

// Web is served same-origin behind a reverse proxy, so a relative path works.
// Native builds have no origin and must point at an absolute URL — left blank
// so the user is forced to configure it in Settings on first launch.
export const DEFAULT_API_BASE_URL =
  Platform.OS === 'web' ? '/api' : '';

export const isApiBaseUrlValid = (url: string) => {
  const v = url.trim();
  if (!v) return false;
  if (v.startsWith('/')) return Platform.OS === 'web';
  return /^https?:\/\//i.test(v);
};
const STORAGE_KEY = 'chopped:settings:v1';

export const ACCENT_PRESETS = [
  { name: 'Coral', value: '#ff7b7b' },
  { name: 'Peach', value: '#ff9f43' },
  { name: 'Gold', value: '#feca57' },
  { name: 'Mint', value: '#1dd1a1' },
  { name: 'Sky', value: '#54a0ff' },
  { name: 'Violet', value: '#a78bfa' },
  { name: 'Pink', value: '#f472b6' },
  { name: 'Lime', value: '#a3e635' },
] as const;

export const DEFAULT_ACCENT = ACCENT_PRESETS[0].value;

export type Settings = {
  apiBaseUrl: string;
  accent: string;
};

export const normalizeApiBaseUrl = (url: string) =>
  url.trim().replace(/\/+$/, '');

type SettingsContextValue = {
  settings: Settings;
  hydrated: boolean;
  setApiBaseUrl: (url: string) => Promise<void>;
  setAccent: (color: string) => Promise<void>;
  reset: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

const DEFAULTS: Settings = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  accent: DEFAULT_ACCENT,
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && mounted.current) {
          const parsed = JSON.parse(raw) as Partial<Settings>;
          const cleaned = normalizeApiBaseUrl(parsed.apiBaseUrl || '');
          setSettings({
            apiBaseUrl: cleaned || DEFAULT_API_BASE_URL,
            accent: parsed.accent || DEFAULT_ACCENT,
          });
        }
      } catch {
        // ignore corrupted storage; defaults will apply
      } finally {
        if (mounted.current) setHydrated(true);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const persist = useCallback(async (next: Settings) => {
    setSettings(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best-effort; UI state still updated
    }
  }, []);

  const setApiBaseUrl = useCallback(
    async (url: string) => {
      // empty input falls back to platform default ('/api' on web, '' on native)
      const cleaned = normalizeApiBaseUrl(url);
      await persist({ ...settings, apiBaseUrl: cleaned || DEFAULT_API_BASE_URL });
    },
    [persist, settings],
  );

  const setAccent = useCallback(
    async (color: string) => {
      await persist({ ...settings, accent: color });
    },
    [persist, settings],
  );

  const reset = useCallback(async () => {
    await persist(DEFAULTS);
  }, [persist]);

  const value = useMemo(
    () => ({ settings, hydrated, setApiBaseUrl, setAccent, reset }),
    [settings, hydrated, setApiBaseUrl, setAccent, reset],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
