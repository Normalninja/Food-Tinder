// Firebase places collection for persistent storage
import { db } from '../session';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

const PLACES_COLLECTION = 'places';
const CACHE_VERSION = 4; // Increment this to invalidate all Firebase cache entries

// Generate a unique key for a place based on name and location
export function makePlaceKey(name, lat, lon) {
  // Round coordinates to 4 decimals (~11m precision)
  const roundedLat = Math.round(lat * 10000) / 10000;
  const roundedLon = Math.round(lon * 10000) / 10000;
  return `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${roundedLat}_${roundedLon}`;
}

// Get place from Firebase
export async function getPlaceFromDB(name, lat, lon) {
  if (!db) {
    console.warn('Firebase not initialized, skipping places DB fetch');
    return null;
  }
  
  try {
    const placeKey = makePlaceKey(name, lat, lon);
    const placeDoc = await getDoc(doc(db, PLACES_COLLECTION, placeKey));
    
    if (placeDoc.exists()) {
      const data = placeDoc.data();
      
      // Check cache version - invalidate if versions don't match
      if (data.version !== CACHE_VERSION) {
        console.log(`Firebase cache version mismatch for: ${name}, will refresh`);
        return null;
      }
      
      // Check if data is still fresh (30 days)
      const age = Date.now() - (data.lastUpdated?.toMillis() || 0);
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      
      if (age < maxAge) {
        console.log(`Using Firebase cached place: ${name}`);
        return data;
      } else {
        console.log(`Firebase cache expired for: ${name}`);
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching place from Firebase:', error);
    return null;
  }
}

// Save place to Firebase
export async function savePlaceToDB(name, lat, lon, placeData) {
  if (!db) {
    console.warn('Firebase not initialized, skipping places DB save');
    return;
  }
  
  try {
    const placeKey = makePlaceKey(name, lat, lon);
    
    await setDoc(doc(db, PLACES_COLLECTION, placeKey), {
      ...placeData,
      lastUpdated: Timestamp.now(),
      version: CACHE_VERSION
    });
    
    console.log(`Saved place to Firebase places collection: ${name}`);
  } catch (error) {
    console.error('Error saving place to Firebase:', error);
  }
}

// Enrich a single place with Firebase data (before calling Google)
export async function enrichPlaceWithFirebase(place) {
  const cached = await getPlaceFromDB(place.name, place.lat, place.lon);
  
  if (cached) {
    // Merge cached data with place
    return {
      ...place,
      priceLevel: cached.priceLevel !== undefined ? cached.priceLevel : place.priceRange,
      rating: cached.rating || place.stars,
      photoUrl: cached.photoUrl || place.image_url,
      userRatingsTotal: cached.userRatingsTotal,
      googlePlaceId: cached.googlePlaceId,
      firebaseEnriched: true
    };
  }
  
  return place;
}
