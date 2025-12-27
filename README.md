# 🍔 Food Tinder

A collaborative food discovery app where groups swipe through nearby restaurants to find what everyone wants to eat.

[**🚀 Live Demo**](https://normalninja.github.io/Food-Tinder/) 

## Features

### 🎯 Multi-Device Sessions
- **QR Code Sharing** - Create a session and share QR codes for others to join
- **Real-time Sync** - All devices see votes and changes instantly via Firebase
- **Session Management** - Restart with same parameters or update search radius
- **Vote Preservation** - Your votes persist when expanding search area

### 🍽️ Smart Filtering
- **Cuisine Selection** - Filter by cuisine types based on what's actually available in your search area
- **Multi-select** - Choose multiple cuisines or select/deselect all at once
- **Dynamic Options** - Only see cuisines that exist in nearby restaurants

### 📍 Location-Based Discovery
- **Custom Radius** - Search from 500m to 50km around any location
- **Live Data** - Pulls real restaurant info from OpenStreetMap
- **Rich Details** - See address, cuisine type, price range, ratings, phone, and website when available

### 💖 Tinder-Style Swiping
- **Touch & Mouse** - Swipe on mobile or drag with mouse on desktop
- **Visual Feedback** - Cards rotate and move as you swipe
- **Button Options** - Use Like/Dislike buttons if you prefer clicking
- **Undo Feature** - Made a mistake? Undo your last vote

### 📊 Progress & Consensus
- **Live Counter** - See how many places you've reviewed (X/Y)
- **Smart Results** - Only shows restaurants with 2+ likes
- **Full Details** - View all info for consensus picks
- **Business Hours** - See if places are open now

## How It Works

1. **Create Session** - Enter a location and search radius to find nearby restaurants
2. **Select Cuisines** - Choose which types of food you're interested in from what's available
3. **Share QR Code** - Others scan the code to join your session on their devices
4. **Swipe Together** - Everyone swipes left (dislike) or right (like) on restaurants
   - Swipe with touch gestures or mouse drag
   - Use buttons if you prefer
   - Undo if you change your mind
5. **View Results** - See restaurants that got 2+ likes with full details
6. **Pick & Go** - Decide on a winner and head out to eat!

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Firebase Firestore (real-time database)
- **Maps**: OpenStreetMap Overpass API
- **Deployment**: GitHub Pages
- **Styling**: CSS

## Quick Start

### Prerequisites
- Node.js 18+
- Firebase account (free tier works)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/food-tinder.git
cd food-tinder/foodtinder-frontend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Add your Firebase credentials to .env.local
# Get them from Firebase Console -> Project Settings

# Run development server
npm run dev
```

Open http://localhost:5173

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete GitHub Pages setup instructions.

**Quick version:**
1. Create Firebase project
2. Add Firebase secrets to GitHub repo
3. Update `base` path in `vite.config.js`
4. Push to main branch
5. Enable GitHub Pages in repo settings

## Development

```bash
# Run dev server
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
foodtinder-frontend/
├── public/           # Static assets
├── src/
│   ├── api/         # OpenStreetMap API integration
│   ├── session/     # Firebase session management
│   ├── App.jsx      # Main application logic
│   └── index.js     # Entry point
├── .env.example     # Environment template
└── vite.config.js   # Build configuration
```

## How Multi-Device Works

```
┌─────────────┐
│  Device 1   │ Creates Session
│   (Host)    │ Gets QR Code
└──────┬──────┘
       │
       ├─────► Firebase ◄─────┐
       │      (Real-time)     │
       │                      │
┌──────┴──────┐        ┌──────┴──────┐
│  Device 2   │        │  Device 3   │
│  (Phone)    │        │  (Tablet)   │
└─────────────┘        └─────────────┘
   Scans QR              Scans QR
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC

## Roadmap

- [x] ~~Add cuisine filtering~~ ✅ Completed
- [x] ~~Swipe gestures (touch & mouse)~~ ✅ Completed  
- [x] ~~Undo button~~ ✅ Completed
- [x] ~~Display price and ratings~~ not possible using OSM
- [ ] Save favorite places
- [ ] Session history
- [ ] Dark mode
- [ ] Share results via SMS/email
- [ ] Integration with Google Maps for directions
- [ ] Dietary restrictions filter (vegetarian, vegan, gluten-free)

## Known Issues

- OSM sometimes returns duplicate places with different IDs (handled via name matching)
- Opening hours parsing can be inconsistent for complex schedules
- Requires Firebase for multi-device (localStorage fallback is single-device only)

## Acknowledgments

- OpenStreetMap contributors for location data
- Firebase for real-time database
- React team for the framework
- Vite for blazing fast builds

---

Made for groups who can't decide where to eat
