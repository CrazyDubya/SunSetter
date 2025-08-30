/**
 * SunSetter - AR Sun Overlay Web App
 * Main application entry point
 */

import { OrchestratorAgent, AppStatus } from './orchestrator.js';
import { DemoMode } from './demo.js';

class SunSetterApp {
  private orchestrator: OrchestratorAgent;
  private statusElement: HTMLElement;
  private locationElement: HTMLElement;
  private sunElement: HTMLElement;
  private locationBtn: HTMLButtonElement;
  private cameraBtn: HTMLButtonElement;
  private toggleBtn: HTMLButtonElement;
  private switchCameraBtn: HTMLButtonElement;
  private refreshBtn: HTMLButtonElement;

  constructor() {
    // Get DOM elements
    const app = document.getElementById('app');
    if (!app) {
      throw new Error('App container not found');
    }

    this.statusElement = document.getElementById('statusText')!;
    this.locationElement = document.getElementById('locationText')!;
    this.sunElement = document.getElementById('sunText')!;
    this.locationBtn = document.getElementById('locationBtn') as HTMLButtonElement;
    this.cameraBtn = document.getElementById('cameraBtn') as HTMLButtonElement;
    this.toggleBtn = document.getElementById('toggleView') as HTMLButtonElement;
    this.switchCameraBtn = document.getElementById('switchCameraBtn') as HTMLButtonElement;
    this.refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;

    // Initialize orchestrator
    this.orchestrator = new OrchestratorAgent(app);
    this.orchestrator.onStatusUpdate(this.handleStatusUpdate.bind(this));

    this.setupEventListeners();
    this.initialize();
    
    // Start regular moon updates
    this.startMoonUpdates();
  }

  private async initialize(): Promise<void> {
    try {
      await this.orchestrator.initialize();
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.updateStatus('Failed to initialize');
    }
  }

