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
  const { skipCache = false } = opts;
  const cacheKey = makePlacesKey(lat, lon, radiusMeters);
  
  // Check cache first (unless skipCache is true for fresh session data)
  if (!skipCache) {
    const cached = getCache(cacheKey);
    if (cached) {
      console.log('Returning cached places:', cached.length);
      return cached;
    }
  } else {
    console.log('Skipping cache, fetching fresh places for new session');
  }

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
      let places = (data.elements || []).map(el => {
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

      // Filter out clearly non-food or unnamed results to reduce noise (e.g., banks, ATMs)
      // Keep any place with a meaningful `name`; only actively discard when an
      // `amenity` tag explicitly indicates a non-food place.
      const allowedAmenities = new Set(['restaurant', 'cafe', 'fast_food', 'food_court', 'takeaway']);
      places = places.filter(p => {
        const name = (p.name || '').trim();
        if (!name) return false;
        if (name.toLowerCase() === 'unknown') return false;
        const amen = (p.tags && p.tags.amenity) ? String(p.tags.amenity).toLowerCase() : '';
        // If an amenity exists but is not a food-related amenity, discard it
        if (amen && !allowedAmenities.has(amen)) return false;
        // Otherwise keep the place (named places without amenity are allowed)
        return true;
      });

      // Fuzzy deduplication by normalized token Jaccard similarity + proximity
      const normalize = s => (s || '')
        .toLowerCase()
        .replace(/[’'`]/g, '')
        .replace(/[^a-z0-9\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const tokens = s => new Set((s || '').split(' ').filter(Boolean));
      const jaccard = (a, b) => {
        if (!a.size && !b.size) return 0;
        let inter = 0;
        for (const x of a) if (b.has(x)) inter++;
        const uni = new Set([...a, ...b]).size;
        return uni === 0 ? 0 : inter / uni;
      };

      // group places: for each place, try to match an existing group by name similarity
      const groups = [];
      for (const p of places) {
        const norm = normalize(p.name || '');
        const t = tokens(norm);
        let placed = false;
        for (const g of groups) {
          const sim = jaccard(t, g.tokens);
          if (sim >= 0.7) { // threshold: treat as same place (e.g., McDonald's vs MCDonalds)
            g.items.push(p);
            // keep representative that is closest to origin
            const dist2 = (a, b) => ((a.lat - b.lat) ** 2 + (a.lon - b.lon) ** 2);
            const currentBest = g.repr;
            if (dist2(p, { lat, lon }) < dist2(currentBest, { lat, lon })) {
              g.repr = p;
            }
            placed = true;
            break;
          }
        }
        if (!placed) {
          groups.push({ tokens: t, items: [p], repr: p });
        }
      }

      const deduped = groups.length > 0 ? groups.map(g => g.repr) : places;

      // Optionally augment each place with reverse-geocoded address and a static map image URL (best-effort)
      // Augmentation can be expensive (Nominatim requests); enable via opts.augment === true
      if (!opts.augment) {
        setCache(cacheKey, deduped, opts.ttlMs);
        return deduped;
      }
      
      // Augment each place with placeholder images (no address fetching for speed)
      function augmentPlace(place) {
        const out = { ...place };
        // Use placehold.co for reliable placeholder images with place names (no network call needed)
        const placeName = (out.name || 'Place').substring(0, 30); // Limit length for URL
        out.image_url = `https://placehold.co/400x300/4A90E2/FFFFFF?text=${encodeURIComponent(placeName)}`;
        return out;
      }

      const augmented = [];
      for (let i = 0; i < deduped.length; i++) {
        const item = augmentPlace(deduped[i]);
        augmented.push(item);
        // Report progress to caller if requested
        try {
          if (opts && typeof opts.onProgress === 'function') {
            opts.onProgress(i + 1, deduped.length);
          }
        } catch (e) { /* ignore progress errors */ }
      }

      // Save to cache (TTL default 10 minutes)
      setCache(cacheKey, augmented, opts.ttlMs);
      return augmented;
    } catch (e) {
      lastErr = e;
      // small backoff between endpoints
      await new Promise(res => setTimeout(res, 300 * (i + 1)));
    }
  }
  // If all endpoints failed, throw last error
  throw lastErr || new Error('No Overpass endpoints available');
}
