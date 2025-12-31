// Chain restaurant logos
// Maps restaurant names to their logo URLs
// Uses logo.dev free tier for reliable company logos

const CHAIN_LOGOS = {
  // Fast Food Chains
  "mcdonald's": "https://img.logo.dev/mcdonalds.com",
  "burger king": "https://img.logo.dev/bk.com",
  "wendy's": "https://img.logo.dev/wendys.com",
  "taco bell": "https://img.logo.dev/tacobell.com",
  "kfc": "https://img.logo.dev/kfc.com",
  "subway": "https://img.logo.dev/subway.com",
  "pizza hut": "https://img.logo.dev/pizzahut.com",
  "domino's": "https://img.logo.dev/dominos.com",
  "papa john's": "https://img.logo.dev/papajohns.com",
  "little caesars": "https://img.logo.dev/littlecaesars.com",
  "arby's": "https://img.logo.dev/arbys.com",
  "sonic": "https://img.logo.dev/sonicdrivein.com",
  "chick-fil-a": "https://img.logo.dev/chick-fil-a.com",
  "popeyes": "https://img.logo.dev/popeyes.com",
  "chipotle": "https://img.logo.dev/chipotle.com",
  "five guys": "https://img.logo.dev/fiveguys.com",
  "jimmy john's": "https://img.logo.dev/jimmyjohns.com",
  "panda express": "https://img.logo.dev/pandaexpress.com",
  
  // Coffee Chains
  "starbucks": "https://img.logo.dev/starbucks.com",
  "dunkin": "https://img.logo.dev/dunkindonuts.com",
  "dunkin donuts": "https://img.logo.dev/dunkindonuts.com",
  "tim hortons": "https://img.logo.dev/timhortons.com",
  "caribou coffee": "https://img.logo.dev/cariboucoffee.com",
  
  // Casual Dining
  "applebee's": "https://img.logo.dev/applebees.com",
  "chili's": "https://img.logo.dev/chilis.com",
  "olive garden": "https://img.logo.dev/olivegarden.com",
  "red lobster": "https://img.logo.dev/redlobster.com",
  "outback steakhouse": "https://img.logo.dev/outback.com",
  "texas roadhouse": "https://img.logo.dev/texasroadhouse.com",
  "buffalo wild wings": "https://img.logo.dev/buffalowildwings.com",
  "denny's": "https://img.logo.dev/dennys.com",
  "ihop": "https://img.logo.dev/ihop.com",
  "panera bread": "https://img.logo.dev/panerabread.com",
  
  // Ice Cream / Dessert
  "dairy queen": "https://img.logo.dev/dairyqueen.com",
  "baskin robbins": "https://img.logo.dev/baskinrobbins.com",
  "cold stone": "https://img.logo.dev/coldstonecreamery.com",
  "ben & jerry's": "https://img.logo.dev/benjerry.com",
};

// Check if a restaurant name matches a known chain and return logo URL
export function getChainLogo(restaurantName) {
  if (!restaurantName) return null;
  
  const nameLower = restaurantName.toLowerCase().trim();
  
  // Direct match
  if (CHAIN_LOGOS[nameLower]) {
    return CHAIN_LOGOS[nameLower];
  }
  
  // Check if the name contains a chain name
  for (const [chainName, logoUrl] of Object.entries(CHAIN_LOGOS)) {
    if (nameLower.includes(chainName)) {
      return logoUrl;
    }
  }
  
  return null;
}
