import { useEffect, useRef } from 'react';

import { upsertUser } from './api';
import { useIdentity } from './identity';
import { isApiBaseUrlValid, useSettings } from './settings';

/**
 * Once we have an identity AND a valid API URL, register the user with the
 * backend so subsequent bearer-token calls succeed. Re-runs if the name or
 * API URL changes. Failures are silent — calls that need auth will surface
 * their own errors.
 */
export function AuthBootstrap() {
  const { identity, hydrated, ensure } = useIdentity();
  const { settings, hydrated: settingsHydrated } = useSettings();
  const lastRef = useRef<string>('');

  useEffect(() => {
    if (!hydrated || !settingsHydrated) return;
    if (!isApiBaseUrlValid(settings.apiBaseUrl)) return;

    const key = `${settings.apiBaseUrl}|${identity?.userId ?? ''}|${identity?.name ?? ''}`;
    if (key === lastRef.current) return;
    lastRef.current = key;

    let cancelled = false;
    (async () => {
      const id = identity ?? (await ensure());
      try {
        await upsertUser(settings.apiBaseUrl, id);
      } catch {
        // swallow — first attempts may race with a cold backend
      }
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [
    hydrated,
    settingsHydrated,
    settings.apiBaseUrl,
    identity?.userId,
    identity?.name,
    ensure,
    identity,
  ]);

  return null;
}
