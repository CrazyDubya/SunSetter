/**
 * SunSetter - AR Sun Overlay Web App
 * Main application entry point
 */

import { OrchestratorAgent, AppStatus } from './orchestrator.js';
import { DemoMode } from './demo.js';
import { 
  updateStatus, 
  updateLocation, 
  updateSunInfo, 
  updateMoonInfo,
  showDemoNotification,
  getStatusText,
} from './ui/status-display.js';
import {
  handleLocationButton,
  handleCameraButton,
  handleToggleView,
  handleSwitchCamera,
  handleRefreshButton,
  setupTimeNavigation,
} from './ui/event-handlers.js';

class SunSetterApp {
  private orchestrator: OrchestratorAgent;
  private locationBtn: HTMLButtonElement;
  private cameraBtn: HTMLButtonElement;
  private toggleBtn: HTMLButtonElement;
  private switchCameraBtn: HTMLButtonElement;
  private refreshBtn: HTMLButtonElement;

  constructor() {
    const app = document.getElementById('app');
    if (!app) {
      throw new Error('App container not found');
    }

    this.locationBtn = document.getElementById('locationBtn') as HTMLButtonElement;
    this.cameraBtn = document.getElementById('cameraBtn') as HTMLButtonElement;
    this.toggleBtn = document.getElementById('toggleView') as HTMLButtonElement;
    this.switchCameraBtn = document.getElementById('switchCameraBtn') as HTMLButtonElement;
    this.refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;

    this.orchestrator = new OrchestratorAgent(app);
    this.orchestrator.onStatusUpdate(this.handleStatusUpdate.bind(this));

    this.setupEventListeners();
    this.initialize();
    
    this.startMoonUpdates();
  }

  private async initialize(): Promise<void> {
    try {
      await this.orchestrator.initialize();
    } catch (error) {
      console.error('Failed to initialize app:', error);
      updateStatus('Failed to initialize');
    }
  }

  private setupEventListeners(): void {
    // Location button
    this.locationBtn.addEventListener('click', async () => {
      await handleLocationButton(this.orchestrator, this.locationBtn);
    });

    // Camera permission button  
    this.cameraBtn.addEventListener('click', async () => {
      await handleCameraButton(this.orchestrator, this.cameraBtn);
    });

    // Toggle view button
    this.toggleBtn.addEventListener('click', async () => {
      await handleToggleView(this.orchestrator, this.toggleBtn, this.switchCameraBtn);
    });

    // Switch camera button
    this.switchCameraBtn.addEventListener('click', async () => {
      await handleSwitchCamera(this.orchestrator, this.switchCameraBtn);
    });

    // Force refresh button
    this.refreshBtn.addEventListener('click', async () => {
      await handleRefreshButton(this.refreshBtn, this.clearAllCaches.bind(this));
    });

    // Demo mode - show calculations with default location if user presses 'D' key
    window.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'd') {
        this.startDemoMode();
      }
    });

    // Handle device orientation change
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        // Could trigger a re-render here if needed
      }, 500);
    });

    // Time navigation controls
    setupTimeNavigation(this.orchestrator, (this.orchestrator as any).ephemeris);
  }

  private handleStatusUpdate(status: AppStatus): void {
    updateStatus(getStatusText(status));
    
    if (status.location) {
      updateLocation(status.location);
      updateMoonInfo((this.orchestrator as any).ephemeris, status.location, Date.now());
    }
    
    if (status.samples) {
      updateSunInfo(status.samples);
    }
    
    this.updateButtonStates(status);
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
    
    updateStatus('Starting demo mode...');
    
    const app = document.getElementById('app');
    if (!app) return;
    
    try {
      const demo = new DemoMode(app);
      demo.startDemo();
      
      updateStatus('Demo mode active (San Francisco)');
      updateLocation({ lat: 37.7749, lon: -122.4194, accuracy: 10 });
      
      this.toggleBtn.disabled = false;
      this.locationBtn.textContent = 'Get Real Location';
      
      showDemoNotification();
      
    } catch (error) {
      console.error('Failed to start demo mode:', error);
      updateStatus('Demo mode failed to start');
    }
  }

  private async clearAllCaches(): Promise<void> {
    try {
      console.log('Clearing all caches...');
      
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => {
            console.log('Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }
      
      if (typeof Storage !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
      }
      
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

  private startMoonUpdates(): void {
    setInterval(() => {
      const location = this.orchestrator.getCurrentLocation();
      if (location) {
        updateMoonInfo((this.orchestrator as any).ephemeris, location, Date.now());
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