  private setupEventListeners(): void {
    // Location button
    this.locationBtn.addEventListener('click', async () => {
      this.locationBtn.disabled = true;
      this.locationBtn.textContent = 'Getting Location...';
      
      const success = await this.orchestrator.requestLocation();
      
      this.locationBtn.disabled = false;
      this.locationBtn.textContent = success ? 'Update Location' : 'Retry Location';
    });

    // Camera permission button  
    this.cameraBtn.addEventListener('click', async () => {
      this.cameraBtn.disabled = true;
      this.cameraBtn.textContent = 'Requesting Camera...';
      
      try {
        // Show detailed instructions for iOS users
        if (this.isIOSDevice()) {
          this.showIOSCameraInstructions();
        }
        
        // Request camera permission explicitly
        const hasPermission = await this.orchestrator['sensor'].requestCameraPermission();
        
        if (hasPermission) {
          this.cameraBtn.style.display = 'none';
          this.updateStatus('Camera permission granted - AR mode available');
          // Show success message
          this.showSuccessMessage('Camera access granted! You can now use AR mode.');
        } else {
          this.cameraBtn.textContent = 'Camera Denied - Try Settings';
          this.cameraBtn.disabled = false;
          this.showCameraHelp();
        }
      } catch (error) {
        console.error('Camera permission request failed:', error);
        this.cameraBtn.textContent = 'Camera Error - Need Help?';
        this.cameraBtn.disabled = false;
        this.showCameraHelp();
      }
    });

    // Toggle view button
    this.toggleBtn.addEventListener('click', async () => {
      this.toggleBtn.disabled = true;
      this.toggleBtn.textContent = 'Switching...';
      const mode = await this.orchestrator.toggleRenderMode();
      this.toggleBtn.textContent = `Switch to ${mode === '2D' ? 'AR' : '2D'}`;
      this.toggleBtn.disabled = false;
      
      // Show/hide camera switch button based on mode
      this.switchCameraBtn.style.display = mode === 'AR' ? 'inline-block' : 'none';
    });

    // Switch camera button
    this.switchCameraBtn.addEventListener('click', async () => {
      this.switchCameraBtn.disabled = true;
      this.switchCameraBtn.textContent = '📷 Switching...';
      
      const success = await this.orchestrator.switchCamera();
      
      if (success) {
        this.showSuccessMessage('Camera switched successfully!');
      } else {
        this.showSuccessMessage('Camera switch failed - try again');
      }
      
      this.switchCameraBtn.textContent = '📷 Switch Camera';
      this.switchCameraBtn.disabled = false;
    });

    // Force refresh button
    this.refreshBtn.addEventListener('click', async () => {
      this.refreshBtn.disabled = true;
      this.refreshBtn.textContent = '🔄 Clearing...';
      
      try {
        // Clear all caches
        await this.clearAllCaches();
        
        // Show confirmation
        this.showSuccessMessage('All caches cleared! Refreshing...');
        
        // Force page reload after a brief delay
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (error) {
        console.error('Failed to clear caches:', error);
        this.refreshBtn.textContent = '🔄 Force Refresh';
        this.refreshBtn.disabled = false;
      }
    });

    // Demo mode - show calculations with default location if user presses 'D' key
    window.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'd') {
        this.startDemoMode();
      }
    });

    // Handle device orientation change
    window.addEventListener('orientationchange', () => {
      // Delay to allow for orientation to settle
      setTimeout(() => {
        // Could trigger a re-render here if needed
      }, 500);
    });

    // Time navigation controls
    this.setupTimeNavigation();
  }

  private handleStatusUpdate(status: AppStatus): void {
    this.updateStatus(this.getStatusText(status));
    
    if (status.location) {
      this.updateLocation(status.location);
      // Update moon info when location is available
      this.updateMoonInfo(status.location, Date.now());
    }
    
    if (status.samples) {
      this.updateSunInfo(status.samples);
    }
    
    // Update button states based on status
    this.updateButtonStates(status);
  }

  private getStatusText(status: AppStatus): string {
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

  private updateStatus(text: string): void {
    this.statusElement.textContent = text;
  }

  private updateLocation(location: { lat: number; lon: number; accuracy: number }): void {
    const lat = location.lat.toFixed(4);
    const lon = location.lon.toFixed(4);
    const acc = Math.round(location.accuracy);
    this.locationElement.textContent = `${lat}, ${lon} (±${acc}m)`;
  }

  private updateSunInfo(samples: Array<{ t: number; az: number; el: number }>): void {
    // Find closest sun position sample
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
      
      // More accurate visibility determination
      const isVisible = closestSample.el > -0.833; // Account for atmospheric refraction
      const visibility = isVisible ? '☀️ visible' : '🌙 below horizon';
      
      // Add time context if data is old
      let timeContext = '';
      if (timeDiffHours > 1) {
        timeContext = ` (${Math.round(timeDiffHours)}h old)`;
      } else if (minTimeDiff > 300000) { // 5 minutes
        timeContext = ` (${Math.round(minTimeDiff / 60000)}m old)`;
      }
      
      // Get cardinal direction
      const direction = this.getCardinalDirection(az);
      
      this.sunElement.textContent = `${direction} ${az}°, ${el}° elevation - ${visibility}${timeContext}`;
    } else {
      this.sunElement.textContent = 'No sun data available';
    }
  }

  private getCardinalDirection(azimuth: number): string {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(azimuth / 22.5) % 16;
    return directions[index];
  }

  private updateButtonStates(status: AppStatus): void {
    // Enable/disable buttons based on status
    if (status.state === 'error') {
      this.locationBtn.textContent = 'Retry Location';
      this.locationBtn.disabled = false;
    } else if (status.location) {
      this.locationBtn.textContent = 'Update Location';
      this.locationBtn.disabled = false;
    }
    
    // Show camera button if we have location but AR might need permissions
    if (status.location && !this.cameraPermissionGranted()) {
      this.cameraBtn.style.display = 'inline-block';
    }
    
    // Toggle button only available when we have data
    this.toggleBtn.disabled = !status.samples;
  }

  private cameraPermissionGranted(): boolean {
    // Simple check - if camera button is hidden, permission was granted
    return this.cameraBtn.style.display === 'none';
  }

  private startDemoMode(): void {
    console.log('Starting demo mode with San Francisco location...');
    
    // Create demo instance
    const app = document.getElementById('app');
    if (!app) return;
    
    const demo = new DemoMode(app);
    demo.startDemo();
    
    // Update UI to show demo mode
    this.updateStatus('Demo mode active (San Francisco)');
    this.updateLocation({ lat: 37.7749, lon: -122.4194, accuracy: 10 });
    
    // Enable toggle button in demo mode
    this.toggleBtn.disabled = false;
    this.locationBtn.textContent = 'Get Real Location';
  }

  private isIOSDevice(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  private showIOSCameraInstructions(): void {
    const instructions = document.createElement('div');
    instructions.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 20px; border-radius: 10px; max-width: 90%; text-align: center; color: black;">
          <h3>📱 iOS Camera Setup</h3>
          <p><strong>When prompted:</strong></p>
          <p>1. Tap <strong>"Allow"</strong> when Safari asks for camera permission</p>
          <p>2. If no prompt appears, tap the address bar and look for the camera icon</p>
          <p>3. Or go to Settings > Safari > Camera > Allow</p>
          <button onclick="this.parentElement.parentElement.remove()" style="padding: 10px 20px; font-size: 16px; background: #007AFF; color: white; border: none; border-radius: 5px; margin-top: 10px;">Got it!</button>
        </div>
      </div>
    `;
    document.body.appendChild(instructions);
  }

  private showSuccessMessage(message: string): void {
    const success = document.createElement('div');
    success.innerHTML = `
      <div style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #4CAF50; color: white; padding: 15px 25px; border-radius: 25px; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
        ✅ ${message}
      </div>
    `;
    document.body.appendChild(success);
    setTimeout(() => success.remove(), 4000);
  }

  private showCameraHelp(): void {
    const help = document.createElement('div');
    const isIOS = this.isIOSDevice();
    help.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 20px; border-radius: 10px; max-width: 90%; text-align: left; color: black;">
          <h3>📷 Camera Access Help</h3>
          ${isIOS ? `
            <p><strong>For iOS Safari:</strong></p>
            <p>• Tap the address bar, look for camera icon 📷</p>
            <p>• Or: Settings > Safari > Camera > Allow</p>
            <p>• Or: Settings > Privacy & Security > Camera > Safari</p>
          ` : `
            <p><strong>For Chrome/Android:</strong></p>
            <p>• Tap the lock/info icon in address bar</p>
            <p>• Enable camera permission</p>
            <p>• Reload the page</p>
          `}
          <p><strong>Still not working?</strong></p>
          <p>• Try refreshing the page</p>
          <p>• Make sure you're using HTTPS</p>
          <p>• Check your device camera settings</p>
          <button onclick="this.parentElement.parentElement.remove()" style="padding: 10px 20px; font-size: 16px; background: #007AFF; color: white; border: none; border-radius: 5px; margin-top: 15px;">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(help);
  }

  private async clearAllCaches(): Promise<void> {
    try {
      console.log('Clearing all caches...');
      
      // Clear service worker caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => {
            console.log('Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }
      
      // Clear localStorage
      if (typeof Storage !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
      }
      
      // Unregister service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          console.log('Unregistering service worker:', registration.scope);
          await registration.unregister();
        }
      }
      
      console.log('All caches cleared successfully');
    } catch (error) {
      console.error('Error clearing caches:', error);
      throw error;
    }
  }

  private setupTimeNavigation(): void {
    const timeNavBtn = document.getElementById('timeNavBtn') as HTMLButtonElement;
    const timeControls = document.getElementById('timeControls') as HTMLDivElement;
    const closeTimeBtn = document.getElementById('closeTimeBtn') as HTMLButtonElement;
    const dateTimePicker = document.getElementById('dateTimePicker') as HTMLInputElement;
    const nextSunriseBtn = document.getElementById('nextSunriseBtn') as HTMLButtonElement;
    const nextSunsetBtn = document.getElementById('nextSunsetBtn') as HTMLButtonElement;
    const nowBtn = document.getElementById('nowBtn') as HTMLButtonElement;
    const moonElement = document.getElementById('moonText') as HTMLSpanElement;

    if (!timeNavBtn || !timeControls || !closeTimeBtn || !dateTimePicker || 
        !nextSunriseBtn || !nextSunsetBtn || !nowBtn || !moonElement) {
      console.warn('Time navigation elements not found');
      return;
    }

    // Toggle time navigation panel
    timeNavBtn.addEventListener('click', () => {
      const isVisible = timeControls.style.display !== 'none';
      timeControls.style.display = isVisible ? 'none' : 'block';
      
      if (!isVisible) {
        // Set current time in date picker
        const now = new Date();
        const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        dateTimePicker.value = localDateTime;
      }
    });

    // Close time navigation panel
    closeTimeBtn.addEventListener('click', () => {
      timeControls.style.display = 'none';
    });

    // Date/time picker change
    dateTimePicker.addEventListener('change', () => {
      const selectedTime = new Date(dateTimePicker.value).getTime();
      if (!isNaN(selectedTime)) {
        this.orchestrator.setTime(selectedTime);
        this.updateTimeInfo(selectedTime);
      }
    });

    // Next sunrise button
    nextSunriseBtn.addEventListener('click', () => {
      const result = this.orchestrator.jumpToNextSunrise();
      if (result) {
        this.updateTimeInfo(result.time);
        this.showSuccessMessage(`Next sunrise: ${this.formatDateTime(result.time)} at ${Math.round(result.azimuth)}° azimuth`);
        
        // Update date picker
        const date = new Date(result.time);
        const localDateTime = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        dateTimePicker.value = localDateTime;
      } else {
        this.showSuccessMessage('Could not find next sunrise');
      }
    });

    // Next sunset button
    nextSunsetBtn.addEventListener('click', () => {
      const result = this.orchestrator.jumpToNextSunset();
      if (result) {
        this.updateTimeInfo(result.time);
        this.showSuccessMessage(`Next sunset: ${this.formatDateTime(result.time)} at ${Math.round(result.azimuth)}° azimuth`);
        
        // Update date picker
        const date = new Date(result.time);
        const localDateTime = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        dateTimePicker.value = localDateTime;
      } else {
        this.showSuccessMessage('Could not find next sunset');
      }
    });

    // Return to now button
    nowBtn.addEventListener('click', () => {
      this.orchestrator.returnToNow();
      this.updateTimeInfo(Date.now());
      this.showSuccessMessage('Returned to current time');
      
      // Reset date picker to current time
      const now = new Date();
      const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      dateTimePicker.value = localDateTime;
    });

    // Update moon display every second when time controls are visible
    const updateMoonDisplay = () => {
      if (timeControls.style.display !== 'none') {
        const location = this.orchestrator.getCurrentLocation();
        if (location) {
          const timestamp = this.orchestrator.getCurrentTimestamp();
          // This will trigger moon info update through the status callback
          this.updateMoonInfo(location, timestamp);
        }
      }
    };
    
    setInterval(updateMoonDisplay, 1000);
  }

  private updateTimeInfo(timestamp: number): void {
    const location = this.orchestrator.getCurrentLocation();
    if (location) {
      this.updateMoonInfo(location, timestamp);
    }
  }

  private updateMoonInfo(location: { lat: number; lon: number }, timestamp: number): void {
    try {
      // Access ephemeris properly through the orchestrator
      const ephemeris = (this.orchestrator as any).ephemeris;
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
        const direction = this.getCardinalDirection(az);
        const isVisible = moon.el > -6; // Moon visible threshold
        const visibility = isVisible ? '🌙 visible' : '🌑 below horizon';
        
        moonElement.textContent = `${direction} ${az}°, ${el}° elevation - ${visibility} (${illumination}% lit, phase ${phase}%)`;
      } else {
        console.log('Moon element not found or no moon data available');
      }
    } catch (error) {
      console.error('Failed to update moon info:', error);
      const moonElement = document.getElementById('moonText') as HTMLSpanElement;
      if (moonElement) {
        moonElement.textContent = 'Moon data unavailable';
      }
    }
  }

  private formatDateTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  private startMoonUpdates(): void {
    // Update moon info every 30 seconds
    setInterval(() => {
      const location = this.orchestrator.getCurrentLocation();
      if (location) {
        this.updateMoonInfo(location, Date.now());
      }
    }, 30000);
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  try {
    new SunSetterApp();
  } catch (error) {
    console.error('Failed to start SunSetter app:', error);
    document.body.innerHTML = `
      <div style="padding: 20px; color: red; text-align: center;">
        <h2>Failed to start SunSetter</h2>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    `;
  }
});

// Handle uncaught errors
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});