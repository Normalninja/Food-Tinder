// Google Places API integration with localStorage caching
import { getPlaceFromDB, savePlaceToDB } from './placesDB';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
const CACHE_DURATION_DAYS = 30; // Cache Google data for 30 days
const MONTHLY_API_CALL_LIMIT = 5000; // Conservative limit to stay within free tier ($200/month credit)

// Calculate distance between two coordinates in kilometers (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// API usage tracking
function getApiUsageData() {
  const data = localStorage.getItem('google_api_usage');
  if (!data) {
    return { month: new Date().getMonth(), year: new Date().getFullYear(), count: 0 };
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return { month: new Date().getMonth(), year: new Date().getFullYear(), count: 0 };
  }
}

function incrementApiUsage() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const usage = getApiUsageData();
  
  // Reset counter if new month
  if (usage.month !== currentMonth || usage.year !== currentYear) {
    usage.month = currentMonth;
    usage.year = currentYear;
    usage.count = 0;
  }
  
  usage.count += 1;
  localStorage.setItem('google_api_usage', JSON.stringify(usage));
  
  return usage.count;
}

function hasReachedApiLimit() {
  const usage = getApiUsageData();
  const now = new Date();
  
  // Reset if new month
  if (usage.month !== now.getMonth() || usage.year !== now.getFullYear()) {
    return false;
  }
  
  if (usage.count >= MONTHLY_API_CALL_LIMIT) {
    console.warn(`Google Places API monthly limit reached (${usage.count}/${MONTHLY_API_CALL_LIMIT}). Skipping enrichment to stay within free tier.`);
    return true;
  }
  
  return false;
}

// Generate cache key for a place
function makePlaceCacheKey(name, lat, lon) {
  // Round coordinates to 4 decimals (~11m precision) for cache matching
  const roundedLat = Math.round(lat * 10000) / 10000;
  const roundedLon = Math.round(lon * 10000) / 10000;
  return `google_place_${name.toLowerCase().replace(/\s+/g, '_')}_${roundedLat}_${roundedLon}`;
}

// Check if cached data is still valid
function isCacheValid(cachedData) {
  if (!cachedData || !cachedData.lastUpdated) return false;
  const cacheAge = Date.now() - cachedData.lastUpdated;
  const maxAge = CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000;
  return cacheAge < maxAge;
}

// Get cached place data
function getCachedPlace(name, lat, lon) {
  const key = makePlaceCacheKey(name, lat, lon);
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  
  try {
    const data = JSON.parse(cached);
    return isCacheValid(data) ? data : null;
  } catch (e) {
    console.error('Error parsing cached place data:', e);
    return null;
  }
}

// Store place data in cache
function setCachedPlace(name, lat, lon, data) {
  const key = makePlaceCacheKey(name, lat, lon);
  const cacheData = {
    ...data,
    lastUpdated: Date.now()
  };
  localStorage.setItem(key, JSON.stringify(cacheData));
}

// Fetch photo from Google and convert to base64 data URL for caching
async function fetchPhotoAsBase64(photoName) {
  try {
    // Use the photo name to get the media
    const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=400&key=${GOOGLE_API_KEY}`;
    const response = await fetch(photoUrl);
    if (!response.ok) return null;
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error fetching photo:', error);
    return null;
  }
}

// Fetch place details from Google Places API (Text Search)
async function searchGooglePlace(name, lat, lon) {
  if (!GOOGLE_API_KEY) {
    console.log('Google Places API key not configured, skipping enrichment');
    return null;
  }

  // Check if monthly limit reached
  if (hasReachedApiLimit()) {
    return null;
  }

  try {
    // Increment usage counter (1 for text search)
    const currentUsage = incrementApiUsage();
    console.log(`Google API call ${currentUsage}/${MONTHLY_API_CALL_LIMIT} this month`);
    
    // Use Places API (New) - Text Search endpoint with CORS support
    const searchUrl = `https://places.googleapis.com/v1/places:searchText`;
    
    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.priceLevel,places.rating,places.userRatingCount,places.photos,places.location'
      },
      body: JSON.stringify({
        textQuery: `${name} restaurant`,
        locationBias: {
          circle: {
            center: {
              latitude: lat,
              longitude: lon
            },
            radius: 100.0
          }
        },
        maxResultCount: 1
      })
    });
    
    const searchData = await searchResponse.json();
    
    if (!searchData.places || searchData.places.length === 0) {
      console.log(`No Google Places result for: ${name}`);
      return null;
    }
    
    const place = searchData.places[0];
    
    // Verify the place is actually close to our coordinates (within ~200m)
    if (place.location) {
      const distance = calculateDistance(
        lat, lon,
        place.location.latitude, place.location.longitude
      );
      if (distance > 0.2) { // More than 200 meters away
        console.log(`Google Places result too far (${distance.toFixed(2)}km) for: ${name}`);
        return null;
      }
    }
    
    // Fetch and cache photo as base64 if available
    let photoDataUrl = null;
    if (place.photos && place.photos.length > 0) {
      // Check limit again before photo fetch
      if (!hasReachedApiLimit()) {
        const photoName = place.photos[0].name;
        photoDataUrl = await fetchPhotoAsBase64(photoName);
        // Increment for photo request
        if (photoDataUrl) {
          incrementApiUsage();
        }
      } else {
        console.log('API limit reached, skipping photo fetch');
      }
    }
    
    // Convert price level string to number (0-4)
    let priceLevel = null;
    if (place.priceLevel) {
      const priceLevelMap = {
        'PRICE_LEVEL_FREE': 0,
        'PRICE_LEVEL_INEXPENSIVE': 1,
        'PRICE_LEVEL_MODERATE': 2,
        'PRICE_LEVEL_EXPENSIVE': 3,
        'PRICE_LEVEL_VERY_EXPENSIVE': 4
      };
      priceLevel = priceLevelMap[place.priceLevel] !== undefined ? priceLevelMap[place.priceLevel] : null;
    }
    
    return {
      googlePlaceId: place.id,
      priceLevel: priceLevel,
      rating: place.rating || null,
      photoUrl: photoDataUrl,
      userRatingsTotal: place.userRatingCount || null
    };
  } catch (error) {
    console.error(`Error fetching Google Places data for ${name}:`, error);
    return null;
  }
}

