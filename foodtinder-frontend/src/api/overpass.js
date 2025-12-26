// Minimal Overpass helper to fetch nearby food places
import { getCache, setCache, makePlacesKey } from './cache';

// Primary and fallback Overpass endpoints
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter'
];

async function tryFetchOverpass(url, query) {
  const full = `${url}?data=${encodeURIComponent(query)}`;
  const resp = await fetch(full);
  if (!resp.ok) throw new Error(`Overpass API error: ${resp.status}`);
  return resp.json();
}

export async function fetchPlacesOSM(lat, lon, radiusMeters = 1000, opts = {}) {
  const cacheKey = makePlacesKey(lat, lon, radiusMeters);
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const query = `[
    out:json][timeout:25];(
      node(around:${radiusMeters},${lat},${lon})[amenity~"^(restaurant|cafe|fast_food|food_court|takeaway)$"];
      way(around:${radiusMeters},${lat},${lon})[amenity~"^(restaurant|cafe|fast_food|food_court|takeaway)$"];
      relation(around:${radiusMeters},${lat},${lon})[amenity~"^(restaurant|cafe|fast_food|food_court|takeaway)$"];
    );out center tags;`;

  // Try endpoints with a simple fallback; if any succeed, cache and return
  let lastErr = null;
  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    try {
      const data = await tryFetchOverpass(OVERPASS_ENDPOINTS[i], query);
      const places = (data.elements || []).map(el => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        return {
          place_id: `${el.type}/${el.id}`,
          osm_type: el.type,
          osm_id: el.id,
          name: el.tags?.name || 'Unknown',
          tags: el.tags || {},
          lat,
          lon,
          opening_hours: el.tags?.opening_hours || null,
        };
      });
      // Save to cache (TTL default 10 minutes)
      setCache(cacheKey, places, opts.ttlMs);
      return places;
    } catch (e) {
      lastErr = e;
      // small backoff between endpoints
      await new Promise(res => setTimeout(res, 300 * (i + 1)));
    }
  }
  // If all endpoints failed, throw last error
  throw lastErr || new Error('No Overpass endpoints available');
}
