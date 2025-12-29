import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { fetchPlacesOSM } from './api/overpass';
import opening_hours from 'opening_hours';
import * as sessionAPI from './session';
import { Timestamp } from 'firebase/firestore';

// Helper function to strip large base64 photo data before saving to Firebase
// Firebase has a 1MB document size limit, base64 photos can be 20-50KB each
function stripPhotosForFirebase(places) {
  return places.map(place => {
    const { image_url, photoUrl, ...placeWithoutPhotos } = place;
    // Only include image_url if it's NOT a base64 data URL (keep regular URLs)
    if (image_url && !image_url.startsWith('data:')) {
      placeWithoutPhotos.image_url = image_url;
    }
    return placeWithoutPhotos;
  });
}

function App() {
  const [screen, setScreen] = useState('menu'); // menu, parameters, qrcode, swipe, consensus
  const [places, setPlaces] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [consensus, setConsensus] = useState([]);
  const [localVotes, setLocalVotes] = useState({});
  const [placeDetails, setPlaceDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sessionID, setSessionID] = useState(''); // Generated or joined session ID
  const [userID, setUserID] = useState(''); // User's unique ID
  const [isSessionCreator, setIsSessionCreator] = useState(false); // Track if current user created the session
  const [isUpdatingParameters, setIsUpdatingParameters] = useState(false); // Track if updating existing session
  const [joinSessionInput, setJoinSessionInput] = useState(''); // For joining sessions
  // Multi-user simulation state (only for testing)
  const [simulationMode, setSimulationMode] = useState(false); // Disabled by default
  const [activeUser, setActiveUser] = useState('user1'); // Track which user is currently active
  const [userIndexes, setUserIndexes] = useState({ user1: 0, user2: 0, user3: 0 }); // Separate progress per user
  const [userVotes, setUserVotes] = useState({ user1: {}, user2: {}, user3: {} }); // Separate votes per user
  const [distance, setDistance] = useState(1); // Default distance
  const [distanceUnit, setDistanceUnit] = useState('miles'); // Default unit
  const [price, setPrice] = useState(2);
  const [rating, setRating] = useState(4.0);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [userVotedPlacesCount, setUserVotedPlacesCount] = useState(0); // Track actual vote count
  const [swipingInProgress, setSwipingInProgress] = useState(false); // Track if vote is being saved
  const [unfilteredPlaces, setUnfilteredPlaces] = useState([]); // All places before cuisine filter
  const [availableCuisines, setAvailableCuisines] = useState([]); // Unique cuisines from search
  const [selectedCuisines, setSelectedCuisines] = useState([]); // User-selected cuisines to include
  const [selectedPriceLevels, setSelectedPriceLevels] = useState([0, 1, 2, 3, 4]); // Price levels to include (0-4)
  const [minRating, setMinRating] = useState(0); // Minimum rating filter (0-5)
  const [swipeOffset, setSwipeOffset] = useState(0); // X offset for swipe animation
  const [isSwipeActive, setIsSwipeActive] = useState(false); // Track if user is actively swiping
  const [swipeStartX, setSwipeStartX] = useState(0); // Starting X position of swipe
  const [lastAction, setLastAction] = useState(null); // Store last action for undo: {placeId, liked, previousIndex}
  const ws = useRef(null);

  // Update voted count when session or places change
  React.useEffect(() => {
    if (!sessionID || !userID || !places || places.length === 0) {
      setUserVotedPlacesCount(0);
      return;
    }
    
    // Count how many places in current list this user has reviewed (voted or disliked)
    const countVotes = async () => {
      try {
        const session = await sessionAPI.getSession(sessionID);
        if (session) {
          const placeIds = new Set(places.map(p => p.place_id));
          let count = 0;
          // Count votes
          if (session.votes) {
            Object.entries(session.votes).forEach(([placeId, voters]) => {
              if (placeIds.has(placeId) && voters.includes(userID)) {
                count++;
              }
            });
          }
          // Count dislikes
          if (session.dislikes) {
            Object.entries(session.dislikes).forEach(([placeId, dislikers]) => {
              if (placeIds.has(placeId) && dislikers.includes(userID)) {
                count++;
              }
            });
          }
          console.log('User has reviewed', count, 'places out of', places.length);
          setUserVotedPlacesCount(count);
        }
      } catch (err) {
        console.error('Error counting reviews:', err);
      }
    };
    
    countVotes();
  }, [sessionID, userID, places]); // Remove currentIndex dependency to avoid race conditions

  useEffect(() => {
    // Get the user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude);
          setLongitude(position.coords.longitude);
          setLocationError('');
        },
        (error) => {
          console.error('Error getting location:', error);
          if (error.code === error.PERMISSION_DENIED) {
            setLocationError('Location permission denied. Please enable location access in your browser settings.');
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            setLocationError('Location information unavailable.');
          } else if (error.code === error.TIMEOUT) {
            setLocationError('Location request timed out.');
          } else {
            setLocationError('Unable to get location.');
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      setLocationError('Geolocation is not supported by this browser.');
    }
    
    // Check for session query parameter and auto-join
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');
    if (sessionParam) {
      console.log('Auto-joining session from URL:', sessionParam);
      setJoinSessionInput(sessionParam);
      // Clear the query parameter from URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Trigger join after a short delay to ensure state is ready
      setTimeout(() => {
        handleJoinSession(sessionParam);
      }, 500);
    }

    // This client-only prototype uses Overpass + optional Firebase/localStorage for sessions.
    // WebSocket backend is not required. We keep a ref for potential future peer signaling.
    return () => {
      if (ws.current) try { ws.current.close(); } catch (e) { /* ignore */ }
    };
  }, []);

  // Cleanup swipe state when mouse is released anywhere on the page
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSwipeActive) {
        console.log('Global mouse up detected, resetting swipe state');
        setIsSwipeActive(false);
        setSwipeOffset(0);
      }
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isSwipeActive]);

  // Poll for session updates (only for non-creators on swipe screen)
  useEffect(() => {
    if (!isSessionCreator && sessionID && screen === 'swipe') {
      console.log('Starting session polling for client');
      const pollInterval = setInterval(async () => {
        try {
          const session = await sessionAPI.getSession(sessionID);
          if (session && session.places) {
            // Check if places have changed (host updated parameters)
            const currentPlaceIds = places.map(p => p.place_id).sort().join(',');
            const newPlaceIds = session.places.map(p => p.place_id).sort().join(',');
            
            if (currentPlaceIds !== newPlaceIds) {
              console.log('Session updated by host, refreshing places');
              setPlaces(session.places);
              
              // Find the first place this user hasn't reviewed (voted or disliked) yet
              const userReviewedPlaces = new Set();
              if (session.votes) {
                Object.entries(session.votes).forEach(([placeId, voters]) => {
                  if (voters.includes(userID)) {
                    userReviewedPlaces.add(placeId);
                  }
                });
              }
              if (session.dislikes) {
                Object.entries(session.dislikes).forEach(([placeId, dislikers]) => {
                  if (dislikers.includes(userID)) {
                    userReviewedPlaces.add(placeId);
                  }
                });
              }
              
              // Skip to first unreviewed place
              const firstUnreviewedIndex = session.places.findIndex(p => !userReviewedPlaces.has(p.place_id));
              const newIndex = firstUnreviewedIndex >= 0 ? firstUnreviewedIndex : session.places.length;
              
              console.log('User has reviewed', userReviewedPlaces.size, 'places, starting at index', newIndex);
              setCurrentIndex(newIndex);
              
              alert('Host updated the session parameters. Continuing with new places.');
            }
          }
        } catch (e) {
          console.error('Error polling session:', e);
        }
      }, 3000); // Poll every 3 seconds

      return () => clearInterval(pollInterval);
    }
  }, [isSessionCreator, sessionID, screen, places]);

  const generateSessionID = () => {
    return 'session-' + Math.random().toString(36).substr(2, 9);
  };

  const generateUserID = () => {
    return 'user-' + Math.random().toString(36).substr(2, 9);
  };

  const handleJoinSession = async (sessionIdParam = null) => {
    const sessionIdToJoin = sessionIdParam || joinSessionInput.trim();
    
    if (!sessionIdToJoin) {
      alert('Please enter a session ID');
      return;
    }
    
    const newUserID = generateUserID();
    setUserID(newUserID);
    setSessionID(sessionIdToJoin);
    setIsSessionCreator(false); // Joining user is not the creator
    
    try {
      console.log('Attempting to join session:', sessionIdToJoin);
      const session = await sessionAPI.getSession(sessionIdToJoin);
      console.log('Session data:', session);
      
      if (!session) {
        alert('Session not found. Make sure:\n1. You copied the correct Session ID\n2. You are not in private/incognito mode (sessions use localStorage)\n3. The session was created in this browser');
        return;
      }
      
      if (!session.places || session.places.length === 0) {
        alert('This session has no places yet. Wait for the session creator to finish loading places.');
        return;
      }
      
      // Add this user to the session participants
      const updatedSession = {
        ...session,
        participants: {
          ...session.participants,
          [newUserID]: { joined_at: Timestamp.now() }
        }
      };
      await sessionAPI.createSession(sessionIdToJoin, updatedSession);
      
      console.log('Setting places for joined session:', session.places.length);
      
      // Set places FIRST before clearing other state
      setPlaces(session.places);
      
      // Find first place this user hasn't reviewed (voted or disliked)
      const userReviewedPlaces = new Set();
      if (session.votes) {
        Object.entries(session.votes).forEach(([placeId, voters]) => {
          if (voters.includes(newUserID)) {
            userReviewedPlaces.add(placeId);
          }
        });
      }
      if (session.dislikes) {
        Object.entries(session.dislikes).forEach(([placeId, dislikers]) => {
          if (dislikers.includes(newUserID)) {
            userReviewedPlaces.add(placeId);
          }
        });
      }
      
      const firstUnreviewedIndex = session.places.findIndex(p => !userReviewedPlaces.has(p.place_id));
      const startIndex = firstUnreviewedIndex >= 0 ? firstUnreviewedIndex : session.places.length;
      console.log('User has already reviewed', userReviewedPlaces.size, 'places, starting at index', startIndex);
      
      // Clear local state from any previous session
      setCurrentIndex(startIndex);
      setLocalVotes({});
      setConsensus([]);
      if (simulationMode) {
        setUserIndexes({ user1: 0, user2: 0, user3: 0 });
        setUserVotes({ user1: {}, user2: {}, user3: {} });
      }
      
      // Use setTimeout to ensure places state is updated before changing screen
      setTimeout(() => {
        console.log('Changing to swipe screen');
        setScreen('swipe');
      }, 0);
    } catch (e) {
      console.error('Error joining session:', e);
      alert('Could not join session: ' + e.message);
    }
  };

  const handleCreateSession = async () => {
    if (latitude === null || longitude === null) {
      alert('Location not available. Please allow location access.');
      return;
    }

    // Check if this is an update to existing session
    const isUpdate = sessionID && places.length > 0;
    console.log('handleCreateSession:', { isUpdate, sessionID, placesCount: places.length });

    // Generate new session and user IDs (only if not already set)
    const newSessionID = sessionID || generateSessionID();
    const newUserID = userID || generateUserID();
    setSessionID(newSessionID);
    setUserID(newUserID);
    setIsSessionCreator(true); // This user is creating/updating the session

    // Convert distance to meters
    const distanceInMeters = distanceUnit === 'miles' ? distance * 1609.34 : distance * 1000;

    console.log('Creating session with parameters:', {
      session_id: newSessionID,
      distance: distanceInMeters,
      price: price,
      rating: rating,
      latitude: latitude,
      longitude: longitude
    });

    try {
      setLoading(true);
      setProgress(0);
      
      // Get existing session FIRST to preserve votes, dislikes, and participants
      let existingVotes = {};
      let existingDislikes = {};
      let existingParticipants = { [newUserID]: { joined_at: Timestamp.now() } };
      try {
        const existingSession = await sessionAPI.getSession(newSessionID);
        console.log('Existing session found:', existingSession ? 'yes' : 'no');
        if (existingSession) {
          // Preserve existing participants
          if (existingSession.participants) {
            existingParticipants = existingSession.participants;
          }
          // Keep ALL existing votes and dislikes for now (will filter after fetching new places)
          if (existingSession.votes) {
            existingVotes = existingSession.votes;
            console.log('Existing votes before fetch:', existingVotes);
          }
          if (existingSession.dislikes) {
            existingDislikes = existingSession.dislikes;
            console.log('Existing dislikes before fetch:', existingDislikes);
          }
        }
      } catch (e) {
        console.log('No existing session to merge from:', e);
      }
      
      // Create a local session record (Firebase or localStorage)
      const sessionObj = {
        session_id: newSessionID,
        origin: { lat: latitude, lon: longitude },
        radius: distanceInMeters,
        created_at: Timestamp.now(), // Use Firestore Timestamp for TTL
        places: [],
        participants: existingParticipants,
        votes: existingVotes,  // Preserve existing votes
        dislikes: existingDislikes  // Preserve existing dislikes
      };

      // Fetch places directly from Overpass; pass progress callback during augmentation
      const fetched = await fetchPlacesOSM(latitude, longitude, distanceInMeters, {
        augment: true,
        skipCache: true,
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
      
      // Validate that we found places before creating the session
      if (!mapped || mapped.length === 0) {
        setLoading(false);
        setProgress(0);
        alert(`No restaurants found within ${distance} ${distanceUnit}. Try:\n• Increasing the search radius\n• Moving to a different location\n• Checking your location is correct`);
        setScreen('parameters'); // Go back to parameters screen
        return;
      }
      
      // Filter votes to only keep those for places that still exist in the new result set
      // Match by BOTH place_id AND name (because OSM can return same place with different IDs)
      const newPlaceIds = new Set(mapped.map(p => p.place_id));
      const newPlaceNames = new Set(mapped.map(p => p.name?.toLowerCase().trim()).filter(Boolean));
      
      console.log('New place IDs:', Array.from(newPlaceIds));
      console.log('New place names:', Array.from(newPlaceNames));
      console.log('Votes before filtering:', existingVotes);
      
      // Build a map of old place_id to place name from the old session
      let oldPlacesMap = {};
      try {
        const oldSession = await sessionAPI.getSession(newSessionID);
        if (oldSession && oldSession.places) {
          oldSession.places.forEach(p => {
            oldPlacesMap[p.place_id] = p.name?.toLowerCase().trim();
          });
        }
      } catch (e) {
        console.log('Could not get old places for name matching');
      }
      
      // Create a mapping from old place_ids to new place_ids based on name matching
      const oldToNewPlaceId = {};
      Object.entries(oldPlacesMap).forEach(([oldId, oldName]) => {
        if (oldName && newPlaceNames.has(oldName)) {
          // Find the new place with this name
          const newPlace = mapped.find(p => p.name?.toLowerCase().trim() === oldName);
          if (newPlace) {
            oldToNewPlaceId[oldId] = newPlace.place_id;
            console.log('Matched place by name:', oldName, 'old ID:', oldId, 'new ID:', newPlace.place_id);
          }
        }
      });
      
      // Filter and remap votes
      const filteredVotes = {};
      Object.entries(existingVotes).forEach(([oldPlaceId, voters]) => {
        if (newPlaceIds.has(oldPlaceId)) {
          // Place ID still exists - keep it
          filteredVotes[oldPlaceId] = voters;
        } else if (oldToNewPlaceId[oldPlaceId]) {
          // Place has new ID but same name - transfer votes to new ID
          const newPlaceId = oldToNewPlaceId[oldPlaceId];
          filteredVotes[newPlaceId] = [...(filteredVotes[newPlaceId] || []), ...voters];
          console.log('Transferred votes from', oldPlaceId, 'to', newPlaceId);
        }
      });
      
      // Filter and remap dislikes too
      const filteredDislikes = {};
      Object.entries(existingDislikes).forEach(([oldPlaceId, dislikers]) => {
        if (newPlaceIds.has(oldPlaceId)) {
          // Place ID still exists - keep it
          filteredDislikes[oldPlaceId] = dislikers;
        } else if (oldToNewPlaceId[oldPlaceId]) {
          // Place has new ID but same name - transfer dislikes to new ID
          const newPlaceId = oldToNewPlaceId[oldPlaceId];
          filteredDislikes[newPlaceId] = [...(filteredDislikes[newPlaceId] || []), ...dislikers];
          console.log('Transferred dislikes from', oldPlaceId, 'to', newPlaceId);
        }
      });
      
      console.log('Preserved votes after filtering and name matching:', filteredVotes);
      console.log('Vote count preserved:', Object.keys(filteredVotes).length, 'out of', Object.keys(existingVotes).length);
      console.log('Preserved dislikes after filtering and name matching:', filteredDislikes);
      console.log('Dislike count preserved:', Object.keys(filteredDislikes).length, 'out of', Object.keys(existingDislikes).length);
      
      // Strip photos before saving to Firebase (1MB document limit)
      const placesForFirebase = stripPhotosForFirebase(mapped);
      
      const sessionWithPlaces = { 
        ...sessionObj, 
        places: placesForFirebase, 
        votes: filteredVotes,
        dislikes: filteredDislikes
      };
      console.log('Creating/updating session with votes and dislikes:', { votes: filteredVotes, dislikes: filteredDislikes });
      await sessionAPI.createSession(newSessionID, sessionWithPlaces);
      
      // Extract unique cuisines from fetched places (for new sessions only)
      if (!isUpdate) {
        const cuisineSet = new Set();
        let placesWithoutCuisine = 0;
        mapped.forEach(place => {
          if (place.cuisine) {
            // Handle multiple cuisines separated by semicolon or comma
            const cuisines = place.cuisine.split(/[;,]/).map(c => c.trim()).filter(Boolean);
            cuisines.forEach(c => cuisineSet.add(c));
          } else {
            placesWithoutCuisine++;
          }
        });
        const uniqueCuisines = Array.from(cuisineSet).sort();
        
        // Add "other" category if there are places without cuisine
        if (placesWithoutCuisine > 0) {
          uniqueCuisines.push('other');
        }
        
        console.log('Available cuisines:', uniqueCuisines);
        console.log('Places without cuisine:', placesWithoutCuisine);
        setUnfilteredPlaces(mapped);
        setAvailableCuisines(uniqueCuisines);
        setSelectedCuisines(uniqueCuisines); // Select all by default
      } else {
        setPlaces(mapped);
      }
      
      // Find the first place this user hasn't voted on OR disliked yet
      if (isUpdate && (filteredVotes || filteredDislikes)) {
        const userReviewedPlaces = new Set();
        Object.entries(filteredVotes).forEach(([placeId, voters]) => {
          if (voters.includes(newUserID)) {
            userReviewedPlaces.add(placeId);
          }
        });
        Object.entries(filteredDislikes).forEach(([placeId, dislikers]) => {
          if (dislikers.includes(newUserID)) {
            userReviewedPlaces.add(placeId);
          }
        });
        
        // Count how many places in the NEW list this user has already reviewed (voted or disliked)
        const reviewedPlacesInNewList = mapped.filter(p => userReviewedPlaces.has(p.place_id));
        const reviewedCount = reviewedPlacesInNewList.length;
        
        const firstUnreviewedIndex = mapped.findIndex(p => !userReviewedPlaces.has(p.place_id));
        const newIndex = firstUnreviewedIndex >= 0 ? firstUnreviewedIndex : mapped.length;
        console.log('Host has reviewed', reviewedCount, 'places that are still in range, resuming at index', newIndex);
        setCurrentIndex(newIndex);
      } else if (!isUpdate) {
        // Only reset to 0 for brand new sessions
        setCurrentIndex(0);
      }
      // If isUpdate but no filteredVotes/Dislikes, keep currentIndex as is
      
      // Only show QR code for first-time creation, not when updating parameters
      if (isUpdate) {
        console.log('Parameter update complete, returning to swipe screen');
        setScreen('swipe'); // Go back to swiping after parameter update
      } else {
        console.log('New session created, showing cuisine selection');
        setScreen('cuisine-selection'); // Show cuisine selection before QR code
      }
    } catch (e) {
      console.error('Error creating session (client-side):', e);
      alert('Error creating session: ' + e.message);
      setScreen('parameters'); // Go back to parameters on error
    }
    finally {
      try { setLoading(false); } catch (e) {}
      try { setProgress(0); } catch (e) {}
    }
  };

  const handleSwipe = async (liked) => {
    if (swipingInProgress) {
      console.log('Vote already in progress, ignoring click');
      return;
    }
    
    setSwipingInProgress(true);
    
    const currentUser = simulationMode ? activeUser : userID;
    const currentIdx = simulationMode ? userIndexes[activeUser] : currentIndex;
    const placeID = places[currentIdx].place_id;
    
    try {
      // Store action for undo
      setLastAction({
        placeId: placeID,
        liked: liked,
        previousIndex: currentIdx
      });
      
      // Save both likes and dislikes so users don't see the same places again
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
        // Save vote to session storage and WAIT for it to complete
        await sessionAPI.addVote(sessionID, placeID, currentUser);
        console.log('Vote saved for place:', placeID, 'by user:', currentUser);
      } else {
        // Dislike - save it so user doesn't see this place again
        await sessionAPI.addDislike(sessionID, placeID, currentUser);
        console.log('Dislike saved for place:', placeID, 'by user:', currentUser);
      }
      
      // Increment counter for BOTH likes and dislikes (both are reviewed places)
      setUserVotedPlacesCount(prev => prev + 1);
      console.log('Counter incremented to:', userVotedPlacesCount + 1);
      
      // Advance index for current user - skip places already voted on
      if (simulationMode) {
        setUserIndexes(prev => ({
          ...prev,
          [activeUser]: Math.min(prev[activeUser] + 1, places.length)
        }));
        setSwipingInProgress(false);
      } else {
        // Find the next place this user hasn't voted on OR disliked
        const session = await sessionAPI.getSession(sessionID);
        let nextIndex = currentIndex + 1;
        
        if (session) {
          // Find first place that user hasn't interacted with (voted or disliked)
          while (nextIndex < places.length) {
            const nextPlaceId = places[nextIndex].place_id;
            const voters = (session.votes && session.votes[nextPlaceId]) || [];
            const dislikers = (session.dislikes && session.dislikes[nextPlaceId]) || [];
            if (!voters.includes(userID) && !dislikers.includes(userID)) {
              break; // Found a place user hasn't seen
            }
            nextIndex++; // Skip this one, already seen
          }
        }
        
        console.log('Moving from index', currentIndex, 'to', nextIndex, '(skipped', nextIndex - currentIndex - 1, 'already-reviewed places)');
        setCurrentIndex(nextIndex);
        setSwipingInProgress(false);
      }
    } catch (err) {
      console.error('Error during swipe:', err);
      setSwipingInProgress(false);
      // Still advance to avoid getting stuck
      if (simulationMode) {
        setUserIndexes(prev => ({
          ...prev,
          [activeUser]: Math.min(prev[activeUser] + 1, places.length)
        }));
      } else {
        setCurrentIndex(currentIndex + 1);
      }
    }
  };

  const handleShowConsensus = () => {
    // Compute consensus from stored session votes (always read from session for cross-tab sync)
    (async function () {
      try {
        const s = await sessionAPI.getSession(sessionID);
        if (!s) {
          alert('Session not found');
          return;
        }
        
        const totalParticipants = Object.keys(s.participants || {}).length || 1;
        console.log('Calculating consensus:', {
          totalParticipants,
          votes: s.votes,
          places: (s.places || []).length
        });
        
        const results = (s.places || places || [])
          .map(p => {
            const likes = (s.votes && s.votes[p.place_id]) ? s.votes[p.place_id].length : 0;
            const pct = Math.round((likes / totalParticipants) * 100);
            return { ...p, agreement: pct, voteCount: likes };
          })
          .filter(p => p.voteCount >= 2) // Only show places with 2+ votes
          .sort((a, b) => b.agreement - a.agreement);
        
        console.log('Consensus results (2+ votes only):', results);
        setConsensus(results);
      } catch (e) { 
        console.error('Error calculating consensus:', e);
        alert('Error calculating consensus: ' + e.message);
      }
    })();
  };

  const handleCardClick = async (placeId) => {
    // This feature requires a backend server - currently disabled
    console.log('Place details for:', placeId);
    // TODO: Implement place details view using Google Places API directly
    /*
    try {
      const response = await axios.get(`http://localhost:8080/getPlaceDetails`, {
        params: { place_id: placeId }
      });
      setPlaceDetails(response.data.result);
    } catch (error) {
      console.error('Error fetching place details:', error);
    }
    */
  };

  const handleRestartSession = async () => {
    if (simulationMode) {
      setUserIndexes({ user1: 0, user2: 0, user3: 0 });
      setUserVotes({ user1: {}, user2: {}, user3: {} });
      setLocalVotes({});
    } else {
      // Clear all votes and dislikes for this user from Firebase
      try {
        const session = await sessionAPI.getSession(sessionID);
        if (session) {
          const updatedVotes = {};
          const updatedDislikes = {};
          
          // Remove this user from all vote arrays
          Object.entries(session.votes || {}).forEach(([placeId, voters]) => {
            const filteredVoters = voters.filter(v => v !== userID);
            if (filteredVoters.length > 0) {
              updatedVotes[placeId] = filteredVoters;
            }
          });
          
          // Remove this user from all dislike arrays
          Object.entries(session.dislikes || {}).forEach(([placeId, dislikers]) => {
            const filteredDislikers = dislikers.filter(d => d !== userID);
            if (filteredDislikers.length > 0) {
              updatedDislikes[placeId] = filteredDislikers;
            }
          });
          
          // Update session with cleared votes
          await sessionAPI.createSession(sessionID, {
            ...session,
            votes: updatedVotes,
            dislikes: updatedDislikes
          });
          
          console.log('User votes and dislikes cleared, restarting from beginning');
        }
      } catch (e) {
        console.error('Error clearing user votes:', e);
      }
      
      setCurrentIndex(0);
      setUserVotedPlacesCount(0);
      setLastAction(null);
    }
  };

  const handleUndo = async () => {
    if (!lastAction || swipingInProgress) {
      return;
    }
    
    setSwipingInProgress(true);
    
    try {
      const { placeId, liked, previousIndex } = lastAction;
      
      // Remove the vote or dislike from Firebase
      if (liked) {
        // Remove from votes
        const session = await sessionAPI.getSession(sessionID);
        if (session && session.votes && session.votes[placeId]) {
          const updatedVoters = session.votes[placeId].filter(v => v !== userID);
          const updatedVotes = { ...session.votes };
          
          if (updatedVoters.length > 0) {
            updatedVotes[placeId] = updatedVoters;
          } else {
            delete updatedVotes[placeId];
          }
          
          await sessionAPI.createSession(sessionID, {
            ...session,
            votes: updatedVotes
          });
        }
      } else {
        // Remove from dislikes
        const session = await sessionAPI.getSession(sessionID);
        if (session && session.dislikes && session.dislikes[placeId]) {
          const updatedDislikers = session.dislikes[placeId].filter(d => d !== userID);
          const updatedDislikes = { ...session.dislikes };
          
          if (updatedDislikers.length > 0) {
            updatedDislikes[placeId] = updatedDislikers;
          } else {
            delete updatedDislikes[placeId];
          }
          
          await sessionAPI.createSession(sessionID, {
            ...session,
            dislikes: updatedDislikes
          });
        }
      }
      
      // Go back to previous index
      setCurrentIndex(previousIndex);
      setUserVotedPlacesCount(prev => Math.max(0, prev - 1));
      setLastAction(null);
      
      console.log('Undid last action, returned to index', previousIndex);
    } catch (e) {
      console.error('Error undoing action:', e);
    } finally {
      setSwipingInProgress(false);
    }
  };

  const handleQuitSession = async () => {
    if (!sessionID) {
      setScreen('menu');
      return;
    }

    // Show different warnings for creator vs client
    if (isSessionCreator) {
      const confirmQuit = window.confirm(
        'You are the session creator. Quitting will END this session for ALL participants.\n\n' +
        'All votes and progress will be lost.\n\n' +
        'Are you sure you want to end the session?'
      );
      
      if (!confirmQuit) return;
      
      try {
        // Delete the session entirely
        await sessionAPI.createSession(sessionID, null);
        console.log('Session ended by creator');
      } catch (e) {
        console.error('Error ending session:', e);
      }
    } else {
      const confirmQuit = window.confirm(
        'Are you sure you want to leave this session?\n\n' +
        'Your votes will be removed and you will need to rejoin to continue.'
      );
      
      if (!confirmQuit) return;
      
      try {
        const session = await sessionAPI.getSession(sessionID);
        if (session) {
          // Remove this user from participants
          const updatedParticipants = { ...session.participants };
          delete updatedParticipants[userID];
          
          // Remove this user's votes
          const updatedVotes = {};
          Object.entries(session.votes || {}).forEach(([placeId, voters]) => {
            const filteredVoters = voters.filter(v => v !== userID);
            if (filteredVoters.length > 0) {
              updatedVotes[placeId] = filteredVoters;
            }
          });
          
          // Update the session
          const updatedSession = {
            ...session,
            participants: updatedParticipants,
            votes: updatedVotes
          };
          await sessionAPI.createSession(sessionID, updatedSession);
          console.log('User removed from session');
        }
      } catch (e) {
        console.error('Error leaving session:', e);
      }
    }
    
    // Reset local state and return to menu
    setSessionID('');
    setUserID('');
    setIsSessionCreator(false);
    setPlaces([]);
    setCurrentIndex(0);
    setLocalVotes({});
    setConsensus([]);
    setScreen('menu');
  };

  const handleUpdateParameters = () => {
    handleCreateSession();
  };

  const handleApplyCuisineFilter = async () => {
    try {
      // Filter places based on selected cuisines, price levels, and rating
      let filteredPlaces = unfilteredPlaces;
      
      if (selectedCuisines.length > 0 && selectedCuisines.length < availableCuisines.length) {
        // Only filter if not all cuisines are selected
        filteredPlaces = filteredPlaces.filter(place => {
          if (!place.cuisine) {
            // Include places without cuisine if 'other' is selected
            return selectedCuisines.includes('other');
          }
          
          // Check if any of the place's cuisines match selected cuisines
          const placeCuisines = place.cuisine.split(/[;,]/).map(c => c.trim()).filter(Boolean);
          return placeCuisines.some(c => selectedCuisines.includes(c));
        });
      }
      
      // Filter by price level
      if (selectedPriceLevels.length < 5) {
        filteredPlaces = filteredPlaces.filter(place => {
          const priceLevel = place.priceLevel;
          // If no price data, include it (don't filter out)
          if (priceLevel === null || priceLevel === undefined) return true;
          return selectedPriceLevels.includes(priceLevel);
        });
      }
      
      // Filter by minimum rating
      if (minRating > 0) {
        filteredPlaces = filteredPlaces.filter(place => {
          const rating = place.rating || place.stars;
          // If no rating data, include it (don't filter out)
          if (!rating) return true;
          return rating >= minRating;
        });
      }
      
      console.log('Filtered to', filteredPlaces.length, 'places with selected filters');
      
      if (filteredPlaces.length === 0) {
        alert('No places found with the selected filters. Please adjust your selections.');
        return;
      }
      
      setPlaces(filteredPlaces);
      
      // Generate unique session ID and user ID if not already set
      let sessID = sessionID;
      let usrID = userID;
      
      if (!sessID) {
        sessID = 'session-' + Math.random().toString(36).substring(2, 15);
        setSessionID(sessID);
      }
      
      if (!usrID) {
        usrID = 'user-' + Math.random().toString(36).substring(2, 15);
        setUserID(usrID);
        setIsSessionCreator(true);
      }
      
      // Strip out large data (base64 photos) before saving to Firebase
      // Keep photos in localStorage only - Firebase has 1MB document limit
      const placesForFirebase = filteredPlaces.map(place => {
        const { image_url, photoUrl, ...placeWithoutPhotos } = place;
        // Only include image_url if it's NOT a base64 data URL (keep regular URLs)
        if (image_url && !image_url.startsWith('data:')) {
          placeWithoutPhotos.image_url = image_url;
        }
        return placeWithoutPhotos;
      });
      
      // Save session with filtered places (without base64 photos)
      await sessionAPI.createSession(sessID, {
        places: placesForFirebase,
        created_at: Timestamp.now(),
        participants: { [usrID]: { joined_at: Timestamp.now() } },
        votes: {},
        dislikes: {}
      });
      
      console.log('Session created with filtered places:', sessID);
      setCurrentIndex(0);
      setScreen('qrcode');
    } catch (e) {
      console.error('Error applying cuisine filter:', e);
      alert('Error creating session: ' + e.message);
    }
  };

  const toggleCuisine = (cuisine) => {
    setSelectedCuisines(prev => {
      if (prev.includes(cuisine)) {
        return prev.filter(c => c !== cuisine);
      } else {
        return [...prev, cuisine];
      }
    });
  };

  const selectAllCuisines = () => {
    setSelectedCuisines([...availableCuisines]);
  };

  const deselectAllCuisines = () => {
    setSelectedCuisines([]);
  };

  const togglePriceLevel = (level) => {
    setSelectedPriceLevels(prev => {
      if (prev.includes(level)) {
        return prev.filter(l => l !== level);
      } else {
        return [...prev, level].sort((a, b) => a - b);
      }
    });
  };

  const selectAllPriceLevels = () => {
    setSelectedPriceLevels([0, 1, 2, 3, 4]);
  };

  // Swipe gesture handlers
  const SWIPE_THRESHOLD = 100; // Minimum pixels to trigger a swipe

  const handleTouchStart = (e) => {
    if (swipingInProgress) return;
    setIsSwipeActive(true);
    setSwipeStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e) => {
    if (!isSwipeActive || swipingInProgress) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - swipeStartX;
    setSwipeOffset(diff);
  };

  const handleTouchEnd = () => {
    if (!isSwipeActive || swipingInProgress) return;
    setIsSwipeActive(false);
    
    console.log('Touch end - swipeOffset:', swipeOffset, 'threshold:', SWIPE_THRESHOLD);
    
    if (Math.abs(swipeOffset) > SWIPE_THRESHOLD) {
      // Trigger like/dislike based on swipe direction
      console.log('Swipe detected! Direction:', swipeOffset > 0 ? 'RIGHT (like)' : 'LEFT (dislike)');
      if (swipeOffset > 0) {
        handleSwipe(true); // Swipe right = like
      } else {
        handleSwipe(false); // Swipe left = dislike
      }
    } else {
      console.log('Swipe too short, not triggering action');
    }
    
    setSwipeOffset(0);
  };

  const handleMouseDown = (e) => {
    if (swipingInProgress) return;
    e.preventDefault(); // Prevent text selection while dragging
    setIsSwipeActive(true);
    setSwipeStartX(e.clientX);
  };

  const handleMouseMove = (e) => {
    if (!isSwipeActive || swipingInProgress) return;
    e.preventDefault();
    const currentX = e.clientX;
    const diff = currentX - swipeStartX;
    setSwipeOffset(diff);
  };

  const handleMouseUp = (e) => {
    if (!isSwipeActive || swipingInProgress) {
      setIsSwipeActive(false); // Reset even if already in progress
      setSwipeOffset(0);
      return;
    }
    
    e.preventDefault();
    setIsSwipeActive(false);
    
    console.log('Mouse up - swipeOffset:', swipeOffset, 'threshold:', SWIPE_THRESHOLD);
    
    if (Math.abs(swipeOffset) > SWIPE_THRESHOLD) {
      // Trigger like/dislike based on swipe direction
      console.log('Swipe detected! Direction:', swipeOffset > 0 ? 'RIGHT (like)' : 'LEFT (dislike)');
      if (swipeOffset > 0) {
        handleSwipe(true); // Swipe right = like
      } else {
        handleSwipe(false); // Swipe left = dislike
      }
    } else {
      console.log('Swipe too short, not triggering action');
    }
    
    setSwipeOffset(0);
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
      
      {screen === 'menu' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <h2>Welcome!</h2>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 30 }}>
            <button onClick={() => setScreen('parameters')} style={{ padding: '20px 40px', fontSize: 18, background: '#4A90E2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Create Session
            </button>
            <button onClick={() => setScreen('join')} style={{ padding: '20px 40px', fontSize: 18, background: '#50C878', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Join Session
            </button>
          </div>
        </div>
      )}

      {screen === 'join' && (
        <div style={{ padding: 40 }}>
          <h2>Join Session</h2>
          <p style={{ color: '#666', marginBottom: 20 }}>
            Note: Sessions are stored locally in your browser. You must join from the same browser (not private/incognito mode).
          </p>
          <label style={{ display: 'block', marginBottom: 20 }}>
            Session ID:
            <input
              type="text"
              placeholder="Enter session ID"
              value={joinSessionInput}
              onChange={(e) => setJoinSessionInput(e.target.value)}
              style={{ display: 'block', width: '100%', padding: 10, marginTop: 8, fontSize: 16 }}
            />
          </label>
          <button onClick={handleJoinSession} style={{ padding: '15px 30px', fontSize: 16, background: '#50C878', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', marginRight: 10 }}>
            Join
          </button>
          <button onClick={() => setScreen('menu')} style={{ padding: '15px 30px', fontSize: 16, background: '#ccc', color: '#333', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Back
          </button>
        </div>
      )}

      {screen === 'parameters' && (
        <div>
          <h2>{sessionID && places.length > 0 ? 'Update Session' : 'Create Session'}</h2>
          
          {/* Location status */}
          {latitude && longitude ? (
            <div style={{ padding: 10, background: '#d4edda', color: '#155724', borderRadius: 6, marginBottom: 15 }}>
              ✓ Location acquired: {latitude.toFixed(4)}, {longitude.toFixed(4)}
            </div>
          ) : locationError ? (
            <div style={{ padding: 10, background: '#f8d7da', color: '#721c24', borderRadius: 6, marginBottom: 15 }}>
              ⚠ {locationError}
              <button onClick={() => window.location.reload()} style={{ marginLeft: 10, padding: '5px 10px' }}>Retry</button>
            </div>
          ) : (
            <div style={{ padding: 10, background: '#fff3cd', color: '#856404', borderRadius: 6, marginBottom: 15 }}>
              ⏳ Waiting for location...
            </div>
          )}
          
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
          <button onClick={handleCreateSession} disabled={!latitude || !longitude}>
            {sessionID && places.length > 0 ? 'Update Session' : 'Create Session'}
          </button>
          <button onClick={() => setScreen('menu')} style={{ marginLeft: 10 }}>Back</button>
        </div>
      )}

      {screen === 'cuisine-selection' && (
        <div style={{ padding: 40 }}>
          <h2>Filter Restaurants</h2>
          <p style={{ color: '#666', marginBottom: 20 }}>
            Found {unfilteredPlaces.length} places. Use the filters below to narrow down your options:
          </p>
          
          {/* Cuisine Filter */}
          <div style={{ marginBottom: 30 }}>
            <h3 style={{ marginBottom: 10 }}>Cuisines ({availableCuisines.length} types available)</h3>
            <div style={{ marginBottom: 10, display: 'flex', gap: 10 }}>
              <button onClick={selectAllCuisines} style={{ padding: '8px 16px', fontSize: 14, background: '#50C878', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                Select All
              </button>
              <button onClick={deselectAllCuisines} style={{ padding: '8px 16px', fontSize: 14, background: '#dc3545', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                Deselect All
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, maxHeight: 300, overflowY: 'auto', padding: 10, background: '#f8f9fa', borderRadius: 8 }}>
              {availableCuisines.map(cuisine => (
                <label key={cuisine} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#fff', borderRadius: 6, cursor: 'pointer', border: selectedCuisines.includes(cuisine) ? '2px solid #4A90E2' : '2px solid transparent' }}>
                  <input
                    type="checkbox"
                    checked={selectedCuisines.includes(cuisine)}
                    onChange={() => toggleCuisine(cuisine)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <span style={{ textTransform: 'capitalize' }}>
                    {cuisine === 'other' ? 'Other / No cuisine listed' : cuisine}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Price Level Filter */}
          <div style={{ marginBottom: 30 }}>
            <h3 style={{ marginBottom: 10 }}>Price Range</h3>
            <div style={{ marginBottom: 10 }}>
              <button onClick={selectAllPriceLevels} style={{ padding: '8px 16px', fontSize: 14, background: '#50C878', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                Select All Prices
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[0, 1, 2, 3, 4].map(level => (
                <label key={level} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: selectedPriceLevels.includes(level) ? '#4A90E2' : '#fff', color: selectedPriceLevels.includes(level) ? '#fff' : '#000', borderRadius: 6, cursor: 'pointer', border: '2px solid #4A90E2', minWidth: 80, justifyContent: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedPriceLevels.includes(level)}
                    onChange={() => togglePriceLevel(level)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 18, fontWeight: 'bold' }}>
                    {level === 0 ? 'Free' : '$'.repeat(level)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Minimum Rating Filter */}
          <div style={{ marginBottom: 30 }}>
            <h3 style={{ marginBottom: 10 }}>Minimum Rating</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={minRating}
                onChange={(e) => setMinRating(parseFloat(e.target.value))}
                style={{ flex: 1, cursor: 'pointer' }}
              />
              <div style={{ minWidth: 120, fontSize: 18, fontWeight: 'bold', color: '#4A90E2' }}>
                {minRating === 0 ? 'Any Rating' : `${minRating}+ ⭐`}
              </div>
            </div>
          </div>
          
          {availableCuisines.length === 0 && (
            <p style={{ color: '#856404', background: '#fff3cd', padding: 15, borderRadius: 6, marginBottom: 20 }}>
              ⚠️ No cuisine information available for places in this area. Proceeding will show all places.
            </p>
          )}
          
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button 
              onClick={handleApplyCuisineFilter} 
              style={{ padding: '15px 30px', fontSize: 16, background: '#4A90E2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', flex: 1 }}
            >
              Continue with Filters
            </button>
            <button 
              onClick={() => setScreen('parameters')} 
              style={{ padding: '15px 30px', fontSize: 16, background: '#6c757d', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {screen === 'qrcode' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <h2>Session Created!</h2>
          <p style={{ fontSize: 18, marginBottom: 20 }}>Share this with others to join:</p>
          
          <p style={{ fontWeight: 'bold', marginBottom: 10 }}>Scan QR Code:</p>
          <div style={{ background: '#fff', padding: 20, display: 'inline-block', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <QRCodeSVG value={window.location.origin + window.location.pathname + '?session=' + sessionID} size={256} />
          </div>
          
          <p style={{ marginTop: 30, fontWeight: 'bold' }}>Or share Session ID:</p>
          <div style={{ display: 'inline-block', background: '#f0f0f0', padding: 15, borderRadius: 8, fontSize: 20, fontFamily: 'monospace', letterSpacing: 2 }}>
            {sessionID}
          </div>
          
          <button onClick={() => setScreen('swipe')} style={{ marginTop: 30, padding: '15px 40px', fontSize: 18, background: '#4A90E2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            {currentIndex > 0 ? 'Back to Swiping' : 'Start Swiping'}
          </button>
        </div>
      )}

      {screen === 'swipe' && (
        <div>
          {console.log('Rendering swipe screen, places:', places?.length, 'currentIndex:', currentIndex, 'screen:', screen)}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <h2 style={{ margin: 0 }}>Swipe on Places</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => setScreen('qrcode')} 
                style={{ padding: '8px 16px', fontSize: 14, background: '#6c757d', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                Show Session Info
              </button>
              <button 
                onClick={handleQuitSession} 
                style={{ padding: '8px 16px', fontSize: 14, background: '#dc3545', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                Quit Session
              </button>
            </div>
          </div>
          {!simulationMode && places && places.length > 0 && (
            <div style={{ padding: '8px 12px', background: '#f0f0f0', borderRadius: 6, marginBottom: 15, textAlign: 'center', fontSize: 14, color: '#555' }}>
              Progress: {userVotedPlacesCount} of {places.length} places reviewed
            </div>
          )}
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
      {!places || places.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <h3>Loading places...</h3>
          <p>If this takes too long, please go back and try again.</p>
          <button onClick={() => setScreen('menu')}>Back to Menu</button>
        </div>
      ) : (simulationMode ? userIndexes[activeUser] : currentIndex) < places.length ? (
        <div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
            <button 
              onClick={() => handleSwipe(false)} 
              disabled={swipingInProgress}
              style={{ padding: '15px 40px', fontSize: 18, background: '#dc3545', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}
            >
              👎 Dislike
            </button>
            <button 
              onClick={() => handleSwipe(true)} 
              disabled={swipingInProgress}
              style={{ padding: '15px 40px', fontSize: 18, background: '#50C878', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}
            >
              👍 Like
            </button>
          </div>
          {!simulationMode && lastAction && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 15 }}>
              <button 
                onClick={handleUndo}
                disabled={swipingInProgress}
                style={{ padding: '10px 30px', fontSize: 16, background: '#ffc107', color: '#333', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}
              >
                ↶ Undo
              </button>
            </div>
          )}
          <div 
            onClick={() => handleCardClick(places[simulationMode ? userIndexes[activeUser] : currentIndex].place_id)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              transform: `translateX(${swipeOffset}px) rotate(${swipeOffset * 0.05}deg)`,
              transition: isSwipeActive ? 'none' : 'transform 0.3s ease',
              cursor: 'grab',
              userSelect: 'none'
            }}
          >
            <h2>{places[simulationMode ? userIndexes[activeUser] : currentIndex].name}</h2>
            <div style={{ marginTop: 8 }}>
              <img 
                src={places[simulationMode ? userIndexes[activeUser] : currentIndex].image_url || `https://via.placeholder.com/400x300/4A90E2/FFFFFF?text=${encodeURIComponent(places[simulationMode ? userIndexes[activeUser] : currentIndex].name)}`} 
                alt={places[simulationMode ? userIndexes[activeUser] : currentIndex].name} 
                style={{ maxWidth: '100%', height: 'auto', borderRadius: 6 }} 
              />
            </div>
            <div style={{ marginTop: 12, padding: '12px', background: '#f8f9fa', borderRadius: 6 }}>
              {places[simulationMode ? userIndexes[activeUser] : currentIndex].address && (
                <p style={{ margin: '4px 0', color: '#444', fontSize: 14 }}>
                  <strong>📍 Address:</strong> {places[simulationMode ? userIndexes[activeUser] : currentIndex].address}
                </p>
              )}
              {places[simulationMode ? userIndexes[activeUser] : currentIndex].cuisine && (
                <p style={{ margin: '4px 0', color: '#444', fontSize: 14 }}>
                  <strong>🍽️ Cuisine:</strong> {places[simulationMode ? userIndexes[activeUser] : currentIndex].cuisine}
                </p>
              )}
              {(places[simulationMode ? userIndexes[activeUser] : currentIndex].priceLevel !== undefined && places[simulationMode ? userIndexes[activeUser] : currentIndex].priceLevel !== null) ? (
                <p style={{ margin: '4px 0', color: '#444', fontSize: 14 }}>
                  <strong>💰 Price:</strong> {'$'.repeat(places[simulationMode ? userIndexes[activeUser] : currentIndex].priceLevel || 1)}
                </p>
              ) : places[simulationMode ? userIndexes[activeUser] : currentIndex].priceRange && (
                <p style={{ margin: '4px 0', color: '#444', fontSize: 14 }}>
                  <strong>💰 Price:</strong> {places[simulationMode ? userIndexes[activeUser] : currentIndex].priceRange}
                </p>
              )}
              {(places[simulationMode ? userIndexes[activeUser] : currentIndex].rating || places[simulationMode ? userIndexes[activeUser] : currentIndex].stars) && (
                <p style={{ margin: '4px 0', color: '#444', fontSize: 14 }}>
                  <strong>⭐ Rating:</strong> {(places[simulationMode ? userIndexes[activeUser] : currentIndex].rating || places[simulationMode ? userIndexes[activeUser] : currentIndex].stars).toFixed(1)} stars
                  {places[simulationMode ? userIndexes[activeUser] : currentIndex].userRatingsTotal && (
                    <span style={{ color: '#888', fontSize: 12 }}> ({places[simulationMode ? userIndexes[activeUser] : currentIndex].userRatingsTotal} reviews)</span>
                  )}
                </p>
              )}
              {places[simulationMode ? userIndexes[activeUser] : currentIndex].phone && (
                <p style={{ margin: '4px 0', color: '#444', fontSize: 14 }}>
                  <strong>📞 Phone:</strong> {places[simulationMode ? userIndexes[activeUser] : currentIndex].phone}
                </p>
              )}
              {places[simulationMode ? userIndexes[activeUser] : currentIndex].website && (
                <p style={{ margin: '4px 0', color: '#444', fontSize: 14 }}>
                  <strong>🌐 Website:</strong> <a href={places[simulationMode ? userIndexes[activeUser] : currentIndex].website} target="_blank" rel="noopener noreferrer" style={{ color: '#4A90E2' }}>{places[simulationMode ? userIndexes[activeUser] : currentIndex].website}</a>
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <h2>No more places</h2>
          <button onClick={handleRestartSession}>Restart with Same Parameters</button>
          {isSessionCreator && (
            <button onClick={() => setScreen('parameters')}>Update Session</button>
          )}
          <button onClick={handleQuitSession} style={{ background: '#dc3545', color: '#fff' }}>Quit Session</button>
          <button onClick={() => { handleShowConsensus(); setScreen('consensus'); }}>Show Consensus</button>
        </div>
      )}
        </div>
      )}

      {screen === 'consensus' && consensus.length > 0 && (
        <div>
          <h2>Consensus Results</h2>
          <p>Here are the places sorted by agreement:</p>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {consensus.map((place, index) => (
              <li key={index} style={{ padding: 10, marginBottom: 10, background: '#f0f0f0', borderRadius: 6 }}>
                <strong>{place.name}</strong> - {place.agreement}% agreed
              </li>
            ))}
          </ul>
          <button onClick={() => setScreen('swipe')} style={{ marginRight: 10 }}>Back to Swiping</button>
          <button onClick={handleQuitSession} style={{ background: '#dc3545', color: '#fff' }}>Quit Session</button>
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