// Enrich a single place with Google data
export async function enrichPlaceWithGoogle(place) {
  // Check if we already have Google data
  if (place.googleEnriched || place.firebaseEnriched) {
    return place;
  }

  // Check Firebase first (persistent cache across sessions)
  const firebaseData = await getPlaceFromDB(place.name, place.lat, place.lon);
  if (firebaseData) {
    console.log(`Using Firebase cached data for: ${place.name}`);
    return {
      ...place,
      priceLevel: firebaseData.priceLevel !== null ? firebaseData.priceLevel : place.priceRange,
      rating: firebaseData.rating !== null ? firebaseData.rating : place.stars,
      image_url: firebaseData.photoUrl || place.image_url,
      userRatingsTotal: firebaseData.userRatingsTotal,
      googlePlaceId: firebaseData.googlePlaceId,
      googleEnriched: true,
      firebaseEnriched: true
    };
  }

  // Check localStorage cache (browser-specific cache)
  const cached = getCachedPlace(place.name, place.lat, place.lon);
  if (cached) {
    console.log(`Using localStorage cached data for: ${place.name}`);
    // Also save to Firebase for persistence across sessions
    await savePlaceToDB(place.name, place.lat, place.lon, cached);
    
    return {
      ...place,
      priceLevel: cached.priceLevel !== null ? cached.priceLevel : place.priceRange,
      rating: cached.rating !== null ? cached.rating : place.stars,
      image_url: cached.photoUrl || place.image_url,
      userRatingsTotal: cached.userRatingsTotal,
      googleEnriched: true
    };
  }

  // Fetch from Google if not cached anywhere
  const googleData = await searchGooglePlace(place.name, place.lat, place.lon);
  
  if (googleData) {
    // Cache in both localStorage and Firebase
    setCachedPlace(place.name, place.lat, place.lon, googleData);
    await savePlaceToDB(place.name, place.lat, place.lon, googleData);
    
    // Merge with place data (Google data takes precedence)
    return {
      ...place,
      priceLevel: googleData.priceLevel !== null ? googleData.priceLevel : place.priceRange,
      rating: googleData.rating !== null ? googleData.rating : place.stars,
      image_url: googleData.photoUrl || place.image_url,
      userRatingsTotal: googleData.userRatingsTotal,
      googlePlaceId: googleData.googlePlaceId,
      googleEnriched: true
      googleEnriched: true
    };
  }

  // No Google data found, return original
  return { ...place, googleEnriched: true };
}

// Batch enrich multiple places with Google data
export async function enrichPlacesWithGoogle(places) {
  if (!GOOGLE_API_KEY) {
    console.log('Google Places API key not configured, returning places without enrichment');
    return places;
  }

  // Check if limit already reached
  if (hasReachedApiLimit()) {
    console.log('Monthly API limit reached, returning places without enrichment');
    return places;
  }

  const usage = getApiUsageData();
  console.log(`Enriching ${places.length} places with Google Places data... (${usage.count}/${MONTHLY_API_CALL_LIMIT} API calls used this month)`);
  
  // Process in batches to avoid rate limits
  const batchSize = 5;
  const enrichedPlaces = [];
  
  for (let i = 0; i < places.length; i += batchSize) {
    // Check limit before each batch
    if (hasReachedApiLimit()) {
      console.log(`API limit reached after enriching ${enrichedPlaces.length} places. Remaining places will use OSM data only.`);
      // Return what we've enriched plus the rest unenriched
      enrichedPlaces.push(...places.slice(i).map(p => ({ ...p, googleEnriched: true })));
      break;
    }
    
    const batch = places.slice(i, i + batchSize);
    const enrichedBatch = await Promise.all(
      batch.map(place => enrichPlaceWithGoogle(place))
    );
    enrichedPlaces.push(...enrichedBatch);
    
    // Small delay between batches to respect rate limits
    if (i + batchSize < places.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  const finalUsage = getApiUsageData();
  console.log(`Enriched ${enrichedPlaces.length} places (${finalUsage.count}/${MONTHLY_API_CALL_LIMIT} API calls used this month)`);
  return enrichedPlaces;
}
