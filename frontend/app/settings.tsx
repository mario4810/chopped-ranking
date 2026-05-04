import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ACCENT_PRESETS,
  DEFAULT_API_BASE_URL,
  normalizeApiBaseUrl,
  useSettings,
} from '@/lib/settings';

type Probe = { ok: boolean; message: string } | null;

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, hydrated, setApiBaseUrl, setAccent, reset } = useSettings();
  const [draft, setDraft] = useState(settings.apiBaseUrl);
  const [saving, setSaving] = useState(false);
  const [probe, setProbe] = useState<Probe>(null);
  const [probing, setProbing] = useState(false);

  const accent = settings.accent;
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (hydrated) setDraft(settings.apiBaseUrl);
  }, [hydrated, settings.apiBaseUrl]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await setApiBaseUrl(draft);
      router.back();
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const test = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setProbing(true);
    setProbe(null);
    const base = normalizeApiBaseUrl(draft);
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(`${base}/health`, { signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current || abortRef.current !== controller) return;
      setProbe(
        res.ok && data?.ok
          ? { ok: true, message: `Connected · model ${data.model ?? 'unknown'}` }
          : { ok: false, message: `Server replied ${res.status}` },
      );
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        if (mountedRef.current) setProbe({ ok: false, message: 'Timed out' });
        return;
      }
      if (mountedRef.current) setProbe({ ok: false, message: e?.message ?? 'Failed to reach server' });
    } finally {
      clearTimeout(timeout);
      if (mountedRef.current && abortRef.current === controller) {
        setProbing(false);
        abortRef.current = null;
      }
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>API</Text>
            <Text style={styles.sectionHint}>
              The Chopped Rating service the app talks to.
            </Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Base URL</Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder={DEFAULT_API_BASE_URL}
                placeholderTextColor="#666"
              />
              <Text style={styles.helper}>
                Default: {DEFAULT_API_BASE_URL}
              </Text>
            </View>

            <View style={styles.row}>
              <Pressable
                onPress={test}
                disabled={probing || !draft.trim()}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnSecondary,
                  (pressed || probing) && { opacity: 0.7 },
                ]}
              >
                {probing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="pulse" size={18} color="#fff" />
                    <Text style={styles.btnSecondaryText}>Test connection</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={() => setDraft(DEFAULT_API_BASE_URL)}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnGhost,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons name="refresh" size={18} color="#9c9caa" />
                <Text style={styles.btnGhostText}>Use default</Text>
              </Pressable>
            </View>

            {probe && (
              <View
                style={[
                  styles.probe,
                  {
                    backgroundColor: probe.ok ? '#0f2a1f' : '#3a1d1d',
                    borderColor: probe.ok ? '#1dd1a155' : '#ff7b7b55',
                  },
                ]}
              >
                <Ionicons
                  name={probe.ok ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={probe.ok ? '#1dd1a1' : '#ff7b7b'}
                />
                <Text
                  style={[
                    styles.probeText,
                    { color: probe.ok ? '#9be7c8' : '#ffb4b4' },
                  ]}
                >
                  {probe.message}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Accent</Text>
            <Text style={styles.sectionHint}>Pick a color for buttons and highlights.</Text>
            <View style={styles.swatchGrid}>
              {ACCENT_PRESETS.map((p) => {
                const selected = p.value.toLowerCase() === accent.toLowerCase();
                return (
                  <Pressable
                    key={p.value}
                    onPress={() => setAccent(p.value)}
                    accessibilityLabel={`Accent ${p.name}`}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.swatch,
                      { backgroundColor: p.value },
                      selected && styles.swatchSelected,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    {selected && (
                      <Ionicons name="checkmark" size={20} color="#0b0b0f" />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.sectionHint}>
              Chopped Scanner — for entertainment purposes only. The model is a
              public face-attractiveness classifier; results are not a measure
              of any person&apos;s actual appearance.
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
          <Pressable
            onPress={async () => {
              await reset();
              setDraft(DEFAULT_API_BASE_URL);
            }}
            style={({ pressed }) => [
              styles.btn,
              styles.btnGhost,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.btnGhostText}>Reset</Text>
          </Pressable>
          <Pressable
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: accent },
              (pressed || saving) && { opacity: 0.85 },
              { flex: 2 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#0b0b0f" />
            ) : (
              <Text style={styles.btnPrimaryText}>Save</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0f' },
  container: { padding: 20, gap: 24, paddingBottom: 24 },
  section: {
    backgroundColor: '#15151c',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#23232f',
    gap: 10,
  },
  sectionTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionHint: { color: '#9c9caa', fontSize: 13, lineHeight: 19 },
  field: { gap: 8, marginTop: 4 },
  fieldLabel: {
    color: '#cfcfd6',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: '#0b0b0f',
    borderColor: '#23232f',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  helper: { color: '#666', fontSize: 12 },
  row: { flexDirection: 'row', gap: 10 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    flex: 1,
  },
  btnPrimaryText: { color: '#0b0b0f', fontWeight: '800', fontSize: 15 },
  btnSecondary: {
    backgroundColor: '#1c1c25',
    borderWidth: 1,
    borderColor: '#2a2a37',
  },
  btnSecondaryText: { color: '#fff', fontWeight: '700' },
  btnGhost: { backgroundColor: 'transparent' },
  btnGhostText: { color: '#9c9caa', fontWeight: '600' },
  probe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  probeText: { flex: 1, fontSize: 13 },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: '#fff',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#16161d',
    backgroundColor: '#0b0b0f',
  },
});
