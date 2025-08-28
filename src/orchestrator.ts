/**
 * Orchestrator Agent - Sequences phases, evaluates states, triggers adaptations
 */

import { EphemerisAgent, SunSample, TrackParams } from './ephemeris.js';
import { SensorAgent, LocationData, SensorError } from './sensor.js';
import { RenderingAgent } from './rendering.js';

export type AppState = 'init' | 'permissions' | 'sensing' | 'computing' | 'rendering' | 'error' | 'fallback';

export interface AppStatus {
  state: AppState;
  confidence: number;
  location?: LocationData;
  samples?: SunSample[];
  error?: string;
}

export class OrchestratorAgent {
  private ephemeris: EphemerisAgent;
  private sensor: SensorAgent;
  private renderer: RenderingAgent;
  private status: AppStatus = { state: 'init', confidence: 0 };
  private statusCallbacks: ((status: AppStatus) => void)[] = [];

  constructor(container: HTMLElement) {
    this.ephemeris = new EphemerisAgent();
    this.sensor = new SensorAgent();
    this.renderer = new RenderingAgent(container);
    
    this.updateStatus({ state: 'init', confidence: 0 });
  }

  /**
   * Initialize the application flow
   */
  async initialize(): Promise<void> {
    try {
      this.updateStatus({ state: 'permissions', confidence: 10 });
      
      // Check if we have cached location
      const cachedLocation = this.sensor.getCachedLocation();
      if (cachedLocation && Date.now() - cachedLocation.timestamp < 300000) { // 5 minutes
        this.updateStatus({ 
          state: 'computing', 
          confidence: 60,
          location: cachedLocation 
        });
        await this.computeAndRender(cachedLocation);
      } else {
        this.updateStatus({ state: 'permissions', confidence: 20 });
      }
    } catch (error) {
      console.error('Initialization error:', error);
      this.handleError(error instanceof Error ? error.message : 'Unknown initialization error');
    }
  }

  /**
   * Request and handle location permission
   */
  async requestLocation(): Promise<boolean> {
    try {
      this.updateStatus({ state: 'permissions', confidence: 30 });
      
      const location = await this.sensor.getLocation(10000);
      this.updateStatus({ 
        state: 'sensing', 
        confidence: 70,
        location 
      });
      
      await this.computeAndRender(location);
      return true;
      
    } catch (error) {
      console.error('Location request failed:', error);
      
      if (error instanceof SensorError) {
        if (error.type === 'permission') {
          this.handleError('Location permission denied. Please enable location access and try again.');
        } else if (error.type === 'timeout') {
          this.handleError('Location request timed out. Please try again.');
        } else {
          this.handleError('Location not available. Please check your device settings.');
        }
      } else {
        this.handleError('Failed to get location');
      }
      
      return false;
    }
  }

  /**
   * Compute sun track and render
   */
  private async computeAndRender(location: LocationData): Promise<void> {
    try {
      this.updateStatus({ 
        state: 'computing', 
        confidence: 80,
        location 
      });

      // Compute 24-hour sun track
      const now = Date.now();
      const trackParams: TrackParams = {
        lat: location.lat,
        lon: location.lon,
        alt: location.alt || 0,
        t0: now,
        durationH: 24,
        stepMin: 5 // 5-minute intervals
      };

      const samples = this.ephemeris.computeTrack(trackParams);
      
      // Also get sunrise/sunset for today (for future use)
      // const today = new Date();
      // const _sunriseSunset = this.ephemeris.solveSunriseSunset(location.lat, location.lon, today);
      
      this.updateStatus({ 
        state: 'rendering', 
        confidence: 90,
        location,
        samples 
      });

      // Start rendering
      this.startRendering(samples);
      
      this.updateStatus({ 
        state: 'rendering', 
        confidence: 100,
        location,
        samples 
      });

    } catch (error) {
      console.error('Compute and render error:', error);
      this.handleError(error instanceof Error ? error.message : 'Failed to compute sun position');
    }
  }

  /**
   * Start the rendering loop
   */
  private startRendering(samples: SunSample[]): void {
    // Get current heading (fallback to 0 if not available)
    let heading = 0;
    
    this.sensor.getHeading().then(h => heading = h).catch(() => {
      console.warn('Could not get device heading, using default (North)');
    });

    // Render in 2D mode
    this.renderer.render2D(samples, heading);
  }

  /**
   * Toggle between 2D and AR modes
   */
  toggleRenderMode(): '2D' | 'AR' {
    return this.renderer.toggleMode();
  }

  /**
   * Handle errors and fallback states
   */
  private handleError(message: string): void {
    this.updateStatus({ 
      state: 'error', 
      confidence: 0,
      error: message 
    });
  }

  /**
   * Update application status and notify callbacks
   */
  private updateStatus(updates: Partial<AppStatus>): void {
    this.status = { ...this.status, ...updates };
    this.statusCallbacks.forEach(callback => callback(this.status));
  }

  /**
   * Subscribe to status updates
   */
  onStatusUpdate(callback: (status: AppStatus) => void): void {
    this.statusCallbacks.push(callback);
  }

  /**
   * Get current status
   */
  getStatus(): AppStatus {
    return { ...this.status };
  }

  /**
   * Plan execution graph based on capabilities
   */
  planGraph(capabilities: { location: boolean; orientation: boolean; camera: boolean }): string[] {
    const plan: string[] = ['init'];
    
    if (capabilities.location) {
      plan.push('get_location', 'compute_track');
    } else {
      plan.push('request_manual_location');
    }
    
    if (capabilities.orientation) {
      plan.push('get_orientation');
    }
    
    if (capabilities.camera) {
      plan.push('render_ar');
    } else {
      plan.push('render_2d');
    }
    
    plan.push('monitor');
    return plan;
  }

  /**
   * Select fallback mode based on confidence
   */
  selectFallback(confidence: number): 'manual' | '2d' | 'demo' {
    if (confidence < 30) {
      return 'demo'; // Show demo mode with default location
    } else if (confidence < 70) {
      return 'manual'; // Request manual input
    } else {
      return '2d'; // Use 2D mode
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.renderer.dispose();
  }
}