/**
 * Status Display Module
 * Handles all status, location, and sun/moon information display
 * Provides functions for updating various UI elements with celestial data
 */

import type { AppStatus } from '../orchestrator.js';

/**
 * Updates the main status text display
 * @param text - Status message to display
 */
export function updateStatus(text: string): void {
  const statusElement = document.getElementById('statusText');
  if (statusElement) {
    statusElement.textContent = text;
  }
}

/**
 * Updates the location display with coordinates and accuracy
 * @param location - Location data with latitude, longitude, and accuracy
 */
export function updateLocation(location: { lat: number; lon: number; accuracy: number }): void {
  const locationElement = document.getElementById('locationText');
  if (locationElement) {
    const lat = location.lat.toFixed(4);
    const lon = location.lon.toFixed(4);
    const acc = Math.round(location.accuracy);
    locationElement.textContent = `${lat}, ${lon} (±${acc}m)`;
  }
}

/**
 * Updates the sun information display with azimuth, elevation, and visibility
 * Shows cardinal direction, angle, and whether the sun is above the horizon
 * @param samples - Array of sun position samples (finds closest to current time)
 */
export function updateSunInfo(samples: Array<{ t: number; az: number; el: number }>): void {
  const sunElement = document.getElementById('sunText');
  if (!sunElement) return;
  
  const now = Date.now();
  let closestSample = null;
  let minTimeDiff = Infinity;
  
  for (const sample of samples) {
    const timeDiff = Math.abs(sample.t - now);
    if (timeDiff < minTimeDiff) {
      minTimeDiff = timeDiff;
      closestSample = sample;
    }
  }
  
  if (closestSample) {
    const az = Math.round(closestSample.az);
    const el = Math.round(closestSample.el * 10) / 10;
    const timeDiffHours = minTimeDiff / (1000 * 60 * 60);
    
    const isVisible = closestSample.el > -0.833;
    const visibility = isVisible ? '☀️ visible' : '🌙 below horizon';
    
    let timeContext = '';
    if (timeDiffHours > 1) {
      timeContext = ` (${Math.round(timeDiffHours)}h old)`;
    } else if (minTimeDiff > 300000) {
      timeContext = ` (${Math.round(minTimeDiff / 60000)}m old)`;
    }
    
    const direction = getCardinalDirection(az);
    sunElement.textContent = `${direction} ${az}°, ${el}° elevation - ${visibility}${timeContext}`;
  } else {
    sunElement.textContent = 'No sun data available';
  }
}

/**
 * Updates the moon information display
 * Shows moon position, visibility, illumination percentage, and phase
 * @param ephemeris - Ephemeris agent for calculating moon position
 * @param location - User's location for moon calculations
 * @param timestamp - Time to calculate moon position for
 */
export function updateMoonInfo(
  ephemeris: any,
  location: { lat: number; lon: number },
  timestamp: number
): void {
  try {
    if (!ephemeris) {
      console.error('Ephemeris agent not available');
      return;
    }
    
    const celestialData = ephemeris.getCelestialDataForTime(
      location.lat,
      location.lon,
      timestamp
    );
    
    const moonElement = document.getElementById('moonText') as HTMLSpanElement;
    if (moonElement && celestialData && celestialData.moon) {
      const moon = celestialData.moon;
      const az = Math.round(moon.az);
      const el = Math.round(moon.el * 10) / 10;
      const phase = Math.round(moon.phase * 100);
      const illumination = Math.round(moon.illumination * 100);
      const direction = getCardinalDirection(az);
      const isVisible = moon.el > -6;
      const visibility = isVisible ? '🌙 visible' : '🌑 below horizon';
      
      moonElement.textContent = `${direction} ${az}°, ${el}° elevation - ${visibility} (${illumination}% lit, phase ${phase}%)`;
    }
  } catch (error) {
    console.error('Failed to update moon info:', error);
    const moonElement = document.getElementById('moonText') as HTMLSpanElement;
    if (moonElement) {
      moonElement.textContent = 'Moon data unavailable';
    }
  }
}

/**
 * Displays a success message as a temporary notification
 * Shows a green notification that auto-dismisses after 4 seconds
 * @param message - Success message text to display
 */
export function showSuccessMessage(message: string): void {
  const success = document.createElement('div');
  success.innerHTML = `
    <div style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #4CAF50; color: white; padding: 15px 25px; border-radius: 25px; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
      ✅ ${message}
    </div>
  `;
  document.body.appendChild(success);
  setTimeout(() => success.remove(), 4000);
}

/**
 * Displays an error message as a temporary notification
 * Shows a red notification that auto-dismisses after 4 seconds
 * @param message - Error message text to display
 */
export function showErrorMessage(message: string): void {
  const error = document.createElement('div');
  error.innerHTML = `
    <div style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #f44336; color: white; padding: 15px 25px; border-radius: 25px; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
      ❌ ${message}
    </div>
  `;
  document.body.appendChild(error);
  setTimeout(() => error.remove(), 4000);
}

/**
 * Shows a demo mode notification
 * Displays when the app is running in demo mode with default location
 */
export function showDemoNotification(): void {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 20px;
    border-radius: 12px;
    z-index: 10000;
    text-align: center;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    animation: fadeInOut 3s ease-in-out;
  `;
  notification.innerHTML = `
    <h3 style="margin: 0 0 10px 0; color: #00D4FF;">🌞 Demo Mode Active</h3>
    <p style="margin: 0; opacity: 0.8;">Showing sun path for San Francisco</p>
  `;
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
      20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
    style.remove();
  }, 3000);
}

/**
 * Converts AppStatus to human-readable text
 * Maps application state to user-friendly status messages
 * @param status - Application status object
 * @returns Human-readable status text
 */
export function getStatusText(status: AppStatus): string {
  switch (status.state) {
    case 'init':
      return 'Initializing...';
    case 'permissions':
      return 'Requesting permissions...';
    case 'sensing':
      return 'Getting sensor data...';
    case 'computing':
      return 'Computing sun position...';
    case 'rendering':
      return `Ready (${Math.round(status.confidence)}% confidence)`;
    case 'error':
      return `Error: ${status.error || 'Unknown error'}`;
    case 'fallback':
      return 'Running in fallback mode';
    default:
      return 'Unknown state';
  }
}

/**
 * Formats a timestamp into a human-readable date/time string
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Localized date/time string
 */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Converts azimuth degrees to cardinal direction
 */
function getCardinalDirection(azimuth: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(azimuth / 22.5) % 16;
  return directions[index];
}
