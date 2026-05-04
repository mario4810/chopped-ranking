import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryOut, getLeaderboard, submitGroupEntry } from '@/lib/api';
import { useIdentity } from '@/lib/identity';
import { useSettings } from '@/lib/settings';

const tint = (score: number) => {
  if (score >= 80) return '#ff4d6d';
  if (score >= 60) return '#ff9f43';
  if (score >= 40) return '#feca57';
  if (score >= 20) return '#54a0ff';
  return '#1dd1a1';
};

export default function GroupLeaderboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { ensure, identity } = useIdentity();
  const accent = settings.accent;

  const [entries, setEntries] = useState<EntryOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!id) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const me = await ensure();
      const data = await getLeaderboard(settings.apiBaseUrl, me, id, controller.signal);
      if (mountedRef.current) setEntries(data);
    } catch (e: any) {
      if (e?.name !== 'AbortError' && mountedRef.current)
        setError(e?.message ?? 'Could not load leaderboard');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [ensure, id, settings.apiBaseUrl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = useCallback(
    async (source: 'camera' | 'library') => {
      if (!id) return;
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed');
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
      if (res.canceled || !res.assets[0]) return;

      setSubmitting(true);
      try {
        const me = await ensure();
        await submitGroupEntry(settings.apiBaseUrl, me, id, res.assets[0].uri);
        await refresh();
      } catch (e: any) {
        Alert.alert('Submit failed', e?.message ?? 'unknown');
      } finally {
        if (mountedRef.current) setSubmitting(false);
      }
    },
    [ensure, id, refresh, settings.apiBaseUrl],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Leaderboard' }} />
      <FlatList
        contentContainerStyle={[
          styles.container,
          { paddingBottom: 24 + insets.bottom },
        ]}
        data={entries}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => submit('camera')}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.btnSolid,
                  { backgroundColor: accent, flex: 1 },
                  (pressed || submitting) && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="camera" size={18} color="#0b0b0f" />
                <Text style={styles.btnSolidText}>Snap & submit</Text>
              </Pressable>
              <Pressable
                onPress={() => submit('library')}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.btnGhost,
                  { flex: 1 },
                  (pressed || submitting) && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="image" size={18} color="#fff" />
                <Text style={styles.btnGhostText}>From gallery</Text>
              </Pressable>
            </View>

            {submitting && (
              <View style={styles.submitting}>
                <ActivityIndicator color={accent} />
                <Text style={styles.submittingText}>Submitting your evidence…</Text>
              </View>
            )}

            {loading && (
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                <ActivityIndicator color={accent} />
              </View>
            )}
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="warning-outline" size={18} color="#ffb4b4" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <Text style={styles.listHeader}>Top of the chopping block</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const color = tint(item.score);
          const isMe = item.user_id === identity?.userId;
          return (
            <View
              style={[
                styles.row,
                isMe && { borderColor: `${accent}88`, backgroundColor: '#1c1c25' },
              ]}
            >
              <Text style={styles.rank}>#{index + 1}</Text>
              <Image
                source={{
                  uri: item.image_url,
                  headers: { Authorization: `Bearer ${identity?.token ?? ''}` },
                }}
                style={styles.avatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.user_name}
                  {isMe ? ' (you)' : ''}
                </Text>
                <Text style={[styles.label, { color }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
              <View style={styles.scoreCol}>
                <Text style={[styles.score, { color }]}>{item.score}</Text>
                <Text style={styles.scoreSlash}>/100</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              Empty leaderboard. Be the first one to volunteer for the chopping block.
            </Text>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0f' },
  container: { padding: 20, gap: 12 },
  actionRow: { flexDirection: 'row', gap: 10 },
  btnSolid: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnSolidText: { color: '#0b0b0f', fontWeight: '800' },
  btnGhost: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1c1c25',
    borderWidth: 1,
    borderColor: '#2a2a37',
  },
  btnGhostText: { color: '#fff', fontWeight: '700' },
  submitting: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  submittingText: { color: '#9c9caa' },
  listHeader: {
    color: '#9c9caa',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: '#15151c',
    borderWidth: 1,
    borderColor: '#23232f',
    borderRadius: 14,
    padding: 12,
  },
  rank: {
    color: '#9c9caa',
    fontWeight: '800',
    width: 32,
  },
  avatar: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#23232f' },
  name: { color: '#fff', fontWeight: '700' },
  label: { fontSize: 12, marginTop: 2 },
  scoreCol: { alignItems: 'flex-end' },
  score: { fontSize: 20, fontWeight: '900' },
  scoreSlash: { color: '#9c9caa', fontSize: 11 },
  empty: { color: '#9c9caa', textAlign: 'center', marginTop: 16 },
  errorBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#3a1d1d',
    borderWidth: 1,
    borderColor: '#ff7b7b55',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  errorText: { color: '#ffb4b4', flex: 1 },
});
