# 🍔 Food Tinder

A collaborative food discovery app where groups swipe through nearby restaurants to find what everyone wants to eat.

[**🚀 Live Demo**](https://normalninja.github.io/Food-Tinder/) 

## Features

- 🗺️ **Location-based search** - Find restaurants within a custom radius
- 👥 **Multi-device sessions** - Create QR codes for friends to join
- 💖 **Tinder-style swiping** - Like or dislike places
- 📊 **Progress tracking** - See how many places reviewed
- 🎯 **Smart consensus** - Only shows options with 2+ votes
- 🔄 **Vote preservation** - Votes carry over when updating search radius
- 📱 **Mobile-friendly** - Works on phones, tablets, and desktops
- ⚡ **Real-time sync** - See votes update instantly across all devices

## How It Works

1. **Host creates session** - Set location and search radius
2. **Share QR code** - Others scan to join the session
3. **Everyone swipes** - Like or dislike restaurant options
4. **View consensus** - See which places got the most votes
5. **Pick a winner** - Go eat!

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

- [ ] Add filters (cuisine type, price range, rating)
- [ ] Save favorite places
- [ ] Session history
- [ ] Dark mode
- [ ] Share results via SMS/email
- [ ] Integration with Google Maps for directions

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

Made with ❤️ for groups who can't decide where to eat
