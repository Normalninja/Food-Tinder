# Food Tinder - GitHub Pages Deployment Guide

## Prerequisites

1. **Firebase Project** (free tier is sufficient)
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project or use existing
   - Enable Firestore Database in test mode
   - Get your Firebase config credentials

2. **GitHub Repository**
   - Push your code to GitHub
   - Repository must be public for free GitHub Pages

## Setup Steps

### 1. Configure Firebase in Your Repository

#### Option A: Local Development
Create `.env.local` in `foodtinder-frontend/` directory:
```bash
cd foodtinder-frontend
cp .env.example .env.local
# Edit .env.local with your Firebase credentials
```

#### Option B: GitHub Secrets (for deployment)
1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Add these secrets:
   - `REACT_APP_FIREBASE_API_KEY`
   - `REACT_APP_FIREBASE_AUTH_DOMAIN`
   - `REACT_APP_FIREBASE_PROJECT_ID`
   - `REACT_APP_FIREBASE_STORAGE_BUCKET`
   - `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`
   - `REACT_APP_FIREBASE_APP_ID`

### 2. Update Repository Name in Config

Edit `foodtinder-frontend/vite.config.js`:
```javascript
base: '/your-repo-name/', // Change 'food-tinder' to your actual repo name
```

### 3. Enable GitHub Pages

1. Go to your repo → Settings → Pages
2. Source: **GitHub Actions**
3. Save

### 4. Deploy

Push to main branch:
```bash
git add .
git commit -m "Configure GitHub Pages deployment"
git push origin main
```

The GitHub Action will automatically:
- Install dependencies
- Build the React app with Firebase config
- Deploy to GitHub Pages

### 5. Access Your App

Your app will be available at:
```
https://your-username.github.io/your-repo-name/
```

## Firebase Security Rules

In Firebase Console → Firestore Database → Rules, use these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write to sessions for 24 hours after creation
    match /sessions/{sessionId} {
      allow read, write: if request.time < resource.data.created_at + duration.value(1, 'd');
    }
  }
}
```

## Testing Locally

```bash
cd foodtinder-frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production (test build locally)
npm run build

# Preview production build
npm run preview
```

## Troubleshooting

### Build Fails in GitHub Actions
- Check that all Firebase secrets are set correctly
- Verify `base` path in `vite.config.js` matches your repo name
- Check Action logs for specific error messages

### App Loads but Multi-Device Doesn't Work
- Verify Firebase credentials are correct
- Check Firestore rules allow read/write
- Open browser console for error messages

### 404 on GitHub Pages
- Ensure GitHub Pages is enabled and set to "GitHub Actions"
- Check the `base` path in `vite.config.js`
- Wait a few minutes after first deployment

### Sessions Not Syncing
- Check Firebase Console → Firestore → Data to see if sessions are being created
- Verify you're using the same Firebase project in all environments
- Check browser console for Firebase authentication errors

## Architecture

```
GitHub Pages (Static Hosting)
    ↓
React App (Vite Build)
    ↓
Firebase Firestore (Real-time Database)
    ↓
Multi-Device Sync ✅
```

## Features Available

✅ **Multi-device sessions** - Any device can scan QR code and join
✅ **Real-time sync** - Firebase handles live updates
✅ **Vote preservation** - Votes persist across parameter updates
✅ **Progress tracking** - See how many places reviewed
✅ **Consensus calculation** - Minimum 2 votes required
✅ **Works globally** - Not limited to local network

## Cost

- **GitHub Pages**: Free for public repos
- **Firebase**: Free tier includes:
  - 1 GiB storage
  - 50K reads/day
  - 20K writes/day
  - 10 GiB/month transfer

Plenty for personal use!

## Updating Your App

1. Make changes to your code
2. Commit and push to main branch
3. GitHub Actions automatically rebuilds and deploys
4. Changes live in ~2 minutes

## Custom Domain (Optional)

1. Buy a domain (e.g., from Namecheap, Google Domains)
2. Add CNAME file to `foodtinder-frontend/public/`
3. Configure DNS records
4. Enable custom domain in GitHub Pages settings

See [GitHub Docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) for details.
