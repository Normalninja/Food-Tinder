import React, { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [places, setPlaces] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [consensus, setConsensus] = useState([]);
  const [placeDetails, setPlaceDetails] = useState(null);
  const [sessionID, setSessionID] = useState('session1'); // Replace with actual session ID
  const [userID, setUserID] = useState('user1'); // Replace with actual user ID

  useEffect(() => {
    // Fetch initial places and parameters from the backend
    axios.get('http://localhost:8080/getNearbyPlaces', {
      params: {
        session_id: sessionID,
        user_id: userID,
      }
    })
      .then(response => {
        setPlaces(response.data.places);
      })
      .catch(error => {
        console.error('Error fetching places:', error);
      });
  }, [sessionID, userID]);

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