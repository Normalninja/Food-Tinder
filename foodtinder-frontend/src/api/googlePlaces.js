// Google Places API integration with localStorage caching
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
const CACHE_DURATION_DAYS = 30; // Cache Google data for 30 days
const MONTHLY_API_CALL_LIMIT = 5000; // Conservative limit to stay within free tier ($200/month credit)

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
async function fetchPhotoAsBase64(photoReference) {
  try {
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photoReference}&key=${GOOGLE_API_KEY}`;
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
    
    // Use Text Search API to find the place
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(name)}&location=${lat},${lon}&radius=50&type=restaurant&key=${GOOGLE_API_KEY}`;
    
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    
    if (searchData.status !== 'OK' || !searchData.results || searchData.results.length === 0) {
      console.log(`No Google Places result for: ${name}`);
      return null;
    }
    
    const place = searchData.results[0];
    
    // Fetch and cache photo as base64 if available
    let photoDataUrl = null;
    if (place.photos && place.photos.length > 0) {
      // Check limit again before photo fetch
      if (!hasReachedApiLimit()) {
        const photoReference = place.photos[0].photo_reference;
        photoDataUrl = await fetchPhotoAsBase64(photoReference);
        // Increment for photo request
        if (photoDataUrl) {
          incrementApiUsage();
        }
      } else {
        console.log('API limit reached, skipping photo fetch');
      }
    }
    
    return {
      googlePlaceId: place.place_id,
      priceLevel: place.price_level !== undefined ? place.price_level : null,
      rating: place.rating || null,
      photoUrl: photoDataUrl,
      userRatingsTotal: place.user_ratings_total || null
    };
  } catch (error) {
    console.error(`Error fetching Google Places data for ${name}:`, error);
    return null;
  }
}

// Enrich a single place with Google data
export async function enrichPlaceWithGoogle(place) {
  // Check if we already have Google data
  if (place.googleEnriched) {
    return place;
  }

  // Check cache first
  const cached = getCachedPlace(place.name, place.lat, place.lon);
  if (cached) {
    console.log(`Using cached Google data for: ${place.name}`);
    return {
      ...place,
      priceLevel: cached.priceLevel !== null ? cached.priceLevel : place.priceRange,
      rating: cached.rating !== null ? cached.rating : place.stars,
      image_url: cached.photoUrl || place.image_url,
      userRatingsTotal: cached.userRatingsTotal,
      googleEnriched: true
    };
  }

  // Fetch from Google if not cached
  const googleData = await searchGooglePlace(place.name, place.lat, place.lon);
  
  if (googleData) {
    // Cache the data
    setCachedPlace(place.name, place.lat, place.lon, googleData);
    
    // Merge with place data (Google data takes precedence)
    return {
      ...place,
      priceLevel: googleData.priceLevel !== null ? googleData.priceLevel : place.priceRange,
      rating: googleData.rating !== null ? googleData.rating : place.stars,
      image_url: googleData.photoUrl || place.image_url,
      userRatingsTotal: googleData.userRatingsTotal,
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
