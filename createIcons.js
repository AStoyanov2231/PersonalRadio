const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// Create a simple green circle icon with a music note
function createMusicIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background circle
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
  ctx.fillStyle = '#1DB954'; // Spotify green color
  ctx.fill();
  
  // Inner circle
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/3, 0, Math.PI * 2);
  ctx.fillStyle = '#000000';
  ctx.fill();
  
  // Center dot
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/10, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  
  // Music note stem
  ctx.save();
  ctx.translate(size/2, size/2);
  ctx.rotate(20 * Math.PI / 180);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-size/40, -size/3, size/20, size/2);
  ctx.restore();
  
  return canvas.toBuffer('image/png');
}

try {
  // Create icons directory if it doesn't exist
  const iconsDir = path.join(__dirname, 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
  }
  
  // Create 192x192 icon
  const icon192 = createMusicIcon(192);
  fs.writeFileSync(path.join(iconsDir, 'icon-192x192.png'), icon192);
  console.log('Created 192x192 icon');
  
  // Create 512x512 icon
  const icon512 = createMusicIcon(512);
  fs.writeFileSync(path.join(iconsDir, 'icon-512x512.png'), icon512);
  console.log('Created 512x512 icon');
  
  console.log('PWA icons created successfully');
} catch (error) {
  console.error('Error creating icons:', error);
} 