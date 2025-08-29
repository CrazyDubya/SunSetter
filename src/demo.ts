/**
 * Demo mode for SunSetter - shows sun calculations with default location
 */

import { EphemerisAgent, TrackParams } from './ephemeris.js';
import { RenderingAgent } from './rendering.js';

export class DemoMode {
  private ephemeris: EphemerisAgent;
  private renderer: RenderingAgent;

  constructor(container: HTMLElement) {
    this.ephemeris = new EphemerisAgent();
    this.renderer = new RenderingAgent(container);
  }

  /**
   * Start demo mode with a default location (San Francisco)
   */
  startDemo(): void {
    // Use San Francisco as default location
    const demoLocation = {
      lat: 37.7749,
      lon: -122.4194,
      alt: 0
    };

    console.log('Starting demo mode with location:', demoLocation);

    // Compute sun track for 24 hours
    const now = Date.now();
    const trackParams: TrackParams = {
      lat: demoLocation.lat,
      lon: demoLocation.lon,
      alt: demoLocation.alt,
      t0: now,
      durationH: 24,
      stepMin: 5 // 5-minute intervals
    };

    const samples = this.ephemeris.computeTrack(trackParams);
    
    // Find current sun position
    const currentSample = samples.find(sample => Math.abs(sample.t - now) < 300000); // Within 5 minutes
    
    if (currentSample) {
      console.log('Current sun position:', {
        azimuth: currentSample.az.toFixed(2) + '°',
        elevation: currentSample.el.toFixed(2) + '°',
        visible: currentSample.el > 0
      });
    }

    // Render the sun path
    this.renderer.render2D(samples, 0);

    // Log some interesting data points
    this.logSunData(samples, demoLocation);
  }

  private logSunData(samples: Array<{ t: number; az: number; el: number }>, location: { lat: number; lon: number }): void {
    console.log('=== SunSetter Demo Data ===');
    console.log(`Location: ${location.lat.toFixed(4)}°N, ${Math.abs(location.lon).toFixed(4)}°W`);
    
    const now = Date.now();
    const currentSample = samples.find(s => Math.abs(s.t - now) < 300000);
    
    if (currentSample) {
      console.log(`Current Sun: ${currentSample.az.toFixed(1)}° az, ${currentSample.el.toFixed(1)}° el`);
      console.log(`Status: ${currentSample.el > 0 ? 'Visible above horizon' : 'Below horizon'}`);
    }

    // Find sunrise/sunset approximate times
    let sunrise = null;
    let sunset = null;
    let prevElevation = -90;

    for (const sample of samples) {
      if (prevElevation < 0 && sample.el >= 0 && !sunrise) {
        sunrise = sample.t;
      }
      if (prevElevation >= 0 && sample.el < 0 && sunrise && !sunset) {
        sunset = sample.t;
      }
      prevElevation = sample.el;
    }

    if (sunrise) {
      console.log(`Sunrise: ${new Date(sunrise).toLocaleTimeString()}`);
    }
    if (sunset) {
      console.log(`Sunset: ${new Date(sunset).toLocaleTimeString()}`);
    }

    // Find highest point (solar noon)
    const maxElevation = Math.max(...samples.map(s => s.el));
    const maxSample = samples.find(s => s.el === maxElevation);
    if (maxSample) {
      console.log(`Solar Noon: ${new Date(maxSample.t).toLocaleTimeString()} (${maxElevation.toFixed(1)}° elevation)`);
    }
  }
}