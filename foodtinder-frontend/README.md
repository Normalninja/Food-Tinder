# Food Tinder

A collaborative restaurant discovery app where groups can swipe through nearby restaurants together and find consensus on where to eat!

## Features

### 🎯 Multi-Device Sessions
- Create sessions and share via QR code or session ID
- Real-time syncing across all participants using Firebase
- Auto-join sessions by scanning QR codes
- Works across different browsers and devices

### 🍽️ Smart Filtering
- **Distance-based search**: Search restaurants within a custom radius (miles or kilometers)
- **Cuisine filtering**: Dynamically filters based on actual cuisines available in your area
- Multi-select cuisine types to focus on what you want

### 📍 Restaurant Details
- Fetches data from OpenStreetMap (OSM)
- Displays: Address, Cuisine type, Price range, Star ratings, Phone numbers, Website links
- Opening hours with "open now" detection
- Placeholder images for all restaurants

### 👆 Intuitive Swiping
- **Tinder-style swipe gestures**: 
  - Swipe right (or drag right) to like 👍
  - Swipe left (or drag left) to dislike 👎
- Works on both touch devices and desktop (mouse)
- Visual card rotation feedback while swiping

### 🔄 Smart Session Management
- **Undo button**: Reverse your last vote
- **Restart session**: Clear all your votes and start fresh
- Progress tracking: See how many places you've reviewed
- Skip already-reviewed places automatically

### 🎉 Consensus Voting
- View places with 2+ votes sorted by agreement percentage
- See which restaurants your group likes most
- Only shows places where multiple people agreed

## Getting Started

### Prerequisites
- Node.js and npm
- Firebase account (for multi-device sessions)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Normalninja/Food-Tinder.git
cd Food-Tinder/foodtinder-frontend
```

2. Install dependencies:
```bash
npm install
```

3. Set up Firebase (optional, but required for multi-device sessions):
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Firestore Database
   - Copy your Firebase config
   - Create a `.env` file in `foodtinder-frontend/` directory:
   ```env
   VITE_FIREBASE_API_KEY=your-api-key-here
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   ```

4. Configure Firestore security rules (in Firebase Console):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sessions/{sessionId} {
      allow create: if true;
      allow read, write, delete: if true;
    }
  }
}
```

### Running the App

#### Development Mode
```bash
npm run dev
```
Opens at [http://localhost:5173/Food-Tinder/](http://localhost:5173/Food-Tinder/)

#### Production Build
```bash
npm run build
```
Builds the app to the `dist/` folder, ready for deployment.

## How to Use

1. **Create a Session**:
   - Click "Create Session"
   - Allow location access
   - Set your search radius
   - Select cuisines you're interested in
   - Share the QR code or session ID with friends

2. **Join a Session**:
   - Scan the QR code or enter the session ID
   - Start swiping!

3. **Swipe on Restaurants**:
   - Swipe right or click 👍 to like
   - Swipe left or click 👎 to dislike
   - Use the Undo button to reverse your last action

4. **View Consensus**:
   - Once everyone has voted, check which restaurants have the most agreement
   - Places are sorted by percentage of group agreement

## Technology Stack

- **Frontend**: React 18, Vite
- **Styling**: Inline CSS (Material-like design)
- **Data Source**: OpenStreetMap Overpass API
- **Backend**: Firebase Firestore (real-time database)
- **QR Codes**: qrcode.react
- **Opening Hours**: opening_hours library
- **Deployment**: GitHub Pages

## Architecture

### Data Flow
1. User requests location → Browser Geolocation API
2. Search nearby restaurants → OpenStreetMap Overpass API
3. Extract available cuisines → Display cuisine filter
4. Create session → Firebase Firestore
5. Users vote → Real-time sync via Firebase
6. Calculate consensus → Sort by agreement percentage

### Caching & Resilience
- OSM responses cached in localStorage (10-minute TTL)
- Multiple Overpass API endpoints with automatic fallback
- Works offline with cached data

### Firebase Integration
- Sessions stored in Firestore with 24-hour retention
- Real-time updates using `onSnapshot`
- Automatic cleanup of stale sessions
- Falls back to localStorage if Firebase not configured

## Deployment

The app is deployed to GitHub Pages at: https://normalninja.github.io/Food-Tinder/

GitHub Actions automatically builds and deploys on push to `main` branch.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source and available under the MIT License.

## Acknowledgments

- OpenStreetMap for restaurant data
- Firebase for real-time database
- Create React App for project bootstrapping
- Vite for fast development experience
