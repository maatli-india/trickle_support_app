import {apiGet, isUnauthorizedError} from './client';

// User lookups + a shared, app-lifetime name cache.
//
// There's no bulk "users by ids" endpoint, only GET /v1/users/{id}, so list
// screens that need a name per row (e.g. the Reports list's reporter) go
// through resolveUserName / resolveUserNames below. They:
//   • cache successful lookups for the life of the app (module-level, so the
//     cache survives re-renders, refreshes and screen changes);
//   • cache failures briefly (NEGATIVE_TTL_MS) so a deleted/broken id isn't
//     re-fetched on every refresh, but is retried later;
//   • dedupe concurrent requests — two rows asking for the same id at the
//     same moment share one in-flight HTTP call.

/** GET /v1/users/{id} — admin token gets moderation fields unsanitized. */
export const getUser = id => apiGet(`/v1/users/${encodeURIComponent(id)}`);

const NEGATIVE_TTL_MS = 2 * 60 * 1000;

// id → {name: string|null, profile: object|null, failedAt?: number}
const cache = new Map();
// id → Promise<string|null>
const inflight = new Map();

/** Best display label for a user record: name, else email, else phone. */
export const displayNameOf = user => {
  if (!user) {
    return null;
  }
  const phone = [user.phoneExt, user.phone].filter(Boolean).join(' ').trim();
  return user.name?.trim() || user.email || phone || null;
};

/**
 * Seed the cache from a user record fetched elsewhere (e.g. the full profile
 * the Report Detail screen loads), so a later list render needn't refetch.
 */
export const rememberUser = user => {
  if (user?.id) {
    cache.set(user.id, {name: displayNameOf(user), profile: user});
  }
};

const cachedEntry = id => {
  const entry = cache.get(id);
  if (!entry) {
    return null;
  }
  if (entry.failedAt && Date.now() - entry.failedAt > NEGATIVE_TTL_MS) {
    cache.delete(id); // negative entry expired — allow a retry
    return null;
  }
  return entry;
};

/**
 * Resolve one user id to a display name. Never throws.
 *
 * @param {string} id
 * @returns {Promise<string|null>} null when the id is empty or the lookup
 *          failed (failures are negatively cached for NEGATIVE_TTL_MS).
 */
export const resolveUserName = id => {
  if (!id) {
    return Promise.resolve(null);
  }
  const entry = cachedEntry(id);
  if (entry) {
    return Promise.resolve(entry.name);
  }
  const pending = inflight.get(id);
  if (pending) {
    return pending;
  }
  const request = getUser(id)
    .then(user => {
      const name = displayNameOf(user);
      cache.set(id, {name, profile: user || null});
      return name;
    })
    .catch(error => {
      // A 401 means the session expired (the client already redirects to
      // login) — don't negative-cache that, it'll succeed after re-login.
      if (!isUnauthorizedError(error)) {
        console.warn('[users] name lookup failed:', id, error?.message);
        cache.set(id, {name: null, profile: null, failedAt: Date.now()});
      }
      return null;
    })
    .finally(() => {
      inflight.delete(id);
    });
  inflight.set(id, request);
  return request;
};

/**
 * Resolve many ids at once (deduped, in parallel, through resolveUserName so
 * the cache/in-flight logic lives in one place). Never throws.
 *
 * @param {string[]} ids - may contain duplicates / empty values
 * @returns {Promise<Object<string, string|null>>} {[id]: name|null}
 */
export const resolveUserNames = async ids => {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const names = await Promise.all(unique.map(resolveUserName));
  const result = {};
  unique.forEach((id, index) => {
    result[id] = names[index];
  });
  return result;
};
