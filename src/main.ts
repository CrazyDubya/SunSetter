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
  private toggleBtn: HTMLButtonElement;

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
    this.toggleBtn = document.getElementById('toggleView') as HTMLButtonElement;

    // Initialize orchestrator
    this.orchestrator = new OrchestratorAgent(app);
    this.orchestrator.onStatusUpdate(this.handleStatusUpdate.bind(this));

    this.setupEventListeners();
    this.initialize();
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

    // Toggle view button
    this.toggleBtn.addEventListener('click', async () => {
      this.toggleBtn.disabled = true;
      this.toggleBtn.textContent = 'Switching...';
      const mode = await this.orchestrator.toggleRenderMode();
      this.toggleBtn.textContent = `Switch to ${mode === '2D' ? 'AR' : '2D'}`;
      this.toggleBtn.disabled = false;
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
  }

  private handleStatusUpdate(status: AppStatus): void {
    this.updateStatus(this.getStatusText(status));
    
    if (status.location) {
      this.updateLocation(status.location);
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
    // Find current sun position
    const now = Date.now();
    const currentSample = samples.find(sample => Math.abs(sample.t - now) < 300000); // Within 5 minutes
    
    if (currentSample) {
      const az = Math.round(currentSample.az);
      const el = Math.round(currentSample.el * 10) / 10;
      
      if (currentSample.el > 0) {
        this.sunElement.textContent = `${az}° az, ${el}° el (visible)`;
      } else {
        this.sunElement.textContent = `${az}° az, ${el}° el (below horizon)`;
      }
    } else {
      this.sunElement.textContent = 'Calculating...';
    }
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
    
    // Toggle button only available when we have data
    this.toggleBtn.disabled = !status.samples;
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