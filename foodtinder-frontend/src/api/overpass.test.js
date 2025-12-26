import { vi } from 'vitest';

// Mock the cache module to an in-memory spy-backed implementation so tests
// don't depend on `localStorage` behavior in the test environment.
vi.mock('./cache', () => {
  const mem = {};
  return {
    getCache: vi.fn((k) => mem[k] ?? null),
    setCache: vi.fn((k, v) => { mem[k] = v; }),
    clearCache: vi.fn(() => { for (const k in mem) delete mem[k]; }),
    makePlacesKey: vi.fn((lat, lon, radius) => `places:${Math.round(lat * 1000) / 1000}:${Math.round(lon * 1000) / 1000}:${Math.round(radius)}`)
  };
});

import { fetchPlacesOSM } from './overpass';

// Basic test mocking fetch and validating caching behavior (Vitest)
describe('Overpass fetch + cache', () => {
  beforeEach(() => {
    // reset fetch mock and cache module between tests
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const cache = require('./cache');
    if (cache && typeof cache.clearCache === 'function') cache.clearCache();
    if (cache && cache.getCache && cache.getCache.mockClear) cache.getCache.mockClear();
    if (cache && cache.setCache && cache.setCache.mockClear) cache.setCache.mockClear();
  });

  it('fetches from network then caches', async () => {
    const fakeResp = { elements: [ { type: 'node', id: 1, lat: 1.0, lon: 1.0, tags: { name: 'X' } } ] };
    // Provide a simple async fetch implementation returning a Response-like object
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => fakeResp }));

    const r1 = await fetchPlacesOSM(1.0001, 1.0001, 1000);
    expect(r1.length).toBe(1);
    // ensure exactly one fetch occurred (mocked cache should prevent subsequent network calls)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Call again; should use cache and not increase network call count for the same key
    const r2 = await fetchPlacesOSM(1.0001, 1.0001, 1000);
    expect(r2.length).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
