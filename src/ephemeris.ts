/**
 * Ephemeris Agent - Computes sun positions offline
 * Based on NOAA Solar Position Algorithm (SPA)
 */

export interface SunSample {
  t: number;      // timestamp
  az: number;     // azimuth in degrees (0=N, 90=E, 180=S, 270=W)
  el: number;     // elevation in degrees (0=horizon, 90=zenith)
  error?: string; // optional error message
}

export interface LocationParams {
  lat: number;    // latitude in degrees
  lon: number;    // longitude in degrees
  alt?: number;   // altitude in meters (default: 0)
}

export interface TrackParams extends LocationParams {
  t0: number;      // start timestamp
  durationH: number; // duration in hours
  stepMin: number;   // step in minutes
}

export class EphemerisAgent {
  /**
   * Compute sun track for a given time period
   */
  computeTrack(params: TrackParams): SunSample[] {
    const { lat, lon, alt = 0, t0, durationH, stepMin } = params;
    const samples: SunSample[] = [];
    
    const stepMs = stepMin * 60 * 1000;
    const endTime = t0 + (durationH * 3600 * 1000);
    
    for (let t = t0; t <= endTime; t += stepMs) {
      const position = this.computeSunPosition(lat, lon, alt, t);
      samples.push({
        t,
        az: position.azimuth,
        el: position.elevation
      });
    }
    
    return samples;
  }

  /**
   * Compute sun position for a specific time and location
   * Simplified algorithm based on NOAA SPA
   */
  computeSunPosition(lat: number, lon: number, _alt: number, timestamp: number) {
    const date = new Date(timestamp);
    
    // Julian day calculation
    const julianDay = this.getJulianDay(date);
    
    // Julian century from J2000.0
    const T = (julianDay - 2451545.0) / 36525.0;
    
    // Geometric mean longitude of sun (degrees)
    const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
    
    // Geometric mean anomaly of sun (degrees)
    const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    
    // Eccentricity of earth's orbit (not currently used in simplified calculation)
    // const _e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    
    // Sun's equation of center
    const C = Math.sin(this.degToRad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
              Math.sin(this.degToRad(2 * M)) * (0.019993 - 0.000101 * T) +
              Math.sin(this.degToRad(3 * M)) * 0.000289;
    
    // True longitude of sun
    const trueLon = L0 + C;
    
    // Apparent longitude of sun
    const omega = 125.04 - 1934.136 * T;
    const lambda = trueLon - 0.00569 - 0.00478 * Math.sin(this.degToRad(omega));
    
    // Obliquity of ecliptic
    const epsilon0 = 23 + (26 + ((21.448 - T * (46.815 + T * (0.00059 - T * 0.001813)))) / 60) / 60;
    const epsilon = epsilon0 + 0.00256 * Math.cos(this.degToRad(omega));
    
    // Right ascension and declination
    const alpha = Math.atan2(
      Math.cos(this.degToRad(epsilon)) * Math.sin(this.degToRad(lambda)),
      Math.cos(this.degToRad(lambda))
    );
    const delta = Math.asin(Math.sin(this.degToRad(epsilon)) * Math.sin(this.degToRad(lambda)));
    
    // Greenwich mean sidereal time
    const gmst = this.getGMST(date);
    
    // Local hour angle
    const H = this.degToRad((gmst + lon) - this.radToDeg(alpha));
    
    // Convert to horizontal coordinates
    const latRad = this.degToRad(lat);
    
    // Elevation (altitude)
    const elevation = Math.asin(
      Math.sin(latRad) * Math.sin(delta) +
      Math.cos(latRad) * Math.cos(delta) * Math.cos(H)
    );
    
    // Azimuth
    const azimuth = Math.atan2(
      Math.sin(H),
      Math.cos(H) * Math.sin(latRad) - Math.tan(delta) * Math.cos(latRad)
    );
    
    return {
      elevation: this.radToDeg(elevation),
      azimuth: (this.radToDeg(azimuth) + 180) % 360 // Convert to 0-360 range
    };
  }

  /**
   * Solve for sunrise and sunset times
   */
  solveSunriseSunset(lat: number, lon: number, date: Date): { sunrise: number; sunset: number } {
    const samples = 48; // Every 30 minutes
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    
    let sunrise = 0;
    let sunset = 0;
    let prevElevation = -90;
    
    for (let i = 0; i < samples; i++) {
      const t = startOfDay + (i * 30 * 60 * 1000); // 30-minute intervals
      const pos = this.computeSunPosition(lat, lon, 0, t);
      
      // Look for horizon crossings
      if (prevElevation < 0 && pos.elevation >= 0 && sunrise === 0) {
        sunrise = t;
      }
      if (prevElevation >= 0 && pos.elevation < 0 && sunset === 0 && sunrise > 0) {
        sunset = t;
      }
      
      prevElevation = pos.elevation;
    }
    
    return { sunrise, sunset };
  }

  private getJulianDay(date: Date): number {
    const a = Math.floor((14 - (date.getMonth() + 1)) / 12);
    const y = date.getFullYear() + 4800 - a;
    const m = (date.getMonth() + 1) + 12 * a - 3;
    
    return date.getDate() + Math.floor((153 * m + 2) / 5) + 365 * y + 
           Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045 +
           (date.getHours() - 12) / 24 + date.getMinutes() / 1440 + date.getSeconds() / 86400;
  }

  private getGMST(date: Date): number {
    const jd = this.getJulianDay(date);
    const T = (jd - 2451545.0) / 36525.0;
    
    let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 
               T * T * (0.000387933 - T / 38710000.0);
    
    return gmst % 360;
  }

  private degToRad(degrees: number): number {
    return degrees * Math.PI / 180;
  }

  private radToDeg(radians: number): number {
    return radians * 180 / Math.PI;
  }
}