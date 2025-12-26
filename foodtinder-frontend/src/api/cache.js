// Simple localStorage cache for Overpass queries and other small payloads
const PREFIX = 'foodtinder:cache:';
const DEFAULT_TTL_MS = 1000 * 60 * 10; // 10 minutes

function makeKey(key) {
  return PREFIX + key;
}

export function setCache(key, value, ttlMs = DEFAULT_TTL_MS) {
  const payload = {
    ts: Date.now(),
    ttl: ttlMs,
    value
  };
  try {
    localStorage.setItem(makeKey(key), JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed to set cache', e);
  }
}

export function getCache(key) {
  try {
    const raw = localStorage.getItem(makeKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.ts) return null;
    if (Date.now() - parsed.ts > (parsed.ttl || DEFAULT_TTL_MS)) {
      // expired
      localStorage.removeItem(makeKey(key));
      return null;
    }
    return parsed.value;
  } catch (e) {
    console.warn('Failed to read cache', e);
    return null;
  }
}

export function clearCache(keyPrefix = '') {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(PREFIX + keyPrefix)) localStorage.removeItem(k);
    }
  } catch (e) {
    console.warn('Failed to clear cache', e);
  }
}

export function makePlacesKey(lat, lon, radiusMeters) {
  // round coords to 3 decimals (~110m) to improve cache hits
  const rLat = Math.round(lat * 1000) / 1000;
  const rLon = Math.round(lon * 1000) / 1000;
  return `places:${rLat}:${rLon}:${Math.round(radiusMeters)}`;
}
