import { fetchPlacesOSM } from './overpass';

// Basic test mocking fetch and validating caching behavior
describe('Overpass fetch + cache', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  it('fetches from network then caches', async () => {
    const fakeResp = { elements: [ { type: 'node', id: 1, lat: 1.0, lon: 1.0, tags: { name: 'X' } } ] };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => fakeResp });

    const r1 = await fetchPlacesOSM(1.0001, 1.0001, 1000);
    expect(r1.length).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Call again; should use cache and not call fetch
    const r2 = await fetchPlacesOSM(1.0001, 1.0001, 1000);
    expect(r2.length).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
