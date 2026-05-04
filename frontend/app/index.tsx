import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DAILY_DISCLAIMERS,
  EMPTY_HINTS,
  ERROR_PREFIXES,
  RETRY_LABELS,
  SUBTITLES,
  SUCCESS_QUIPS,
  TITLE_EASTER_EGG_LINES,
  VERDICT_BADGES,
  pickRandom,
} from '@/lib/copy';
import { LOADING_MESSAGES } from '@/lib/loading-messages';
import { isApiBaseUrlValid, normalizeApiBaseUrl, useSettings } from '@/lib/settings';
import { useStats } from '@/lib/stats';

type RatingResponse = {
  model: string;
  attractiveProbability: number;
  notAttractiveProbability: number;
  choppedScore: number;
  label: string;
  roasts: string[];
};

const tint = (score: number) => {
  if (score >= 80) return '#ff4d6d';
  if (score >= 60) return '#ff9f43';
  if (score >= 40) return '#feca57';
  if (score >= 20) return '#54a0ff';
  return '#1dd1a1';
};

export default function Home() {
  const router = useRouter();
  const { settings, hydrated } = useSettings();
  const { stats, average, record } = useStats();
  const insets = useSafeAreaInsets();
  const accent = settings.accent;

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<RatingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);

  // start with stable defaults so the static-rendered HTML matches the first
  // client render, then randomize after mount to avoid hydration mismatch
  const [subtitle, setSubtitle] = useState(SUBTITLES[0]);
  const [emptyHint, setEmptyHint] = useState(EMPTY_HINTS[0]);
  const [disclaimer, setDisclaimer] = useState(DAILY_DISCLAIMERS[0]);
  const [retryLabel, setRetryLabel] = useState(RETRY_LABELS[0]);
  const [successQuip, setSuccessQuip] = useState(SUCCESS_QUIPS[0]);
  const [verdictBadge, setVerdictBadge] = useState(VERDICT_BADGES[0]);

  // animated score count-up on result reveal
  const [displayScore, setDisplayScore] = useState(0);

  // title easter egg
  const titleTaps = useRef(0);
  const titleResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chefMode, setChefMode] = useState(false);
  const [eggMessage, setEggMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // randomize copy after mount (avoids SSR/CSR hydration mismatch)
  useEffect(() => {
    setSubtitle(pickRandom(SUBTITLES));
    setEmptyHint(pickRandom(EMPTY_HINTS));
    setDisclaimer(pickRandom(DAILY_DISCLAIMERS));
    setRetryLabel(pickRandom(RETRY_LABELS));
    setSuccessQuip(pickRandom(SUCCESS_QUIPS));
    setVerdictBadge(pickRandom(VERDICT_BADGES));
  }, []);

  // animate score count-up on each new result
  useEffect(() => {
    if (!result) {
      setDisplayScore(0);
      return;
    }
    const target = result.choppedScore;
    const start = performance.now();
    const duration = 850;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayScore(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [result]);

  // cleanup easter egg timer on unmount
  useEffect(() => {
    return () => {
      if (titleResetTimer.current) clearTimeout(titleResetTimer.current);
    };
  }, []);

  const tapTitle = useCallback(() => {
    if (titleResetTimer.current) clearTimeout(titleResetTimer.current);
    titleTaps.current += 1;
    titleResetTimer.current = setTimeout(() => {
      titleTaps.current = 0;
    }, 1500);
    if (titleTaps.current >= 7) {
      titleTaps.current = 0;
      setChefMode(true);
      setEggMessage(pickRandom(TITLE_EASTER_EGG_LINES));
      if (Platform.OS !== 'web')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => setEggMessage(null), 4000);
    }
  }, []);

  useEffect(() => {
    if (!loading) return;
    setLoadingMessage(
      LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)],
    );
    const id = setInterval(() => {
      setLoadingMessage((prev) => {
        let next = prev;
        while (next === prev) {
          next = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
        }
        return next;
      });
    }, 2200);
    return () => clearInterval(id);
  }, [loading]);

  const buzz = useCallback(
    (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
      if (Platform.OS !== 'web') Haptics.impactAsync(style).catch(() => {});
    },
    [],
  );

  const pickFrom = useCallback(
    async (source: 'camera' | 'library') => {
      try {
        const perm =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setError(
            source === 'camera'
              ? 'Camera permission denied'
              : 'Photo library permission denied',
          );
          return;
        }
        const opts: ImagePicker.ImagePickerOptions = {
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.9,
          cameraType: ImagePicker.CameraType.front,
        };
        const res =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync(opts)
            : await ImagePicker.launchImageLibraryAsync(opts);
        if (!res.canceled && res.assets[0] && mountedRef.current) {
          setImageUri(res.assets[0].uri);
          setResult(null);
          setError(null);
          buzz();
        }
      } catch (e: any) {
        setError(e?.message ?? 'Could not load image');
      }
    },
    [buzz],
  );

  const rate = useCallback(async () => {
    if (!imageUri || !hydrated) return;
    const base = normalizeApiBaseUrl(settings.apiBaseUrl);
    if (!isApiBaseUrlValid(base)) {
      setError(
        Platform.OS === 'web'
          ? 'API URL is not set. Open Settings to configure it.'
          : 'API URL is not configured. Open Settings and enter the server URL (e.g. http://your-server:36726/api).',
      );
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setResult(null);
    setError(null);
    buzz(Haptics.ImpactFeedbackStyle.Medium);

    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await fetch(imageUri).then((r) => r.blob());
      form.append('file', blob, 'face.jpg');
    } else {
      form.append('file', {
        uri: imageUri,
        name: 'face.jpg',
        type: 'image/jpeg',
      } as any);
    }

    try {
      const res = await fetch(`${base}/rate`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: form,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail || `Request failed (${res.status})`);
      }
      if (mountedRef.current && abortRef.current === controller) {
        const r = data as RatingResponse;
        setResult(r);
        setSuccessQuip(pickRandom(SUCCESS_QUIPS));
        setRetryLabel(pickRandom(RETRY_LABELS));
        setVerdictBadge(pickRandom(VERDICT_BADGES));
        record(r.choppedScore);
        buzz(Haptics.ImpactFeedbackStyle.Heavy);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      if (mountedRef.current) {
        const msg = e?.message ?? 'something broke';
        setError(`${pickRandom(ERROR_PREFIXES)}: ${msg}`);
      }
    } finally {
      if (mountedRef.current && abortRef.current === controller) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }, [buzz, hydrated, imageUri, settings.apiBaseUrl]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setImageUri(null);
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  const scoreColor = useMemo(
    () => (result ? tint(result.choppedScore) : accent),
    [result, accent],
  );

  const apiConfigured = hydrated && isApiBaseUrlValid(settings.apiBaseUrl);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: 32 + insets.bottom, flexGrow: 1 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Pressable onPress={tapTitle} style={{ flex: 1 }}>
            <Text style={styles.kicker}>
              Chopped Ranking{chefMode ? ' 🔪' : ''}
            </Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Open groups"
            onPress={() => {
              buzz();
              router.push('/groups');
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="people-outline" size={22} color="#fff" />
          </Pressable>
          <Pressable
            accessibilityLabel="Open settings"
            onPress={() => {
              buzz();
              router.push('/settings');
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="settings-outline" size={22} color="#fff" />
          </Pressable>
        </View>

        {stats.total > 0 && (
          <View style={styles.statsChip}>
            <Text style={styles.statsChipText}>
              Lifetime: {stats.total} judgement{stats.total === 1 ? '' : 's'} · avg {average} · best {stats.best} · worst {stats.worst}
            </Text>
          </View>
        )}

        {eggMessage && (
          <View style={styles.eggBox}>
            <Text style={styles.eggText}>👨‍🍳 {eggMessage}</Text>
          </View>
        )}

        {hydrated && !apiConfigured && (
          <Pressable
            onPress={() => {
              buzz();
              router.push('/settings');
            }}
            style={({ pressed }) => [
              styles.configBanner,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Configure API URL"
          >
            <Ionicons name="warning-outline" size={18} color="#0b0b0f" />
            <Text style={styles.configBannerText}>
              No server, no roast. Tap to point me somewhere.
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#0b0b0f" />
          </Pressable>
        )}

        <View style={styles.centered}>
        <View style={styles.canvas}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.canvasImg} />
          ) : (
            <View style={styles.canvasEmpty}>
              <Ionicons name="sparkles" size={42} color={accent} />
              <Text style={styles.canvasHint}>{emptyHint}</Text>
            </View>
          )}
        </View>

        <View style={styles.row}>
          <PrimaryButton
            icon="camera"
            label="Camera"
            color={accent}
            onPress={() => pickFrom('camera')}
          />
          <SecondaryButton
            icon="image"
            label="Gallery"
            onPress={() => pickFrom('library')}
          />
        </View>

        {imageUri && !loading && (
          <Pressable
            onPress={rate}
            style={({ pressed }) => [
              styles.cta,
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
          >
            <Text style={styles.ctaText}>Rate how chopped</Text>
          </Pressable>
        )}

        {loading && (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={styles.loaderText}>{loadingMessage}</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={18} color="#ffb4b4" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {result && (
          <View style={[styles.card, { borderColor: `${scoreColor}55` }]}>
            <Text style={styles.successQuip}>{successQuip}</Text>
            <View style={styles.scoreRow}>
              <View
                style={[
                  styles.scoreBadge,
                  { backgroundColor: `${scoreColor}22`, borderColor: scoreColor },
                ]}
              >
                <Text style={[styles.scoreNum, { color: scoreColor }]}>
                  {displayScore}
                </Text>
                <Text style={styles.scoreSlash}>/100</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: scoreColor }]}>
                  {result.label}
                </Text>
                <View style={[styles.badge, { borderColor: `${scoreColor}99` }]}>
                  <Text style={[styles.badgeText, { color: scoreColor }]}>
                    · {verdictBadge} ·
                  </Text>
                </View>
                <Text style={styles.meta}>
                  attractive {(result.attractiveProbability * 100).toFixed(1)}%
                </Text>
                <Text style={styles.meta}>
                  not-attractive{' '}
                  {(result.notAttractiveProbability * 100).toFixed(1)}%
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.roastBox}>
              {result.roasts.map((line, i) => (
                <View key={i} style={styles.roastRow}>
                  <View style={[styles.bullet, { backgroundColor: scoreColor }]} />
                  <Text style={styles.roast}>{line}</Text>
                </View>
              ))}
            </View>

            <Pressable
              onPress={reset}
              style={({ pressed }) => [
                styles.linkBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.linkBtnText}>{retryLabel}</Text>
            </Pressable>
          </View>
        )}
        </View>
        <Text style={styles.disclaimer}>{disclaimer}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PrimaryButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: color },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons name={icon} size={18} color="#0b0b0f" />
      <Text style={styles.btnPrimaryText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        styles.btnSecondary,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={18} color="#fff" />
      <Text style={styles.btnSecondaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0f' },
  container: { padding: 20, gap: 16 },
  centered: { flex: 1, justifyContent: 'center', gap: 16, width: '100%' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  kicker: { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  subtitle: { color: '#9c9caa', marginTop: 2 },
  configBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#feca57',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  configBannerText: {
    flex: 1,
    color: '#0b0b0f',
    fontWeight: '700',
    fontSize: 14,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#16161d',
    borderWidth: 1,
    borderColor: '#23232f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#15151c',
    borderWidth: 1,
    borderColor: '#23232f',
  },
  canvasImg: { width: '100%', height: '100%' },
  canvasEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  canvasHint: {
    color: '#9c9caa',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  row: { flexDirection: 'row', gap: 12 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
  },
  btnPrimary: { backgroundColor: '#ff7b7b' },
  btnPrimaryText: { color: '#0b0b0f', fontWeight: '800', fontSize: 16 },
  btnSecondary: {
    backgroundColor: '#16161d',
    borderWidth: 1,
    borderColor: '#23232f',
  },
  btnSecondaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cta: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  ctaText: { color: '#0b0b0f', fontSize: 17, fontWeight: '800' },
  loaderWrap: { alignItems: 'center', gap: 10, marginTop: 12 },
  loaderText: { color: '#9c9caa' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3a1d1d',
    borderColor: '#ff7b7b55',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
  },
  errorText: { color: '#ffb4b4', flex: 1 },
  card: {
    backgroundColor: '#15151c',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNum: { fontSize: 32, fontWeight: '900', lineHeight: 34 },
  scoreSlash: { color: '#9c9caa', fontSize: 12, marginTop: 2 },
  label: {
    fontSize: 20,
    fontWeight: '800',
    textTransform: 'capitalize',
    marginBottom: 6,
  },
  meta: { color: '#cfcfd6', fontSize: 13 },
  divider: {
    height: 1,
    backgroundColor: '#23232f',
    marginVertical: 16,
  },
  roastBox: { gap: 10 },
  roastRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  roast: { color: '#fff', fontSize: 15, flex: 1, lineHeight: 21 },
  linkBtn: { alignSelf: 'center', marginTop: 16, padding: 8 },
  linkBtnText: { color: '#9c9caa', fontWeight: '600' },
  successQuip: {
    color: '#9c9caa',
    fontStyle: 'italic',
    marginBottom: 12,
    textAlign: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  statsChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#16161d',
    borderColor: '#23232f',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statsChipText: { color: '#9c9caa', fontSize: 12, fontWeight: '600' },
  eggBox: {
    backgroundColor: '#1c1c25',
    borderColor: '#feca5755',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  eggText: { color: '#feca57', fontSize: 14, fontWeight: '700' },
  disclaimer: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 11,
    color: '#5a5a66',
    fontStyle: 'italic',
  },
});
