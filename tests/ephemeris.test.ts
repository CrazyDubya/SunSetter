/**
 * Unit tests for EphemerisAgent
 * Tests astronomical calculations for sun and moon positions
 */

import { describe, it, expect } from 'vitest';
import { EphemerisAgent } from '../src/ephemeris';

describe('EphemerisAgent', () => {
  const ephemeris = new EphemerisAgent();
  
  describe('computeSunPosition', () => {
    it('should compute correct sun position for known location and time', () => {
      // San Francisco at noon on summer solstice 2024
      // Expected: High elevation (around 69 degrees)
      const timestamp = new Date('2024-06-21T19:00:00Z').getTime(); // 12:00 PST
      const position = ephemeris.computeSunPosition(37.7749, -122.4194, 0, timestamp);
      
      expect(position.elevation).toBeGreaterThan(65);
      expect(position.elevation).toBeLessThan(75);
      expect(position.azimuth).toBeGreaterThan(0);
      expect(position.azimuth).toBeLessThan(360);
    });

    it('should compute correct sun position for winter solstice', () => {
      // San Francisco at noon on winter solstice
      // Expected: Lower elevation (around 30 degrees)
      const timestamp = new Date('2024-12-21T20:00:00Z').getTime(); // 12:00 PST
      const position = ephemeris.computeSunPosition(37.7749, -122.4194, 0, timestamp);
      
      expect(position.elevation).toBeGreaterThan(25);
      expect(position.elevation).toBeLessThan(35);
    });

    it('should return negative elevation when sun is below horizon', () => {
      // San Francisco at midnight
      const timestamp = new Date('2024-06-21T07:00:00Z').getTime(); // Midnight PST
      const position = ephemeris.computeSunPosition(37.7749, -122.4194, 0, timestamp);
      
      expect(position.elevation).toBeLessThan(0);
    });

    it('should handle equator location correctly', () => {
      // Equator at noon on equinox
      const timestamp = new Date('2024-03-20T12:00:00Z').getTime();
      const position = ephemeris.computeSunPosition(0, 0, 0, timestamp);
      
      expect(position.elevation).toBeGreaterThan(85);
      expect(position.elevation).toBeLessThan(95);
    });

    it('should handle arctic location correctly', () => {
      // High latitude location
      const timestamp = new Date('2024-06-21T12:00:00Z').getTime();
      const position = ephemeris.computeSunPosition(70, 20, 0, timestamp);
      
      // At high latitude during summer, sun should be visible
      expect(position.elevation).toBeGreaterThan(0);
    });
  });

  describe('computeTrack', () => {
    it('should generate correct number of samples', () => {
      const timestamp = Date.now();
      const samples = ephemeris.computeTrack({
        lat: 37.7749,
        lon: -122.4194,
        t0: timestamp,
        durationH: 24,
        stepMin: 60 // 1 hour steps
      });
      
      // 24 hours with 1-hour steps = 25 samples (including endpoints)
      expect(samples.length).toBe(25);
    });

    it('should have timestamps in ascending order', () => {
      const timestamp = Date.now();
      const samples = ephemeris.computeTrack({
        lat: 37.7749,
        lon: -122.4194,
        t0: timestamp,
        durationH: 12,
        stepMin: 30
      });
      
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i].t).toBeGreaterThan(samples[i - 1].t);
      }
    });

    it('should include sun mass in samples', () => {
      const timestamp = Date.now();
      const samples = ephemeris.computeTrack({
        lat: 0,
        lon: 0,
        t0: timestamp,
        durationH: 1,
        stepMin: 60
      });
      
      samples.forEach(sample => {
        expect(sample.mass).toBeDefined();
        expect(sample.mass).toBeGreaterThan(0);
      });
    });

    it('should handle different step intervals', () => {
      const timestamp = Date.now();
      const samples5min = ephemeris.computeTrack({
        lat: 0,
        lon: 0,
        t0: timestamp,
        durationH: 1,
        stepMin: 5
      });
      
      const samples15min = ephemeris.computeTrack({
        lat: 0,
        lon: 0,
        t0: timestamp,
        durationH: 1,
        stepMin: 15
      });
      
      expect(samples5min.length).toBeGreaterThan(samples15min.length);
    });
  });

  describe('solveSunriseSunset', () => {
    it('should find sunrise before sunset', () => {
      const date = new Date('2024-06-21');
      const result = ephemeris.solveSunriseSunset(37.7749, -122.4194, date);
      
      expect(result.sunrise).toBeGreaterThan(0);
      expect(result.sunset).toBeGreaterThan(0);
      expect(result.sunset).toBeGreaterThan(result.sunrise);
    });

    it('should return timestamps within the same day', () => {
      const date = new Date('2024-06-21');
      const result = ephemeris.solveSunriseSunset(37.7749, -122.4194, date);
      
      const sunriseDate = new Date(result.sunrise);
      const sunsetDate = new Date(result.sunset);
      
      expect(sunriseDate.getDate()).toBe(date.getDate());
      expect(sunsetDate.getDate()).toBe(date.getDate());
    });
  });

  describe('computeMoonPosition', () => {
    it('should compute moon position with valid coordinates', () => {
      const timestamp = Date.now();
      const moonPos = ephemeris.computeMoonPosition(37.7749, -122.4194, timestamp);
      
      expect(moonPos.az).toBeGreaterThanOrEqual(0);
      expect(moonPos.az).toBeLessThan(360);
      expect(moonPos.el).toBeGreaterThan(-90);
      expect(moonPos.el).toBeLessThan(90);
    });

    it('should include phase and illumination data', () => {
      const timestamp = Date.now();
      const moonPos = ephemeris.computeMoonPosition(0, 0, timestamp);
      
      expect(moonPos.phase).toBeGreaterThanOrEqual(0);
      expect(moonPos.phase).toBeLessThan(1);
      expect(moonPos.illumination).toBeGreaterThanOrEqual(0);
      expect(moonPos.illumination).toBeLessThanOrEqual(1);
    });

    it('should include distance data', () => {
      const timestamp = Date.now();
      const moonPos = ephemeris.computeMoonPosition(0, 0, timestamp);
      
      // Moon distance ranges from about 356,500 km to 406,700 km
      expect(moonPos.distance).toBeGreaterThan(350000);
      expect(moonPos.distance).toBeLessThan(410000);
    });

    it('should include mass scaling', () => {
      const timestamp = Date.now();
      const moonPos = ephemeris.computeMoonPosition(0, 0, timestamp);
      
      expect(moonPos.mass).toBeGreaterThan(0);
    });
  });

  describe('getCelestialData', () => {
    it('should return both sun and moon data', () => {
      const timestamp = Date.now();
      const data = ephemeris.getCelestialData(37.7749, -122.4194, timestamp);
      
      expect(data.sun).toBeDefined();
      expect(data.moon).toBeDefined();
      expect(data.sun.az).toBeDefined();
      expect(data.sun.el).toBeDefined();
      expect(data.moon.az).toBeDefined();
      expect(data.moon.el).toBeDefined();
    });

    it('should have consistent timestamp', () => {
      const timestamp = Date.now();
      const data = ephemeris.getCelestialData(0, 0, timestamp);
      
      expect(data.sun.t).toBe(timestamp);
      expect(data.moon.t).toBe(timestamp);
    });
  });

  describe('findNextSunrise', () => {
    it('should find next sunrise after midnight', () => {
      // Start at midnight
      const timestamp = new Date('2024-06-21T07:00:00Z').getTime();
      const result = ephemeris.findNextSunrise(37.7749, -122.4194, timestamp);
      
      expect(result.time).toBeGreaterThan(0);
      expect(result.azimuth).toBeGreaterThan(0);
      expect(result.azimuth).toBeLessThan(360);
    });

    it('should find sunrise within 48 hours', () => {
      const timestamp = Date.now();
      const result = ephemeris.findNextSunrise(37.7749, -122.4194, timestamp);
      
      const timeDiff = result.time - timestamp;
      expect(timeDiff).toBeLessThan(48 * 60 * 60 * 1000);
    });
  });

  describe('findNextSunset', () => {
    it('should find next sunset after noon', () => {
      // Start at noon
      const timestamp = new Date('2024-06-21T19:00:00Z').getTime();
      const result = ephemeris.findNextSunset(37.7749, -122.4194, timestamp);
      
      expect(result.time).toBeGreaterThan(0);
      expect(result.azimuth).toBeGreaterThan(0);
      expect(result.azimuth).toBeLessThan(360);
    });

    it('should find sunset within 48 hours', () => {
      const timestamp = Date.now();
      const result = ephemeris.findNextSunset(37.7749, -122.4194, timestamp);
      
      const timeDiff = result.time - timestamp;
      expect(timeDiff).toBeLessThan(48 * 60 * 60 * 1000);
    });
  });

  describe('getCelestialDataForTime', () => {
    it('should work with past timestamps', () => {
      const pastTimestamp = new Date('2020-01-01T12:00:00Z').getTime();
      const data = ephemeris.getCelestialDataForTime(37.7749, -122.4194, pastTimestamp);
      
      expect(data.sun).toBeDefined();
      expect(data.moon).toBeDefined();
    });

    it('should work with future timestamps', () => {
      const futureTimestamp = new Date('2030-01-01T12:00:00Z').getTime();
      const data = ephemeris.getCelestialDataForTime(37.7749, -122.4194, futureTimestamp);
      
      expect(data.sun).toBeDefined();
      expect(data.moon).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle international date line', () => {
      // Location near date line
      const position = ephemeris.computeSunPosition(0, 180, 0, Date.now());
      
      expect(position.azimuth).toBeGreaterThanOrEqual(0);
      expect(position.azimuth).toBeLessThan(360);
    });

    it('should handle south pole', () => {
      const position = ephemeris.computeSunPosition(-90, 0, 0, Date.now());
      
      expect(position.elevation).toBeGreaterThan(-90);
      expect(position.elevation).toBeLessThan(90);
    });

    it('should handle north pole', () => {
      const position = ephemeris.computeSunPosition(90, 0, 0, Date.now());
      
      expect(position.elevation).toBeGreaterThan(-90);
      expect(position.elevation).toBeLessThan(90);
    });
  });
});
