/**
 * This file helps verify PWA installability criteria
 * Run with: node checkPwa.js
 */
const fs = require('fs');
const path = require('path');

console.log('PWA Installability Checker');
console.log('=========================\n');

// Check if manifest.json exists
let manifestExists = false;
let manifestContent = null;

try {
  const manifestPath = path.join(__dirname, 'manifest.json');
  manifestExists = fs.existsSync(manifestPath);
  
  if (manifestExists) {
    manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log('✅ manifest.json exists');
  } else {
    console.log('❌ manifest.json is missing');
  }
} catch (error) {
  console.log('❌ Error reading manifest.json:', error.message);
}

// Check manifest properties
if (manifestContent) {
  const requiredProperties = ['name', 'short_name', 'icons', 'start_url', 'display'];
  const missingProps = requiredProperties.filter(prop => !manifestContent[prop]);
  
  if (missingProps.length === 0) {
    console.log('✅ manifest.json contains all required properties');
  } else {
    console.log('❌ manifest.json is missing properties:', missingProps.join(', '));
  }
  
  // Check icons
  if (manifestContent.icons && Array.isArray(manifestContent.icons)) {
    const has192Icon = manifestContent.icons.some(icon => 
      icon.sizes === '192x192' && fs.existsSync(path.join(__dirname, icon.src))
    );
    
    const has512Icon = manifestContent.icons.some(icon => 
      icon.sizes === '512x512' && fs.existsSync(path.join(__dirname, icon.src))
    );
    
    console.log(has192Icon ? '✅ 192x192 icon exists' : '❌ 192x192 icon is missing or file not found');
    console.log(has512Icon ? '✅ 512x512 icon exists' : '❌ 512x512 icon is missing or file not found');
  } else {
    console.log('❌ manifest.json has no icons array');
  }
}

// Check service worker
let swExists = false;
try {
  const swPath = path.join(__dirname, 'sw.js');
  swExists = fs.existsSync(swPath);
  console.log(swExists ? '✅ Service worker exists' : '❌ Service worker is missing');
} catch (error) {
  console.log('❌ Error checking service worker:', error.message);
}

// Check HTTPS
console.log('\n⚠️ Note: For PWA installation to work, the site must be served over HTTPS or localhost');

// Check index.html for service worker registration
try {
  const indexPath = path.join(__dirname, 'index.html');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  
  const hasSwRegistration = indexContent.includes('serviceWorker.register');
  console.log(hasSwRegistration ? 
    '✅ Service worker registration found in index.html' : 
    '❌ Service worker registration missing in index.html');
  
  const hasManifestLink = indexContent.includes('<link rel="manifest"');
  console.log(hasManifestLink ? 
    '✅ Manifest link found in index.html' : 
    '❌ Manifest link missing in index.html');
    
} catch (error) {
  console.log('❌ Error checking index.html:', error.message);
}

console.log('\nSummary:');
console.log('For a PWA to be installable, it needs:');
console.log('1. A valid manifest.json with name, short_name, icons, start_url and display');
console.log('2. At least a 192x192 and a 512x512 icon');
console.log('3. A registered service worker with a fetch event handler');
console.log('4. To be served over HTTPS (except on localhost)');

console.log('\nTroubleshooting tips:');
console.log('- Use Chrome DevTools > Application > Manifest to check manifest status');
console.log('- Use Chrome DevTools > Application > Service Workers to check service worker status');
console.log('- Use Chrome DevTools > Console to check for any JavaScript errors');
console.log('- Test with Chrome in Incognito mode to avoid cached service workers'); 