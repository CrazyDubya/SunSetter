/**
 * Ephemeris Agent - Computes sun positions offline
 * Based on NOAA Solar Position Algorithm (SPA)
 */

export interface SunSample {
  t: number;      // timestamp
  az: number;     // azimuth in degrees (0=N, 90=E, 180=S, 270=W)
  el: number;     // elevation in degrees (0=horizon, 90=zenith)
  error?: string; // optional error message
  mass?: number;  // relative visual mass/size
}

export interface MoonSample {
  t: number;      // timestamp
  az: number;     // azimuth in degrees
  el: number;     // elevation in degrees
  phase: number;  // moon phase (0=new, 0.5=full, 1=new)
  illumination: number; // fraction illuminated (0-1)
  mass: number;   // relative visual mass/size
  distance: number; // distance from Earth in km
}

export interface CelestialData {
  sun: SunSample;
  moon: MoonSample;
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
        el: position.elevation,
        mass: this.calculateSunMass(t) // Add sun mass calculation
      });
    }
    
    return samples;
  }

  /**
   * Compute sun position for a specific time and location
   * Simple but accurate solar position algorithm
   */
  computeSunPosition(lat: number, lon: number, _alt: number, timestamp: number) {
    const date = new Date(timestamp);
    
    // Calculate day of year
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // Solar declination angle
    const declination = 23.45 * Math.sin((360 * (284 + dayOfYear) / 365) * Math.PI / 180);
    
    // Equation of time (minutes)
    const B = (360 / 365) * (dayOfYear - 81) * Math.PI / 180;
    const equationOfTime = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    
    // Local solar time
    const timeCorrection = equationOfTime + (4 * lon); // Longitude-based time correction
    const solarTime = date.getUTCHours() + date.getUTCMinutes() / 60 + timeCorrection / 60;
    
    // Hour angle
    const hourAngle = 15 * (solarTime - 12);
    
    // Convert to radians
    const latRad = lat * Math.PI / 180;
    const decRad = declination * Math.PI / 180;
    const hourRad = hourAngle * Math.PI / 180;
    
    // Solar elevation
    const elevation = Math.asin(
      Math.sin(decRad) * Math.sin(latRad) + 
      Math.cos(decRad) * Math.cos(latRad) * Math.cos(hourRad)
    );
    
    // Solar azimuth
    const azimuthRad = Math.atan2(
      Math.sin(hourRad),
      Math.cos(hourRad) * Math.sin(latRad) - Math.tan(decRad) * Math.cos(latRad)
    );
    
    let azimuth = (azimuthRad * 180 / Math.PI + 180) % 360;
    
    return {
      elevation: elevation * 180 / Math.PI,
      azimuth: azimuth
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

  /**
   * Compute moon position for a specific time and location
   */
  computeMoonPosition(lat: number, lon: number, timestamp: number): MoonSample {
    const date = new Date(timestamp);
    const julianDay = this.getJulianDay(date);
    const T = (julianDay - 2451545.0) / 36525.0;

    // Moon's mean longitude
    const L = (218.3164591 + 481267.88134236 * T - 0.0013268 * T * T) % 360;
    
    // Moon's mean elongation
    const D = (297.8502042 + 445267.1115168 * T - 0.0016300 * T * T) % 360;
    
    // Sun's mean anomaly
    const M = (357.5291092 + 35999.0502909 * T - 0.0001536 * T * T) % 360;
    
    // Moon's mean anomaly  
    const Mp = (134.9634114 + 477198.8676313 * T + 0.0089970 * T * T) % 360;
    
    // Moon's argument of latitude
    const F = (93.2720993 + 483202.0175273 * T - 0.0034029 * T * T) % 360;
    
    // Simplified lunar longitude calculation
    const longitude = L + 
      6.289 * Math.sin(this.degToRad(Mp)) +
      1.274 * Math.sin(this.degToRad(2 * D - Mp)) +
      0.658 * Math.sin(this.degToRad(2 * D)) -
      0.186 * Math.sin(this.degToRad(M)) -
      0.059 * Math.sin(this.degToRad(2 * Mp - 2 * D)) -
      0.057 * Math.sin(this.degToRad(Mp - 2 * D + M));
    
    // Simplified lunar latitude calculation
    const latitude = 
      5.128 * Math.sin(this.degToRad(F)) +
      0.281 * Math.sin(this.degToRad(Mp + F)) +
      0.278 * Math.sin(this.degToRad(Mp - F)) +
      0.173 * Math.sin(this.degToRad(2 * D - F));

    // Moon's distance calculation
    const distance = 385000 - 20905 * Math.cos(this.degToRad(Mp));

    // Convert to equatorial coordinates (simplified)
    const epsilon = 23.439281 - 0.0130042 * T; // Obliquity of ecliptic
    
    const alpha = Math.atan2(
      Math.sin(this.degToRad(longitude)) * Math.cos(this.degToRad(epsilon)) - 
      Math.tan(this.degToRad(latitude)) * Math.sin(this.degToRad(epsilon)),
      Math.cos(this.degToRad(longitude))
    );
    
    const delta = Math.asin(
      Math.sin(this.degToRad(latitude)) * Math.cos(this.degToRad(epsilon)) +
      Math.cos(this.degToRad(latitude)) * Math.sin(this.degToRad(epsilon)) * Math.sin(this.degToRad(longitude))
    );

    // Convert to horizontal coordinates
    const gmst = this.getGMST(date);
    const H = this.degToRad((gmst + lon) - this.radToDeg(alpha));
    const latRad = this.degToRad(lat);
    
    const elevation = Math.asin(
      Math.sin(latRad) * Math.sin(delta) +
      Math.cos(latRad) * Math.cos(delta) * Math.cos(H)
    );
    
    const azimuth = Math.atan2(
      Math.sin(H),
      Math.cos(H) * Math.sin(latRad) - Math.tan(delta) * Math.cos(latRad)
    );

    // Calculate moon phase
    const phase = this.calculateMoonPhase(julianDay);
    
    // Calculate visual mass based on distance (closer = larger)
    const baseMass = 1.0;
    const mass = baseMass * (405000 / distance); // Scale based on distance
    
    return {
      t: timestamp,
      az: (this.radToDeg(azimuth) + 180) % 360,
      el: this.radToDeg(elevation),
      phase: phase.phase,
      illumination: phase.illumination,
      mass: mass,
      distance: distance
    };
  }

  /**
   * Calculate moon phase and illumination
   */
  private calculateMoonPhase(julianDay: number): { phase: number; illumination: number } {
    const T = (julianDay - 2451545.0) / 36525.0;
    
    // Mean phase angle
    const D = (297.8502042 + 445267.1115168 * T) % 360;
    
    // Phase calculation (0 = new moon, 0.5 = full moon, 1 = new moon)
    const phase = (D / 360) % 1;
    
    // Illumination fraction (0 = new, 1 = full)
    const illumination = (1 + Math.cos(this.degToRad(D))) / 2;
    
    return { phase, illumination };
  }

  /**
   * Get celestial data (sun and moon) for a specific time
   */
  getCelestialData(lat: number, lon: number, timestamp: number): CelestialData {
    const sunPosition = this.computeSunPosition(lat, lon, 0, timestamp);
    const moonPosition = this.computeMoonPosition(lat, lon, timestamp);
    
    return {
      sun: {
        t: timestamp,
        az: sunPosition.azimuth,
        el: sunPosition.elevation,
        mass: this.calculateSunMass(timestamp)
      },
      moon: moonPosition
    };
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

  /**
   * Calculate sun mass based on Earth's distance (closer = larger)
   */
  private calculateSunMass(timestamp: number): number {
    const date = new Date(timestamp);
    const julianDay = this.getJulianDay(date);
    const T = (julianDay - 2451545.0) / 36525.0;
    
    // Earth's distance from sun varies throughout year
    const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    
    // Approximate distance (AU)
    const distance = 1.00014 - 0.01671 * Math.cos(this.degToRad(M)) - 0.00014 * Math.cos(this.degToRad(2 * M));
    
    // Base mass scaled by distance (closer = larger appearance)
    return 1.0 / distance; // Inverse relationship
  }

  /**
   * Find next sunrise from given timestamp
   */
  findNextSunrise(lat: number, lon: number, fromTime: number): { time: number; azimuth: number } {
    const startTime = fromTime;
    const endTime = fromTime + (48 * 60 * 60 * 1000); // Search 48 hours ahead
    
    for (let t = startTime; t < endTime; t += 60000) { // Check every minute
      const pos = this.computeSunPosition(lat, lon, 0, t);
      const prevPos = this.computeSunPosition(lat, lon, 0, t - 60000);
      
      // Sun rises when elevation crosses from negative to positive
      if (prevPos.elevation < -0.833 && pos.elevation >= -0.833) {
        return { time: t, azimuth: pos.azimuth };
      }
    }
    
    return { time: 0, azimuth: 0 }; // Not found
  }

  /**
   * Find next sunset from given timestamp
   */
  findNextSunset(lat: number, lon: number, fromTime: number): { time: number; azimuth: number } {
    const startTime = fromTime;
    const endTime = fromTime + (48 * 60 * 60 * 1000); // Search 48 hours ahead
    
    for (let t = startTime; t < endTime; t += 60000) { // Check every minute
      const pos = this.computeSunPosition(lat, lon, 0, t);
      const prevPos = this.computeSunPosition(lat, lon, 0, t - 60000);
      
      // Sun sets when elevation crosses from positive to negative
      if (prevPos.elevation >= -0.833 && pos.elevation < -0.833) {
        return { time: t, azimuth: pos.azimuth };
      }
    }
    
    return { time: 0, azimuth: 0 }; // Not found
  }

  /**
   * Get celestial data for any timestamp (past or future)
   */
  getCelestialDataForTime(lat: number, lon: number, timestamp: number): CelestialData {
    const sunPosition = this.computeSunPosition(lat, lon, 0, timestamp);
    const moonPosition = this.computeMoonPosition(lat, lon, timestamp);
    
    return {
      sun: {
        t: timestamp,
        az: sunPosition.azimuth,
        el: sunPosition.elevation,
        mass: this.calculateSunMass(timestamp)
      },
      moon: moonPosition
    };
  }
}