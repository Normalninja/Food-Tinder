// Chain restaurant logos
// Maps restaurant names to their logo URLs
// Uses publicly available logos from various sources

const CHAIN_LOGOS = {
  // Fast Food Chains
  "mcdonald's": "https://logo.clearbit.com/mcdonalds.com",
  "burger king": "https://logo.clearbit.com/bk.com",
  "wendy's": "https://logo.clearbit.com/wendys.com",
  "taco bell": "https://logo.clearbit.com/tacobell.com",
  "kfc": "https://logo.clearbit.com/kfc.com",
  "subway": "https://logo.clearbit.com/subway.com",
  "pizza hut": "https://logo.clearbit.com/pizzahut.com",
  "domino's": "https://logo.clearbit.com/dominos.com",
  "papa john's": "https://logo.clearbit.com/papajohns.com",
  "little caesars": "https://logo.clearbit.com/littlecaesars.com",
  "arby's": "https://logo.clearbit.com/arbys.com",
  "sonic": "https://logo.clearbit.com/sonicdrivein.com",
  "chick-fil-a": "https://logo.clearbit.com/chick-fil-a.com",
  "popeyes": "https://logo.clearbit.com/popeyes.com",
  "chipotle": "https://logo.clearbit.com/chipotle.com",
  "five guys": "https://logo.clearbit.com/fiveguys.com",
  "jimmy john's": "https://logo.clearbit.com/jimmyjohns.com",
  "panda express": "https://logo.clearbit.com/pandaexpress.com",
  
  // Coffee Chains
  "starbucks": "https://logo.clearbit.com/starbucks.com",
  "dunkin": "https://logo.clearbit.com/dunkindonuts.com",
  "dunkin donuts": "https://logo.clearbit.com/dunkindonuts.com",
  "tim hortons": "https://logo.clearbit.com/timhortons.com",
  "caribou coffee": "https://logo.clearbit.com/cariboucoffee.com",
  
  // Casual Dining
  "applebee's": "https://logo.clearbit.com/applebees.com",
  "chili's": "https://logo.clearbit.com/chilis.com",
  "olive garden": "https://logo.clearbit.com/olivegarden.com",
  "red lobster": "https://logo.clearbit.com/redlobster.com",
  "outback steakhouse": "https://logo.clearbit.com/outback.com",
  "texas roadhouse": "https://logo.clearbit.com/texasroadhouse.com",
  "buffalo wild wings": "https://logo.clearbit.com/buffalowildwings.com",
  "denny's": "https://logo.clearbit.com/dennys.com",
  "ihop": "https://logo.clearbit.com/ihop.com",
  "panera bread": "https://logo.clearbit.com/panerabread.com",
  
  // Ice Cream / Dessert
  "dairy queen": "https://logo.clearbit.com/dairyqueen.com",
  "baskin robbins": "https://logo.clearbit.com/baskinrobbins.com",
  "cold stone": "https://logo.clearbit.com/coldstonecreamery.com",
  "ben & jerry's": "https://logo.clearbit.com/benjerry.com",
};

// Fetch logo and convert to base64 data URL
async function fetchLogoAsBase64(logoUrl) {
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn(`Failed to fetch chain logo from ${logoUrl}:`, error);
    return null;
  }
}

// Check if a restaurant name matches a known chain and fetch logo
export async function getChainLogo(restaurantName) {
  if (!restaurantName) return null;
  
  const nameLower = restaurantName.toLowerCase().trim();
  
  // Direct match
  if (CHAIN_LOGOS[nameLower]) {
    return await fetchLogoAsBase64(CHAIN_LOGOS[nameLower]);
  }
  
  // Check if the name contains a chain name
  for (const [chainName, logoUrl] of Object.entries(CHAIN_LOGOS)) {
    if (nameLower.includes(chainName)) {
      return await fetchLogoAsBase64(logoUrl);
    }
  }
  
  return null;
}
