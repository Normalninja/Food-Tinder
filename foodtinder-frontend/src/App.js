import React, { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [places, setPlaces] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [consensus, setConsensus] = useState([]);
  const [placeDetails, setPlaceDetails] = useState(null);
  const [sessionID, setSessionID] = useState('session1'); // Replace with actual session ID
  const [userID, setUserID] = useState('user1'); // Replace with actual user ID
  const [distance, setDistance] = useState(1000);
  const [price, setPrice] = useState(2);
  const [rating, setRating] = useState(4.0);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);

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
  }, []);

  const handleCreateSession = () => {
    if (latitude === null || longitude === null) {
      console.error('Location not available');
      return;
    }

    axios.post('http://localhost:8080/createSessionWithParameters', {
      session_id: sessionID,
      distance: distance,
      price: price,
      rating: rating,
      latitude: latitude,
      longitude: longitude
    })
      .then(response => {
        // Fetch initial places and parameters from the backend
        axios.get('http://localhost:8080/getNearbyPlaces', {
          params: {
            session_id: sessionID,
            user_id: userID,
          }
        })
          .then(response => {
            setPlaces(response.data.places);
            console.log('Places fetched:', response.data.places);
          })
          .catch(error => {
            console.error('Error fetching places:', error);
          });
      })
      .catch(error => {
        console.error('Error creating session:', error);
      });
  };

  const handleSwipe = (liked) => {
    const placeID = places[currentIndex].place_id;

    axios.post('http://localhost:8080/trackUserAgreement', {
      session_id: sessionID,
      user_id: userID,
      place_id: placeID,
      liked: liked
    }).then(response => {
      console.log('User agreement tracked');
    }).catch(error => {
      console.error('Error tracking user agreement:', error);
    });

    setCurrentIndex(currentIndex + 1);
  };

  const handleShowConsensus = () => {
    axios.post('http://localhost:8080/showConsensus', {
      session_id: sessionID
    }).then(response => {
      setConsensus(response.data);
    }).catch(error => {
      console.error('Error showing consensus:', error);
    });
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
          Price:
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label>
          Rating:
          <input type="number" step="0.1" value={rating} onChange={(e) => setRating(e.target.value)} />
        </label>
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