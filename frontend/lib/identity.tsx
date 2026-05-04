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

// Prefer Web Crypto when available (web + RN 0.81+); fall back to Math.random
// only for environments that lack it. Token entropy stays at 256 bits when
// crypto is present.
const getRandomBytes = (n: number): Uint8Array => {
  const out = new Uint8Array(n);
  const g: any = globalThis as any;
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
};

const toHex = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
};

const randomToken = () => toHex(getRandomBytes(32));

const safeUuid = () => {
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // RFC4122 v4 from random bytes
  const b = getRandomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
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
