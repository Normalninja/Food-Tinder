import { vi } from 'vitest';
import '@testing-library/jest-dom';
// Mock opening_hours early to avoid SSR/transform issues in the test runner
vi.mock('opening_hours', () => ({
  default: function OpeningHours(spec) { this.spec = spec; this.getState = () => null; }
}));

// Mock local session module to avoid importing firebase during tests
vi.mock('./session', () => ({
  createSession: vi.fn(async () => ({ source: 'local' })),
  getSession: vi.fn(async () => ({})),
  addVote: vi.fn(async () => ({})),
  onSessionUpdate: vi.fn(() => () => {}),
}));
// Note: we'll spy on the real Overpass module per-test to control the fetchPlacesOSM return value.

import React from 'react';
import { render, screen } from '@testing-library/react';
import axios from 'axios';

// Simple axios.post mock for test environment
beforeAll(() => {
  vi.spyOn(axios, 'post').mockImplementation(async (url, body) => {
    if (url.includes('createSessionWithParameters')) return { data: { session_id: 'session1' } };
    if (url.includes('trackUserAgreement')) return { data: { message: 'User agreement tracked' } };
    return { data: {} };
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  if (globalThis.navigator && globalThis.navigator.geolocation && globalThis.navigator.geolocation._restore) {
    globalThis.navigator.geolocation._restore();
  }
});

test('renders Food Tinder heading', async () => {
  const { default: App } = await import('./App');
  render(React.createElement(App));
  const headingElement = screen.getByText(/Food Tinder/i);
  expect(headingElement).toBeInTheDocument();
});

test('renders No more places subheading', async () => {
  const { default: App } = await import('./App');
  render(React.createElement(App));
  const subheadingElement = screen.getByText(/No more places/i);
  expect(subheadingElement).toBeInTheDocument();
});

test('renders Show Consensus button', async () => {
  const { default: App } = await import('./App');
  render(React.createElement(App));
  const buttonElement = screen.getByText(/Show Consensus/i);
  expect(buttonElement).toBeInTheDocument();
});

test('creates a session and displays fetched places', async () => {
  // Arrange: mock geolocation and Overpass fetch
  globalThis.navigator = globalThis.navigator || {};
  const mockGeo = {
    getCurrentPosition: (success) => success({ coords: { latitude: 1.0, longitude: 1.0 } }),
  };
  mockGeo._restore = () => { delete globalThis.navigator.geolocation; };
  globalThis.navigator.geolocation = mockGeo;

  const mockPlaces = [
    { place_id: 'node/1', name: 'X', tags: {}, lat: 1, lon: 1, opening_hours: null },
  ];

  const overpass = await import('./api/overpass');
  vi.spyOn(overpass, 'fetchPlacesOSM').mockResolvedValueOnce(mockPlaces);

  const session = await vi.importMock('./session');

  // Act
  const { default: App } = await import('./App');
  render(React.createElement(App));

  const createBtn = screen.getByRole('button', { name: /Create Session/i });
  createBtn.click();

  // Assert: wait for place to appear
  const place = await screen.findByText('X');
  expect(place).toBeInTheDocument();
});

test('likes places and shows consensus', async () => {
  // Arrange similar to create session but with two places
  globalThis.navigator = globalThis.navigator || {};
  const mockGeo = { getCurrentPosition: (success) => success({ coords: { latitude: 1.0, longitude: 1.0 } }), _restore: () => { delete globalThis.navigator.geolocation; } };
  globalThis.navigator.geolocation = mockGeo;

  const mockPlaces = [
    { place_id: 'node/1', name: 'A', tags: {}, lat: 1, lon: 1, opening_hours: null },
    { place_id: 'node/2', name: 'B', tags: {}, lat: 1.1, lon: 1.1, opening_hours: null },
  ];
  const overpass = await import('./api/overpass');
  vi.spyOn(overpass, 'fetchPlacesOSM').mockResolvedValue(mockPlaces);

  const session = await vi.importMock('./session');
  session.getSession.mockResolvedValue({ participants: { user1: {} }, places: mockPlaces, votes: {} });

  const { default: App } = await import('./App');
  render(React.createElement(App));

  // create session to load places
  screen.getByRole('button', { name: /Create Session/i }).click();
  await screen.findByText('A');

  // Like first place (exact match to avoid matching 'Dislike')
  screen.getByRole('button', { name: /^Like$/i }).click();
  // Like second place (advance index)
  await screen.findByText('B');
  screen.getByRole('button', { name: /^Like$/i }).click();

  // After swiping through, the UI should show 'No more places' and allow consensus
  await screen.findByText(/No more places/i);
  // Provide a session snapshot representing likes (ensure it's returned when Show Consensus runs)
  session.getSession.mockResolvedValueOnce({ participants: { user1: {} }, places: mockPlaces, votes: { 'node/1': ['user1'], 'node/2': ['user1'] } });
  screen.getByRole('button', { name: /Show Consensus/i }).click();

  // Consensus header should appear
  const consHeader = await screen.findByText(/Consensus/i);
  expect(consHeader).toBeInTheDocument();
  expect(screen.getByText(/A/)).toBeInTheDocument();
});