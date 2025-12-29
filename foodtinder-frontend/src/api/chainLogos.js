// Chain restaurant logos
// Maps restaurant names to their logo URLs
// Uses publicly available logos from various sources

const CHAIN_LOGOS = {
  // Fast Food Chains
  "mcdonald's": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/McDonald%27s_Golden_Arches.svg/200px-McDonald%27s_Golden_Arches.svg.png",
  "burger king": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Burger_King_logo_%281999%29.svg/200px-Burger_King_logo_%281999%29.svg.png",
  "wendy's": "https://upload.wikimedia.org/wikipedia/en/thumb/c/c1/Wendy%27s_logo_2013.svg/200px-Wendy%27s_logo_2013.svg.png",
  "taco bell": "https://upload.wikimedia.org/wikipedia/en/thumb/b/b3/Taco_Bell_2016.svg/200px-Taco_Bell_2016.svg.png",
  "kfc": "https://upload.wikimedia.org/wikipedia/en/thumb/b/bf/KFC_logo.svg/200px-KFC_logo.svg.png",
  "subway": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Subway_2016_logo.svg/200px-Subway_2016_logo.svg.png",
  "pizza hut": "https://upload.wikimedia.org/wikipedia/en/thumb/d/d2/Pizza_Hut_logo.svg/200px-Pizza_Hut_logo.svg.png",
  "domino's": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Domino%27s_pizza_logo.svg/200px-Domino%27s_pizza_logo.svg.png",
  "papa john's": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Papa_John%27s_Logo.svg/200px-Papa_John%27s_Logo.svg.png",
  "little caesars": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Little_Caesars_logo_2017.svg/200px-Little_Caesars_logo_2017.svg.png",
  "arby's": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Arby%27s_logo.svg/200px-Arby%27s_logo.svg.png",
  "sonic": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Sonic_Drive-In_logo.svg/200px-Sonic_Drive-In_logo.svg.png",
  "chick-fil-a": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Chick-fil-A_Logo.svg/200px-Chick-fil-A_Logo.svg.png",
  "popeyes": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Popeyes_logo.svg/200px-Popeyes_logo.svg.png",
  "chipotle": "https://upload.wikimedia.org/wikipedia/en/thumb/3/3b/Chipotle_Mexican_Grill_logo.svg/200px-Chipotle_Mexican_Grill_logo.svg.png",
  "five guys": "https://upload.wikimedia.org/wikipedia/en/thumb/4/47/Five_Guys_logo.svg/200px-Five_Guys_logo.svg.png",
  "jimmy john's": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Jimmy_John%27s_logo.svg/200px-Jimmy_John%27s_logo.svg.png",
  "panda express": "https://upload.wikimedia.org/wikipedia/en/thumb/8/84/Panda_Express_logo.svg/200px-Panda_Express_logo.svg.png",
  
  // Coffee Chains
  "starbucks": "https://upload.wikimedia.org/wikipedia/en/thumb/d/d3/Starbucks_Corporation_Logo_2011.svg/200px-Starbucks_Corporation_Logo_2011.svg.png",
  "dunkin": "https://upload.wikimedia.org/wikipedia/en/thumb/f/f7/Dunkin%27_logo.svg/200px-Dunkin%27_logo.svg.png",
  "dunkin donuts": "https://upload.wikimedia.org/wikipedia/en/thumb/f/f7/Dunkin%27_logo.svg/200px-Dunkin%27_logo.svg.png",
  "tim hortons": "https://upload.wikimedia.org/wikipedia/en/thumb/b/b9/Tim_Hortons_logo.svg/200px-Tim_Hortons_logo.svg.png",
  "caribou coffee": "https://upload.wikimedia.org/wikipedia/en/thumb/0/0e/Caribou_Coffee_Logo.svg/200px-Caribou_Coffee_Logo.svg.png",
  
  // Casual Dining
  "applebee's": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Applebee%27s_logo.svg/200px-Applebee%27s_logo.svg.png",
  "chili's": "https://upload.wikimedia.org/wikipedia/en/thumb/1/10/Chili%27s_Grill_%26_Bar_logo.svg/200px-Chili%27s_Grill_%26_Bar_logo.svg.png",
  "olive garden": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Olive_Garden_Logo.svg/200px-Olive_Garden_Logo.svg.png",
  "red lobster": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Red_Lobster_logo.svg/200px-Red_Lobster_logo.svg.png",
  "outback steakhouse": "https://upload.wikimedia.org/wikipedia/en/thumb/a/a8/Outback_Steakhouse_logo.svg/200px-Outback_Steakhouse_logo.svg.png",
  "texas roadhouse": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Texas_Roadhouse_logo.svg/200px-Texas_Roadhouse_logo.svg.png",
  "buffalo wild wings": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Buffalo_Wild_Wings_logo.svg/200px-Buffalo_Wild_Wings_logo.svg.png",
  "denny's": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Denny%27s_Logo_%28Red-Yellow%29.svg/200px-Denny%27s_Logo_%28Red-Yellow%29.svg.png",
  "ihop": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/IHOP_logo.svg/200px-IHOP_logo.svg.png",
  "panera bread": "https://upload.wikimedia.org/wikipedia/en/thumb/e/e8/Panera_Bread_logo.svg/200px-Panera_Bread_logo.svg.png",
  
  // Ice Cream / Dessert
  "dairy queen": "https://upload.wikimedia.org/wikipedia/en/thumb/9/91/Dairy_Queen_logo.svg/200px-Dairy_Queen_logo.svg.png",
  "baskin robbins": "https://upload.wikimedia.org/wikipedia/en/thumb/3/38/Baskin-Robbins_logo.svg/200px-Baskin-Robbins_logo.svg.png",
  "cold stone": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Cold_Stone_Creamery_logo.svg/200px-Cold_Stone_Creamery_logo.svg.png",
  "ben & jerry's": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Ben_%26_Jerry%27s_logo.svg/200px-Ben_%26_Jerry%27s_logo.svg.png",
};

// Check if a restaurant name matches a known chain
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
