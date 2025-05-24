# RadioWave PWA - Quick Start Guide 🚀

Get your RadioWave PWA running in under 2 minutes!

## 🔥 Instant Setup

### Option 1: Using Node.js (Recommended)
```bash
# Start the development server
npm run dev
```
Then open: http://localhost:8000

### Option 2: Using Python
```bash
# Start Python server
npm run serve
# OR directly:
python -m http.server 8000
```

### Option 3: Using any other server
```bash
# PHP
php -S localhost:8000

# If you have live-server installed globally
live-server --port=8000
```

## 📱 Testing PWA Features

### Desktop (Chrome/Edge):
1. Open http://localhost:8000
2. Look for the install icon in the address bar
3. Click to install as a desktop app

### Mobile Testing:
1. Connect your phone to the same network
2. Find your computer's IP address (e.g., 192.168.1.100)
3. Visit http://YOUR_IP:8000 on your phone
4. Use browser menu > "Add to Home Screen"

## 🎯 Key Features to Test

### ✅ Radio Stations
- [ ] Browse popular stations (loads automatically)
- [ ] Search for stations by name
- [ ] Filter by Popular/Country/Genre
- [ ] Play/pause radio streams
- [ ] Add stations to favorites

### ✅ Favorites
- [ ] Navigate to Favorites tab
- [ ] Favorite some stations from Radio tab
- [ ] Play favorites directly from the favorites section

### ✅ My Music (Offline)
- [ ] Navigate to "My Music" tab
- [ ] Click "Upload Song" button
- [ ] Upload audio files (MP3, WAV, etc.)
- [ ] Play uploaded music offline

### ✅ Audio Player
- [ ] Play/pause any station or song
- [ ] Use previous/next buttons
- [ ] Adjust volume with volume button
- [ ] Heart favorite radio stations

### ✅ PWA Features
- [ ] Install app on desktop/mobile
- [ ] Test offline functionality (disconnect internet)
- [ ] Check responsive design on different screen sizes

## 🛠️ Development Notes

### File Structure
```
radiowave-pwa/
├── index.html          # Main app HTML
├── styles.css          # All styles (dark theme)
├── app.js             # Main application logic
├── sw.js              # Service Worker (PWA magic)
├── manifest.json      # PWA manifest
├── package.json       # NPM configuration
├── README.md          # Full documentation
├── QUICK_START.md     # This file
└── icons/             # PWA icons (placeholder files)
    ├── icon-72x72.png
    ├── icon-96x96.png
    ├── icon-128x128.png
    ├── icon-144x144.png
    ├── icon-152x152.png
    ├── icon-192x192.png
    ├── icon-384x384.png
    └── icon-512x512.png
```

### 🔧 Customization Quick Tips

#### Change App Colors
Edit `styles.css` CSS variables:
```css
:root {
    --primary-color: #1db954;  /* Change main green color */
    --background-color: #121212; /* Change background */
}
```

#### Change App Name
1. Update `manifest.json` - "name" and "short_name"
2. Update `index.html` - `<title>` tag
3. Update logo text in HTML if desired

#### Add Real Icons
Replace placeholder files in `/icons/` with actual PNG files:
- Use tools like favicon.io or figma.com
- Keep same dimensions (72x72, 96x96, etc.)
- Dark background with radio/music theme works best

## 🐛 Troubleshooting

### CORS Errors?
- Must serve via HTTP server (not file://)
- Use one of the server options above

### PWA Not Installing?
- Ensure you're on HTTPS or localhost
- Check browser console for service worker errors
- Some browsers require user interaction first

### Radio Stations Not Loading?
- Check internet connection
- Radio Browser API might be temporarily down
- Check browser console for API errors

### Audio Not Playing?
- Modern browsers require user interaction before audio
- Click play button (don't rely on autoplay)
- Check if station URL is accessible

## 🌟 Pro Tips

1. **Mobile Testing**: Use Chrome DevTools device emulation
2. **Performance**: Check Lighthouse PWA score (aim for 90+)
3. **Offline**: Disconnect network to test offline features
4. **Storage**: Check Application tab in DevTools for cached data

## 📞 Need Help?

- Check the full `README.md` for detailed documentation
- Open browser DevTools console to see any errors
- Most issues are CORS-related (need proper server)

---

**Happy coding! 🎵** 

Your RadioWave PWA should now be running like a charm! 