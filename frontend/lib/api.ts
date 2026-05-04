import { Platform } from 'react-native';
import { buildAuthHeaders, type Identity } from './identity';
import { isApiBaseUrlValid, normalizeApiBaseUrl } from './settings';

export type GroupOut = {
  id: string;
  name: string;
  code: string;
  is_owner: boolean;
  member_count: number;
  created_at: string;
};

export type EntryOut = {
  id: string;
  user_id: string;
  user_name: string;
  score: number;
  label: string;
  created_at: string;
  image_url: string;
};

const ensureUrl = (base: string) => {
  const cleaned = normalizeApiBaseUrl(base);
  if (!isApiBaseUrlValid(cleaned))
    throw new Error('API URL not configured. Open Settings.');
  return cleaned;
};

const safeFetch = async (
  base: string,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
) => {
  const res = await fetch(`${ensureUrl(base)}${path}`, { ...init, signal });
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : null;
  if (!res.ok) {
    const detail = (data && (data.detail || data.error)) || `Request failed (${res.status})`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return data;
};

export async function upsertUser(base: string, id: Identity, signal?: AbortSignal) {
  return safeFetch(
    base,
    '/users',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: id.userId, name: id.name, token: id.token }),
    },
    signal,
  );
}

export async function listGroups(base: string, id: Identity, signal?: AbortSignal): Promise<GroupOut[]> {
  return safeFetch(base, '/groups', { headers: { ...buildAuthHeaders(id) } }, signal);
}

export async function createGroup(
  base: string,
  id: Identity,
  name: string,
  signal?: AbortSignal,
): Promise<GroupOut> {
  return safeFetch(
    base,
    '/groups',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(id) },
      body: JSON.stringify({ name }),
    },
    signal,
  );
}

export async function joinGroup(
  base: string,
  id: Identity,
  code: string,
  signal?: AbortSignal,
): Promise<GroupOut> {
  return safeFetch(
    base,
    '/groups/join',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(id) },
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    },
    signal,
  );
}

export async function leaveOrDeleteGroup(
  base: string,
  id: Identity,
  groupId: string,
  signal?: AbortSignal,
) {
  return safeFetch(
    base,
    `/groups/${groupId}`,
    {
      method: 'DELETE',
      headers: { ...buildAuthHeaders(id) },
    },
    signal,
  );
}

export async function getLeaderboard(
  base: string,
  id: Identity,
  groupId: string,
  signal?: AbortSignal,
): Promise<EntryOut[]> {
  return safeFetch(
    base,
    `/groups/${groupId}/entries`,
    { headers: { ...buildAuthHeaders(id) } },
    signal,
  );
}

export async function submitGroupEntry(
  base: string,
  id: Identity,
  groupId: string,
  imageUri: string,
  signal?: AbortSignal,
): Promise<EntryOut> {
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
  return safeFetch(
    base,
    `/groups/${groupId}/entries`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', ...buildAuthHeaders(id) },
      body: form,
    },
    signal,
  );
}
