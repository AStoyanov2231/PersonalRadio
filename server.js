const express = require('express');
const path = require('path');
const os = require('os');
const https = require('https');
const fs = require('fs');

const app = express();
const PORT = 25565;


// const sslOptions = {
//   key: fs.readFileSync('private-key.pem'),
//   cert: fs.readFileSync('origin-cert.pem'),
// };

// Get local IP address for easier access
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIpAddress = getLocalIpAddress();

// Add CORS headers for PWA access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Cross-Origin-Embedder-Policy', 'require-corp');
  res.header('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

// Serve static files from the current directory with proper caching headers
app.use(express.static(__dirname, {
  // Set correct content types for PWA files
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
    
    // Set caching headers for better performance
    if (filePath.includes('sw.js')) {
      // Don't cache service worker
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.endsWith('.html')) {
      // Short cache for HTML
      res.setHeader('Cache-Control', 'public, max-age=0');
    } else {
      // Longer cache for other static assets
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }
}));

// Simple ping endpoint for checking server status
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Handle all routes by serving index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// // Start HTTPS server
// https.createServer(sslOptions, app).listen(PORT,'0.0.0.0', () => {
//   console.log(`HTTPS server running on port ${PORT}`);
// });

// Start the server

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access locally at: http://localhost:${PORT}`);
  console.log(`Access on network at: http://${localIpAddress}:${PORT}`);
  console.log(`\nInstallation instructions:`);
  console.log(`1. Open the application in Chrome or Edge at http://${localIpAddress}:${PORT}`);
  console.log(`2. Look for the install button (📱) in the bottom right`);
  console.log(`3. Click it to install the app`);
}); 

