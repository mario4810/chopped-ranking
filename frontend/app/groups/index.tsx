import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createGroup,
  GroupOut,
  joinGroup,
  leaveOrDeleteGroup,
  listGroups,
  upsertUser,
} from '@/lib/api';
import { useIdentity } from '@/lib/identity';
import { useSettings } from '@/lib/settings';

export default function GroupsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { ensure } = useIdentity();
  const accent = settings.accent;

  const [groups, setGroups] = useState<GroupOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');

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
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const id = await ensure();
      // make sure server knows about us
      await upsertUser(settings.apiBaseUrl, id, controller.signal).catch(() => {});
      const list = await listGroups(settings.apiBaseUrl, id, controller.signal);
      if (mountedRef.current) setGroups(list);
    } catch (e: any) {
      if (e?.name !== 'AbortError' && mountedRef.current)
        setError(e?.message ?? 'Could not load groups');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [ensure, settings.apiBaseUrl]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => abortRef.current?.abort();
    }, [refresh]),
  );

  const onCreate = async () => {
    const name = createName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const id = await ensure();
      const g = await createGroup(settings.apiBaseUrl, id, name);
      setCreateName('');
      router.push({ pathname: '/groups/[id]', params: { id: g.id } });
    } catch (e: any) {
      Alert.alert('Could not create group', e?.message ?? 'unknown');
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async () => {
    const code = joinCode.trim();
    if (!code) return;
    setBusy(true);
    try {
      const id = await ensure();
      const g = await joinGroup(settings.apiBaseUrl, id, code);
      setJoinCode('');
      router.push({ pathname: '/groups/[id]', params: { id: g.id } });
    } catch (e: any) {
      Alert.alert('Could not join', e?.message ?? 'unknown');
    } finally {
      setBusy(false);
    }
  };

  const onLeaveOrDelete = (g: GroupOut) => {
    Alert.alert(
      g.is_owner ? 'Delete group?' : 'Leave group?',
      g.is_owner
        ? 'You created this group. Deleting removes it for everyone.'
        : 'You can rejoin with the code later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: g.is_owner ? 'Delete' : 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              const id = await ensure();
              await leaveOrDeleteGroup(settings.apiBaseUrl, id, g.id);
              refresh();
            } catch (e: any) {
              Alert.alert('Failed', e?.message ?? 'unknown');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <FlatList
        contentContainerStyle={[
          styles.container,
          { paddingBottom: 24 + insets.bottom },
        ]}
        data={groups}
        keyExtractor={(g) => g.id}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Create a group</Text>
              <Text style={styles.sectionHint}>
                Form a chopped tribunal with the homies.
              </Text>
              <View style={styles.row}>
                <TextInput
                  value={createName}
                  onChangeText={setCreateName}
                  placeholder="Group name"
                  placeholderTextColor="#666"
                  style={[styles.input, { flex: 1 }]}
                />
                <Pressable
                  onPress={onCreate}
                  disabled={busy || !createName.trim()}
                  style={({ pressed }) => [
                    styles.btnSolid,
                    { backgroundColor: accent },
                    (pressed || busy) && { opacity: 0.85 },
                  ]}
                >
                  <Text style={styles.btnSolidText}>Create</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Join with code</Text>
              <Text style={styles.sectionHint}>
                Got a 12-character invite? Paste the goods.
              </Text>
              <View style={styles.row}>
                <TextInput
                  value={joinCode}
                  onChangeText={setJoinCode}
                  placeholder="ABCDEFGHJKLM"
                  placeholderTextColor="#666"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={[styles.input, { flex: 1 }]}
                />
                <Pressable
                  onPress={onJoin}
                  disabled={busy || !joinCode.trim()}
                  style={({ pressed }) => [
                    styles.btnGhost,
                    (pressed || busy) && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.btnGhostText}>Join</Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.listHeader}>Your groups</Text>

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
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/groups/[id]', params: { id: item.id } })
            }
            onLongPress={() => onLeaveOrDelete(item)}
            style={({ pressed }) => [styles.groupRow, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.groupName}>{item.name}</Text>
              <Text style={styles.groupMeta}>
                {item.member_count} member{item.member_count === 1 ? '' : 's'} ·{' '}
                code {item.code}
                {item.is_owner ? ' · owner' : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              No groups yet. Start one above. Long-press a group to leave/delete.
            </Text>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0f' },
  container: { padding: 20, gap: 14 },
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
    fontSize: 15,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionHint: { color: '#9c9caa', fontSize: 13 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    backgroundColor: '#0b0b0f',
    borderColor: '#23232f',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
  },
  btnSolid: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnSolidText: { color: '#0b0b0f', fontWeight: '800' },
  btnGhost: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1c1c25',
    borderWidth: 1,
    borderColor: '#2a2a37',
  },
  btnGhostText: { color: '#fff', fontWeight: '700' },
  listHeader: {
    color: '#9c9caa',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15151c',
    borderColor: '#23232f',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  groupName: { color: '#fff', fontWeight: '800', fontSize: 16 },
  groupMeta: { color: '#9c9caa', fontSize: 12, marginTop: 2 },
  empty: { color: '#9c9caa', textAlign: 'center', marginTop: 12 },
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
