import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'chopped:stats:v1';

export type Stats = {
  total: number;
  sum: number;
  best: number; // lowest chopped score (less chopped = "better")
  worst: number; // highest chopped score
  lastScore: number | null;
};

const EMPTY: Stats = { total: 0, sum: 0, best: 100, worst: 0, lastScore: null };

const safeParse = (raw: string | null): Stats => {
  if (!raw) return EMPTY;
  try {
    const p = JSON.parse(raw) as Partial<Stats>;
    return {
      total: p.total ?? 0,
      sum: p.sum ?? 0,
      best: p.best ?? 100,
      worst: p.worst ?? 0,
      lastScore: p.lastScore ?? null,
    };
  } catch {
    return EMPTY;
  }
};

export function useStats() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (mountedRef.current) setStats(safeParse(raw));
      })
      .catch(() => undefined);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const record = useCallback(async (score: number) => {
    setStats((prev) => {
      const next: Stats = {
        total: prev.total + 1,
        sum: prev.sum + score,
        best: Math.min(prev.best, score),
        worst: Math.max(prev.worst, score),
        lastScore: score,
      };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const reset = useCallback(async () => {
    setStats(EMPTY);
    await AsyncStorage.removeItem(KEY).catch(() => undefined);
  }, []);

  const average = stats.total > 0 ? Math.round(stats.sum / stats.total) : 0;

  return { stats, average, record, reset };
}
