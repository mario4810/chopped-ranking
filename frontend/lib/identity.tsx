import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const KEY = 'chopped:identity:v1';

export type Identity = {
  userId: string;
  token: string;
  name: string;
};

type Ctx = {
  identity: Identity | null;
  hydrated: boolean;
  setName: (name: string) => Promise<void>;
  ensure: () => Promise<Identity>;
};

const IdentityContext = createContext<Ctx | null>(null);

const ANIMALS = [
  'Otter', 'Heron', 'Mongoose', 'Tapir', 'Lemur', 'Pangolin',
  'Capybara', 'Ocelot', 'Chinchilla', 'Wallaby', 'Coyote', 'Marmot',
];
const ADJ = [
  'Chopped', 'Aura', 'Mid', 'Cope', 'Vibey', 'Notarized',
  'Crispy', 'Marinating', 'Tactical', 'Dubious', 'Salted', 'Verified',
];

const randomName = () =>
  `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]}`;

const randomToken = () => {
  const bytes = Crypto.getRandomBytes(32);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
};

const safeUuid = () => {
  try {
    // expo-crypto polyfills randomUUID at runtime
    return Crypto.randomUUID();
  } catch {
    // very crude fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
};

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Identity>;
          if (parsed.userId && parsed.token && parsed.name) {
            if (mounted.current) setIdentity(parsed as Identity);
          }
        }
      } catch {}
      finally {
        if (mounted.current) setHydrated(true);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const persist = useCallback(async (next: Identity) => {
    setIdentity(next);
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const ensure = useCallback(async (): Promise<Identity> => {
    if (identity) return identity;
    const next: Identity = {
      userId: safeUuid(),
      token: randomToken(),
      name: randomName(),
    };
    await persist(next);
    return next;
  }, [identity, persist]);

  const setName = useCallback(
    async (name: string) => {
      const id = identity ?? (await ensure());
      const trimmed = name.trim().slice(0, 64) || randomName();
      await persist({ ...id, name: trimmed });
    },
    [identity, ensure, persist],
  );

  const value = useMemo(
    () => ({ identity, hydrated, setName, ensure }),
    [identity, hydrated, setName, ensure],
  );

  return (
    <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
  );
}

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error('useIdentity must be used inside IdentityProvider');
  return ctx;
}

export const buildAuthHeaders = (id: Identity) => ({
  Authorization: `Bearer ${id.token}`,
});
