// Chain restaurant logos using logo.dev API
// Free tier: 500k requests/month, we limit to 50k for safety

const LOGO_DEV_API_KEY = import.meta.env.VITE_LOGO_DEV_API_KEY;
const MONTHLY_LOGO_API_LIMIT = 50000;

// Debug: Log the API key status on module load
console.log('[chainLogos] Module loaded');
console.log('[chainLogos] VITE_LOGO_DEV_API_KEY exists:', !!LOGO_DEV_API_KEY);
console.log('[chainLogos] Environment variables:', import.meta.env);

// Logo API usage tracking
function getLogoApiUsageData() {
  const data = localStorage.getItem('logo_api_usage');
  if (!data) {
    return { month: new Date().getMonth(), year: new Date().getFullYear(), count: 0 };
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return { month: new Date().getMonth(), year: new Date().getFullYear(), count: 0 };
  }
}

function incrementLogoApiUsage() {
  const usage = getLogoApiUsageData();
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  // Reset counter if new month
  if (usage.month !== currentMonth || usage.year !== currentYear) {
    usage.month = currentMonth;
    usage.year = currentYear;
    usage.count = 1;
  } else {
    usage.count++;
  }
  
  localStorage.setItem('logo_api_usage', JSON.stringify(usage));
  return usage.count;
}

function hasReachedLogoApiLimit() {
  const usage = getLogoApiUsageData();
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  // Reset if new month
  if (usage.month !== currentMonth || usage.year !== currentYear) {
    return false;
  }
  
  return usage.count >= MONTHLY_LOGO_API_LIMIT;
}

const CHAIN_DOMAINS = {
  // Fast Food Chains
  "mcdonald's": "mcdonalds.com",
  "burger king": "bk.com",
  "wendy's": "wendys.com",
  "taco bell": "tacobell.com",
  "kfc": "kfc.com",
  "subway": "subway.com",
  "pizza hut": "pizzahut.com",
  "domino's": "dominos.com",
  "papa john's": "papajohns.com",
  "little caesars": "littlecaesars.com",
  "arby's": "arbys.com",
  "sonic": "sonicdrivein.com",
  "chick-fil-a": "chick-fil-a.com",
  "popeyes": "popeyes.com",
  "chipotle": "chipotle.com",
  "five guys": "fiveguys.com",
  "jimmy john's": "jimmyjohns.com",
  "panda express": "pandaexpress.com",
  
  // Coffee Chains
  "starbucks": "starbucks.com",
  "dunkin": "dunkindonuts.com",
  "dunkin donuts": "dunkindonuts.com",
  "tim hortons": "timhortons.com",
  "caribou coffee": "cariboucoffee.com",
  
  // Casual Dining
  "applebee's": "applebees.com",
  "chili's": "chilis.com",
  "olive garden": "olivegarden.com",
  "red lobster": "redlobster.com",
  "outback steakhouse": "outback.com",
  "texas roadhouse": "texasroadhouse.com",
  "buffalo wild wings": "buffalowildwings.com",
  "denny's": "dennys.com",
  "ihop": "ihop.com",
  "panera bread": "panerabread.com",
  
  // Ice Cream / Dessert
  "dairy queen": "dairyqueen.com",
  "baskin robbins": "baskinrobbins.com",
  "cold stone": "coldstonecreamery.com",
  "ben & jerry's": "benjerry.com",
};

// Check if a restaurant name matches a known chain and return logo URL
export function getChainLogo(restaurantName) {
  console.log('[chainLogos] getChainLogo called with:', restaurantName);
  console.log('[chainLogos] API key present:', !!LOGO_DEV_API_KEY);
  
  if (!restaurantName) {
    console.log('[chainLogos] Missing restaurant name');
    return null;
  }
  
  if (!LOGO_DEV_API_KEY) {
    console.log('[chainLogos] Missing API key');
    return null;
  }
  
  // Check if we've reached the monthly limit
  if (hasReachedLogoApiLimit()) {
    console.log('[chainLogos] Logo API monthly limit reached');
    return null;
  }
  
  const nameLower = restaurantName.toLowerCase().trim();
  console.log('[chainLogos] Searching for:', nameLower);
  
  // Direct match
  if (CHAIN_DOMAINS[nameLower]) {
    incrementLogoApiUsage();
    const url = `https://img.logo.dev/${CHAIN_DOMAINS[nameLower]}?token=${LOGO_DEV_API_KEY}`;
    console.log('[chainLogos] Direct match found, returning:', url);
    return url;
  }
  
  // Check if the name contains a chain name
  for (const [chainName, domain] of Object.entries(CHAIN_DOMAINS)) {
    if (nameLower.includes(chainName)) {
      incrementLogoApiUsage();
      const url = `https://img.logo.dev/${domain}?token=${LOGO_DEV_API_KEY}`;
      console.log('[chainLogos] Partial match found:', chainName, '-> returning:', url);
      return url;
    }
  }
  
  console.log('[chainLogos] No match found for:', nameLower);
  return null;
}
