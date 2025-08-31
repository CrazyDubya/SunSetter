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
  private currentStream: MediaStream | null = null;
  private currentTimestamp: number = Date.now();
  private currentLocation: LocationData | null = null;

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
      
      this.currentLocation = location;
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

      // Start rendering with celestial data
      this.startRendering(samples, location);
      
      // Ensure animation loop is running for 2D globe
      this.renderer.startAnimationLoop();
      
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
   * Start the rendering loop with celestial data
   */
  private startRendering(samples: SunSample[], location: LocationData): void {
    this.sensor.getHeading().then(heading => {
      this.renderer.updateData(samples, heading);
      
      // Get current celestial data for moon and sun
      const now = Date.now();
      const celestialData = this.ephemeris.getCelestialData(location.lat, location.lon, now);
      
      // Update globe with celestial positions
      this.renderer.updateCelestialPositions(celestialData, location.lat, location.lon);
      
      this.renderer.render2D(samples, heading);
    }).catch(() => {
      console.warn('Could not get device heading, using default (North)');
      this.renderer.updateData(samples, 0);
      
      // Still update celestial data without heading
      const now = Date.now();
      const celestialData = this.ephemeris.getCelestialData(location.lat, location.lon, now);
      this.renderer.updateCelestialPositions(celestialData, location.lat, location.lon);
      
      this.renderer.render2D(samples, 0);
    });
  }

  /**
   * Toggle between 2D and AR modes
   */
  async toggleRenderMode(): Promise<'2D' | 'AR'> {
    const targetMode = this.renderer.currentMode === '2D' ? 'AR' : '2D';

    if (targetMode === 'AR') {
      try {
        const stream = await this.sensor.startVideoStream();
        this.currentStream = stream;
        this.renderer.toggleMode(stream);
        this.renderer.startAnimationLoop();
        this.startOrientationUpdates();
        return 'AR';
      } catch (error) {
        this.handleError('Failed to start AR mode. Camera not available.');
        if (this.renderer.currentMode === 'AR') {
            this.renderer.toggleMode(); // switch back
        }
        return '2D';
      }
    } else { // Switching back to 2D
      if (this.currentStream) {
        this.currentStream.getTracks().forEach(track => track.stop());
        this.currentStream = null;
      }
      this.renderer.toggleMode();
      return '2D';
    }
  }

  /**
   * Switch camera between front and back
   */
  async switchCamera(): Promise<boolean> {
    if (!this.currentStream || this.renderer.currentMode !== 'AR') {
      return false;
    }

    try {
      const newStream = await this.sensor.switchCamera(this.currentStream);
      this.currentStream = newStream;
      
      // Update renderer with new stream
      this.renderer.toggleMode(); // Turn off current
      this.renderer.toggleMode(newStream); // Turn on with new stream
      
      return true;
    } catch (error) {
      console.error('Failed to switch camera:', error);
      return false;
    }
  }

  private startOrientationUpdates(): void {
    // Simplified, reliable orientation tracking
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const heading = event.alpha ?? 0;
      if (this.status.samples) {
        this.renderer.updateData(this.status.samples, heading);
      }
    };
    
    // Single event listener - keep it simple
    window.addEventListener('deviceorientation', handleOrientation, true);
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
   * Set time for celestial calculations
   */
  setTime(timestamp: number): void {
    this.currentTimestamp = timestamp;
    if (this.currentLocation) {
      this.updateCelestialData();
    }
  }

  /**
   * Jump to next sunrise
   */
  jumpToNextSunrise(): { time: number; azimuth: number } | null {
    if (!this.currentLocation) return null;
    
    const sunrise = this.ephemeris.findNextSunrise(
      this.currentLocation.lat, 
      this.currentLocation.lon, 
      this.currentTimestamp
    );
    
    if (sunrise.time > 0) {
      this.setTime(sunrise.time);
      return sunrise;
    }
    
    return null;
  }

  /**
   * Jump to next sunset
   */
  jumpToNextSunset(): { time: number; azimuth: number } | null {
    if (!this.currentLocation) return null;
    
    const sunset = this.ephemeris.findNextSunset(
      this.currentLocation.lat, 
      this.currentLocation.lon, 
      this.currentTimestamp
    );
    
    if (sunset.time > 0) {
      this.setTime(sunset.time);
      return sunset;
    }
    
    return null;
  }

  /**
   * Return to current time
   */
  returnToNow(): void {
    this.currentTimestamp = Date.now();
    if (this.currentLocation) {
      this.updateCelestialData();
    }
  }

  /**
   * Update celestial data for current time and location
   */
  private updateCelestialData(): void {
    if (!this.currentLocation) return;
    
    const celestialData = this.ephemeris.getCelestialDataForTime(
      this.currentLocation.lat,
      this.currentLocation.lon,
      this.currentTimestamp
    );
    
    this.renderer.updateCelestialPositions(
      celestialData, 
      this.currentLocation.lat, 
      this.currentLocation.lon
    );
  }

  /**
   * Get current timestamp
   */
  getCurrentTimestamp(): number {
    return this.currentTimestamp;
  }

  /**
   * Get current location
   */
  getCurrentLocation(): LocationData | null {
    return this.currentLocation;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.renderer.dispose();
  }
}