import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { fetchPlacesOSM } from './api/overpass';
import opening_hours from 'opening_hours';
import * as sessionAPI from './session';

function App() {
  const [places, setPlaces] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [consensus, setConsensus] = useState([]);
  const [localVotes, setLocalVotes] = useState({});
  const [placeDetails, setPlaceDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sessionID, setSessionID] = useState('session1'); // Replace with actual session ID
  const [userID, setUserID] = useState('user1'); // Replace with actual user ID
  // Multi-user simulation state
  const [simulationMode, setSimulationMode] = useState(true); // Enable 3-user simulation by default
  const [activeUser, setActiveUser] = useState('user1'); // Track which user is currently active
  const [userIndexes, setUserIndexes] = useState({ user1: 0, user2: 0, user3: 0 }); // Separate progress per user
  const [userVotes, setUserVotes] = useState({ user1: {}, user2: {}, user3: {} }); // Separate votes per user
  const [distance, setDistance] = useState(1); // Default distance
  const [distanceUnit, setDistanceUnit] = useState('miles'); // Default unit
  const [price, setPrice] = useState(2);
  const [rating, setRating] = useState(4.0);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const ws = useRef(null);

  useEffect(() => {
    // Get the user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude);
          setLongitude(position.coords.longitude);
        },
        (error) => {
          console.error('Error getting location:', error);
        }
      );
    } else {
      console.error('Geolocation is not supported by this browser.');
    }

    // This client-only prototype uses Overpass + optional Firebase/localStorage for sessions.
    // WebSocket backend is not required. We keep a ref for potential future peer signaling.
    return () => {
      if (ws.current) try { ws.current.close(); } catch (e) { /* ignore */ }
    };
  }, []);

  const handleCreateSession = async () => {
    if (latitude === null || longitude === null) {
      console.error('Location not available');
      return;
    }

    // Convert distance to meters
    const distanceInMeters = distanceUnit === 'miles' ? distance * 1609.34 : distance * 1000;

    console.log('Creating session with parameters:', {
      session_id: sessionID,
      distance: distanceInMeters,
      price: price,
      rating: rating,
      latitude: latitude,
      longitude: longitude
    });

    try {
      setLoading(true);
      setProgress(0);
      // Create a local session record (Firebase or localStorage)
      const sessionObj = {
        session_id: sessionID,
        origin: { lat: latitude, lon: longitude },
        radius: distanceInMeters,
        created_at: Date.now(),
        places: [],
        participants: { [userID]: { joined_at: Date.now() } },
        votes: {}
      };
      await sessionAPI.createSession(sessionID, sessionObj);

      // Fetch places directly from Overpass; pass progress callback during augmentation
      const fetched = await fetchPlacesOSM(latitude, longitude, distanceInMeters, {
        augment: true,
        onProgress: (current, total) => {
          try { setProgress(Math.round((current / Math.max(1, total)) * 100)); } catch (e) {}
        }
      });

      // Normalize responses: some helpers return an array, others return Overpass-style { elements: [...] }
      const nodes = Array.isArray(fetched)
        ? fetched
        : (fetched && Array.isArray(fetched.elements))
          ? fetched.elements
          : [];

      // Debug: log fetched shapes to help tests diagnose mocked responses
      try { console.debug('fetchPlacesOSM result:', fetched); } catch (e) {}

      // Try to evaluate opening_hours where present (best-effort)
      const now = new Date();
      const mapped = nodes.map(p => {
        let open = null;
        if (p.opening_hours) {
          try {
            const oh = new opening_hours(p.opening_hours);
            open = oh.getState(now);
          } catch (e) {
            open = null;
          }
        }
        return { ...p, open_now: open };
      });

      // Save places to session and set UI
      try { console.debug('mapped places count:', mapped.length, mapped); } catch (e) {}
      const sessionWithPlaces = { ...sessionObj, places: mapped };
      await sessionAPI.createSession(sessionID, sessionWithPlaces);
      setPlaces(mapped);
      setCurrentIndex(0);
    } catch (e) {
      console.error('Error creating session (client-side):', e);
    }
    finally {
      try { setLoading(false); } catch (e) {}
      try { setProgress(0); } catch (e) {}
    }
  };

  const handleSwipe = (liked) => {
    const currentUser = simulationMode ? activeUser : userID;
    const currentIdx = simulationMode ? userIndexes[activeUser] : currentIndex;
    const placeID = places[currentIdx].place_id;
    
    // For now, a like records a vote; dislikes are ignored in this prototype
    if (liked) {
      // update local vote state for quick consensus computation
      if (simulationMode) {
        // Track votes per user in simulation mode
        setUserVotes(prev => ({
          ...prev,
          [activeUser]: {
            ...prev[activeUser],
            [placeID]: true
          }
        }));
        // Also update global localVotes for consensus
        setLocalVotes(prev => ({
          ...prev,
          [placeID]: [...new Set([...(prev[placeID] || []), activeUser])]
        }));
      } else {
        setLocalVotes(prev => ({ ...prev, [placeID]: [...(prev[placeID] || []), currentUser] }));
      }
      sessionAPI.addVote(sessionID, placeID, currentUser).catch(console.error);
    }
    
    // Advance index for current user
    if (simulationMode) {
      setUserIndexes(prev => ({
        ...prev,
        [activeUser]: Math.min(prev[activeUser] + 1, places.length)
      }));
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleShowConsensus = () => {
    // Compute consensus from stored session votes (best-effort)
    (async function () {
      try {
        // Prefer local votes captured during the session for deterministic behavior
        if (Object.keys(localVotes).length > 0) {
          const s = await sessionAPI.getSession(sessionID).catch(() => ({}));
          const totalParticipants = simulationMode ? 3 : (Object.keys(s.participants || { user1: {} }).length || 1);
          const results = (places || []).map(p => {
            const likes = localVotes[p.place_id] ? localVotes[p.place_id].length : 0;
            const pct = Math.round((likes / totalParticipants) * 100);
            return { ...p, agreement: pct };
          }).sort((a, b) => b.agreement - a.agreement);
          try { console.debug('consensus results (local):', results); } catch (e) {}
          setConsensus(results);
          return;
        }

        const s = await sessionAPI.getSession(sessionID);
        if (!s) return;
        const totalParticipants = Object.keys(s.participants || {}).length || 1;
        try { console.debug('session snapshot for consensus:', s); } catch (e) {}
        const results = (s.places || []).map(p => {
          const likes = (s.votes && s.votes[p.place_id]) ? s.votes[p.place_id].length : 0;
          const pct = Math.round((likes / totalParticipants) * 100);
          return { ...p, agreement: pct };
        }).sort((a, b) => b.agreement - a.agreement);
        try { console.debug('consensus results:', results); } catch (e) {}
        setConsensus(results);
      } catch (e) { console.error(e); }
    })();
  };

  const handleCardClick = async (placeId) => {
    try {
      const response = await axios.get(`http://localhost:8080/getPlaceDetails`, {
        params: { place_id: placeId }
      });
      setPlaceDetails(response.data.result);
    } catch (error) {
      console.error('Error fetching place details:', error);
    }
  };

  const handleRestartSession = () => {
    if (simulationMode) {
      setUserIndexes({ user1: 0, user2: 0, user3: 0 });
      setUserVotes({ user1: {}, user2: {}, user3: {} });
      setLocalVotes({});
    } else {
      setCurrentIndex(0);
    }
  };

  const handleUpdateParameters = () => {
    handleCreateSession();
  };

  const handleQuit = () => {
    // Logic to quit the application (e.g., redirect to a different page or show a message)
  };

  return (
    <div className="App">
      <h1>Food Tinder</h1>
      {loading && (
        <div style={{ position: 'fixed', left: 0, right: 0, top: 0, bottom: 0, background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ width: 400, padding: 20, background: '#fff', borderRadius: 8, boxShadow: '0 3px 12px rgba(0,0,0,0.15)', textAlign: 'center' }}>
            <div style={{ marginBottom: 10 }}>Loading places... {progress}%</div>
            <div style={{ height: 10, background: '#eee', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#38a169' }} />
            </div>
          </div>
        </div>
      )}
      <div>
        <h2>Create Session</h2>
        <label>
          Distance:
          <input
            type="number"
            step="0.1"
            min="0"
            placeholder="e.g. 0.5"
            value={isNaN(distance) ? '' : distance}
            onChange={(e) => {
              const v = e.target.value;
              const n = v === '' ? 0 : parseFloat(v);
              setDistance(Number.isFinite(n) ? n : 0);
            }}
          />
        </label>
        {distance <= 0 && <div style={{ color: 'crimson' }}>Please enter a positive distance.</div>}
        <label>
          Unit:
          <select value={distanceUnit} onChange={(e) => setDistanceUnit(e.target.value)}>
            <option value="miles">Miles</option>
            <option value="kilometers">Kilometers</option>
          </select>
        </label>
        <p style={{fontStyle: 'italic'}}>Note: Price and rating filters are not implemented for the OSM prototype.</p>
        <button onClick={handleCreateSession}>Create Session</button>
      </div>
      {simulationMode && places.length > 0 && (
        <div style={{ margin: '20px 0', padding: '15px', background: '#f0f0f0', borderRadius: 8 }}>
          <h3>Multi-User Simulation Mode</h3>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            {['user1', 'user2', 'user3'].map(u => (
              <button
                key={u}
                onClick={() => setActiveUser(u)}
                style={{
                  padding: '8px 16px',
                  background: activeUser === u ? '#4A90E2' : '#ddd',
                  color: activeUser === u ? '#fff' : '#333',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: activeUser === u ? 'bold' : 'normal'
                }}
              >
                {u === 'user1' ? 'User 1' : u === 'user2' ? 'User 2' : 'User 3'}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '14px', color: '#555' }}>
            <div>User 1: {userIndexes.user1}/{places.length} places reviewed</div>
            <div>User 2: {userIndexes.user2}/{places.length} places reviewed</div>
            <div>User 3: {userIndexes.user3}/{places.length} places reviewed</div>
          </div>
        </div>
      )}
      {(simulationMode ? userIndexes[activeUser] : currentIndex) < places.length ? (
        <div>
          <div onClick={() => handleCardClick(places[simulationMode ? userIndexes[activeUser] : currentIndex].place_id)}>
            <h2>{places[simulationMode ? userIndexes[activeUser] : currentIndex].name}</h2>
            {places[simulationMode ? userIndexes[activeUser] : currentIndex].image_url && (
              <div style={{ marginTop: 8 }}>
                <img src={places[simulationMode ? userIndexes[activeUser] : currentIndex].image_url} alt={places[simulationMode ? userIndexes[activeUser] : currentIndex].name} style={{ maxWidth: '100%', height: 'auto', borderRadius: 6 }} />
              </div>
            )}
            {places[simulationMode ? userIndexes[activeUser] : currentIndex].address && (
              <p style={{ marginTop: 6, color: '#444' }}>{places[simulationMode ? userIndexes[activeUser] : currentIndex].address}</p>
            )}
          </div>
          <button onClick={() => handleSwipe(true)}>Like</button>
          <button onClick={() => handleSwipe(false)}>Dislike</button>
        </div>
      ) : (
        <div>
          <h2>No more places</h2>
          <button onClick={handleRestartSession}>Restart with Same Parameters</button>
          <button onClick={handleUpdateParameters}>Update Parameters</button>
          <button onClick={handleQuit}>Quit</button>
          <button onClick={handleShowConsensus}>Show Consensus</button>
        </div>
      )}
      {consensus.length > 0 && (
        <div>
          <h2>Consensus</h2>
          <ul>
            {consensus.map((place, index) => (
              <li key={index}>{place.name} - {place.agreement}% agreed</li>
            ))}
          </ul>
        </div>
      )}
      {placeDetails && (
        <div>
          <h2>{placeDetails.name}</h2>
          <p>{placeDetails.description}</p>
          {/* Render other place details */}
        </div>
      )}
    </div>
  );
}

export default App;
