import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { fetchPlacesOSM } from './api/overpass';
import opening_hours from 'opening_hours';
import * as sessionAPI from './session';

function App() {
  const [places, setPlaces] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [consensus, setConsensus] = useState([]);
  const [placeDetails, setPlaceDetails] = useState(null);
  const [sessionID, setSessionID] = useState('session1'); // Replace with actual session ID
  const [userID, setUserID] = useState('user1'); // Replace with actual user ID
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

  const handleCreateSession = () => {
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

      // Fetch places directly from Overpass
      const fetched = await fetchPlacesOSM(latitude, longitude, distanceInMeters);

      // Try to evaluate opening_hours where present (best-effort)
      const now = new Date();
      const mapped = fetched.map(p => {
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
      const sessionWithPlaces = { ...sessionObj, places: mapped };
      await sessionAPI.createSession(sessionID, sessionWithPlaces);
      setPlaces(mapped);
      setCurrentIndex(0);
    } catch (e) {
      console.error('Error creating session (client-side):', e);
    }
  };

  const handleSwipe = (liked) => {
    const placeID = places[currentIndex].place_id;
    // For now, a like records a vote; dislikes are ignored in this prototype
    if (liked) {
      sessionAPI.addVote(sessionID, placeID, userID).catch(console.error);
    }
    setCurrentIndex(currentIndex + 1);
  };

  const handleShowConsensus = () => {
    // Compute consensus from stored session votes (best-effort)
    (async function () {
      try {
        const s = await sessionAPI.getSession(sessionID);
        if (!s) return;
        const totalParticipants = Object.keys(s.participants || {}).length || 1;
        const results = (s.places || []).map(p => {
          const likes = (s.votes && s.votes[p.place_id]) ? s.votes[p.place_id].length : 0;
          const pct = Math.round((likes / totalParticipants) * 100);
          return { ...p, agreement: pct };
        }).sort((a, b) => b.agreement - a.agreement);
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
    setCurrentIndex(0);
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
      <div>
        <h2>Create Session</h2>
        <label>
          Distance:
          <input type="number" value={distance} onChange={(e) => setDistance(e.target.value)} />
        </label>
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
      {currentIndex < places.length ? (
        <div>
          <div onClick={() => handleCardClick(places[currentIndex].place_id)}>
            <h2>{places[currentIndex].name}</h2>
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