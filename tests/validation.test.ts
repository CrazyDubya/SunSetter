/**
 * Unit tests for validation module
 * Tests Zod validation schemas and helper functions
 */

import { describe, it, expect } from 'vitest';
import {
  validateLocation,
  validateTimestamp,
  validateTrackParams,
  validateHeading,
  validateSunSample,
  safeValidateLocation,
  safeValidateTimestamp,
  LocationSchema,
  TimestampSchema
} from '../src/validation';

describe('Validation', () => {
  describe('validateLocation', () => {
    it('should accept valid location data', () => {
      const validLocation = {
        lat: 37.7749,
        lon: -122.4194,
        alt: 100,
        accuracy: 10
      };
      
      const result = validateLocation(validLocation);
      expect(result).toEqual(validLocation);
    });

    it('should accept location without optional fields', () => {
      const minimalLocation = {
        lat: 0,
        lon: 0
      };
      
      const result = validateLocation(minimalLocation);
      expect(result.lat).toBe(0);
      expect(result.lon).toBe(0);
    });

    it('should reject latitude > 90', () => {
      const invalidLocation = {
        lat: 91,
        lon: 0
      };
      
      expect(() => validateLocation(invalidLocation)).toThrow();
    });

    it('should reject latitude < -90', () => {
      const invalidLocation = {
        lat: -91,
        lon: 0
      };
      
      expect(() => validateLocation(invalidLocation)).toThrow();
    });

    it('should reject longitude > 180', () => {
      const invalidLocation = {
        lat: 0,
        lon: 181
      };
      
      expect(() => validateLocation(invalidLocation)).toThrow();
    });

    it('should reject longitude < -180', () => {
      const invalidLocation = {
        lat: 0,
        lon: -181
      };
      
      expect(() => validateLocation(invalidLocation)).toThrow();
    });

    it('should accept boundary values', () => {
      const boundaryLocation = {
        lat: 90,
        lon: 180
      };
      
      const result = validateLocation(boundaryLocation);
      expect(result.lat).toBe(90);
      expect(result.lon).toBe(180);
    });
  });

  describe('validateTimestamp', () => {
    it('should accept valid timestamp', () => {
      const now = Date.now();
      const result = validateTimestamp(now);
      expect(result).toBe(now);
    });

    it('should reject timestamp before 1900', () => {
      const oldTimestamp = new Date('1899-12-31').getTime();
      expect(() => validateTimestamp(oldTimestamp)).toThrow();
    });

    it('should reject timestamp after 2100', () => {
      const futureTimestamp = new Date('2100-01-02').getTime();
      expect(() => validateTimestamp(futureTimestamp)).toThrow();
    });

    it('should accept timestamp at boundaries', () => {
      const year1900 = new Date('1900-01-15').getTime(); // Use middle of month
      const year2099 = new Date('2099-12-15').getTime();
      
      expect(validateTimestamp(year1900)).toBe(year1900);
      expect(validateTimestamp(year2099)).toBe(year2099);
    });
  });

  describe('validateTrackParams', () => {
    it('should accept valid track parameters', () => {
      const validParams = {
        lat: 37.7749,
        lon: -122.4194,
        alt: 100,
        t0: Date.now(),
        durationH: 24,
        stepMin: 30
      };
      
      const result = validateTrackParams(validParams);
      expect(result).toEqual(validParams);
    });

    it('should reject negative duration', () => {
      const invalidParams = {
        lat: 0,
        lon: 0,
        t0: Date.now(),
        durationH: -1,
        stepMin: 30
      };
      
      expect(() => validateTrackParams(invalidParams)).toThrow();
    });

    it('should reject duration > 168 hours', () => {
      const invalidParams = {
        lat: 0,
        lon: 0,
        t0: Date.now(),
        durationH: 169,
        stepMin: 30
      };
      
      expect(() => validateTrackParams(invalidParams)).toThrow();
    });

    it('should reject step < 1 minute', () => {
      const invalidParams = {
        lat: 0,
        lon: 0,
        t0: Date.now(),
        durationH: 24,
        stepMin: 0.5
      };
      
      expect(() => validateTrackParams(invalidParams)).toThrow();
    });

    it('should reject step > 1440 minutes', () => {
      const invalidParams = {
        lat: 0,
        lon: 0,
        t0: Date.now(),
        durationH: 24,
        stepMin: 1441
      };
      
      expect(() => validateTrackParams(invalidParams)).toThrow();
    });
  });

  describe('validateHeading', () => {
    it('should accept valid heading', () => {
      expect(validateHeading(0)).toBe(0);
      expect(validateHeading(180)).toBe(180);
      expect(validateHeading(360)).toBe(360);
    });

    it('should reject negative heading', () => {
      expect(() => validateHeading(-1)).toThrow();
    });

    it('should reject heading > 360', () => {
      expect(() => validateHeading(361)).toThrow();
    });
  });

  describe('validateSunSample', () => {
    it('should accept valid sun sample', () => {
      const validSample = {
        t: Date.now(),
        az: 180,
        el: 45,
        mass: 1.0
      };
      
      const result = validateSunSample(validSample);
      expect(result).toEqual(validSample);
    });

    it('should reject invalid azimuth', () => {
      const invalidSample = {
        t: Date.now(),
        az: 361,
        el: 45
      };
      
      expect(() => validateSunSample(invalidSample)).toThrow();
    });

    it('should reject invalid elevation', () => {
      const invalidSample = {
        t: Date.now(),
        az: 180,
        el: 91
      };
      
      expect(() => validateSunSample(invalidSample)).toThrow();
    });

    it('should accept sample without optional mass', () => {
      const minimalSample = {
        t: Date.now(),
        az: 180,
        el: 45
      };
      
      const result = validateSunSample(minimalSample);
      expect(result.az).toBe(180);
      expect(result.el).toBe(45);
    });
  });

  describe('safeValidateLocation', () => {
    it('should return success for valid location', () => {
      const validLocation = {
        lat: 37.7749,
        lon: -122.4194
      };
      
      const result = safeValidateLocation(validLocation);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validLocation);
      }
    });

    it('should return error for invalid location', () => {
      const invalidLocation = {
        lat: 91,
        lon: 0
      };
      
      const result = safeValidateLocation(invalidLocation);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('safeValidateTimestamp', () => {
    it('should return success for valid timestamp', () => {
      const now = Date.now();
      const result = safeValidateTimestamp(now);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(now);
      }
    });

    it('should return error for invalid timestamp', () => {
      const oldTimestamp = new Date('1800-01-01').getTime();
      const result = safeValidateTimestamp(oldTimestamp);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle null values appropriately', () => {
      expect(() => validateLocation(null)).toThrow();
      expect(() => validateTimestamp(null)).toThrow();
    });

    it('should handle undefined values appropriately', () => {
      expect(() => validateLocation(undefined)).toThrow();
      expect(() => validateTimestamp(undefined)).toThrow();
    });

    it('should handle non-object values', () => {
      expect(() => validateLocation('not an object')).toThrow();
      expect(() => validateLocation(123)).toThrow();
    });

    it('should handle missing required fields', () => {
      expect(() => validateLocation({ lat: 0 })).toThrow(); // missing lon
      expect(() => validateLocation({ lon: 0 })).toThrow(); // missing lat
    });

    it('should handle extra fields gracefully', () => {
      const locationWithExtra = {
        lat: 0,
        lon: 0,
        extraField: 'should be ignored'
      };
      
      const result = LocationSchema.parse(locationWithExtra);
      expect(result.lat).toBe(0);
      expect(result.lon).toBe(0);
      // Zod strips unknown fields by default
    });
  });
});
