/**
 * Unit tests for SensorAgent
 * Tests browser API integrations for geolocation, orientation, and camera
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SensorAgent, SensorError, LocationData, OrientationData } from '../src/sensor';

describe('SensorAgent', () => {
  let sensor: SensorAgent;
  
  beforeEach(() => {
    sensor = new SensorAgent();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SensorError', () => {
    it('should create error with permission type', () => {
      const error = new SensorError('Permission denied', 'permission');
      expect(error.message).toBe('Permission denied');
      expect(error.type).toBe('permission');
      expect(error.name).toBe('SensorError');
    });

    it('should create error with timeout type', () => {
      const error = new SensorError('Request timed out', 'timeout');
      expect(error.type).toBe('timeout');
    });

    it('should create error with unavailable type', () => {
      const error = new SensorError('Not available', 'unavailable');
      expect(error.type).toBe('unavailable');
    });
  });

  describe('getLocation', () => {
    it('should return location data on success', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: 100,
          accuracy: 10,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      };

      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => {
          success(mockPosition);
        })
      };

      vi.stubGlobal('navigator', { geolocation: mockGeolocation });

      const location = await sensor.getLocation();
      
      expect(location.lat).toBe(37.7749);
      expect(location.lon).toBe(-122.4194);
      expect(location.alt).toBe(100);
      expect(location.accuracy).toBe(10);
      expect(location.timestamp).toBe(mockPosition.timestamp);
    });

    it('should handle null altitude', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: null,
          accuracy: 10,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      };

      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => {
          success(mockPosition);
        })
      };

      vi.stubGlobal('navigator', { geolocation: mockGeolocation });

      const location = await sensor.getLocation();
      
      expect(location.alt).toBeUndefined();
    });

    it('should cache location data', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: null,
          accuracy: 10,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      };

      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => {
          success(mockPosition);
        })
      };

      vi.stubGlobal('navigator', { geolocation: mockGeolocation });

      await sensor.getLocation();
      const cached = sensor.getCachedLocation();
      
      expect(cached).toBeDefined();
      expect(cached?.lat).toBe(37.7749);
      expect(cached?.lon).toBe(-122.4194);
    });

    it('should reject if geolocation not supported', async () => {
      vi.stubGlobal('navigator', {});

      await expect(sensor.getLocation()).rejects.toThrow(SensorError);
      await expect(sensor.getLocation()).rejects.toThrow('Geolocation not supported');
    });

    it('should reject with timeout error', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn(() => {
          // Never calls success or error - simulates timeout
        })
      };

      vi.stubGlobal('navigator', { geolocation: mockGeolocation });

      await expect(sensor.getLocation(100)).rejects.toThrow(SensorError);
      await expect(sensor.getLocation(100)).rejects.toThrow('timed out');
    });

    it('should fall back to low accuracy on high accuracy failure', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: null,
          accuracy: 50,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      };

      let callCount = 0;
      const mockGeolocation = {
        getCurrentPosition: vi.fn((success, error) => {
          callCount++;
          if (callCount === 1) {
            // First call (high accuracy) fails
            error({
              code: 2,
              message: 'High accuracy failed',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3
            });
          } else {
            // Second call (low accuracy) succeeds
            success(mockPosition);
          }
        })
      };

      vi.stubGlobal('navigator', { geolocation: mockGeolocation });

      const location = await sensor.getLocation();
      
      expect(location.lat).toBe(37.7749);
      expect(location.accuracy).toBe(50);
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
    });

    it('should reject with permission error', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((success, error) => {
          error({
            code: 1,
            message: 'Permission denied',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3
          });
        })
      };

      vi.stubGlobal('navigator', { geolocation: mockGeolocation });

      await expect(sensor.getLocation()).rejects.toThrow(SensorError);
      
      try {
        await sensor.getLocation();
      } catch (error) {
        expect((error as SensorError).type).toBe('permission');
      }
    });

    it('should reject with timeout error on TIMEOUT code', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((success, error) => {
          error({
            code: 3,
            message: 'Timeout',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3
          });
        })
      };

      vi.stubGlobal('navigator', { geolocation: mockGeolocation });

      try {
        await sensor.getLocation();
      } catch (error) {
        expect((error as SensorError).type).toBe('timeout');
      }
    });

    it('should reject with unavailable error on POSITION_UNAVAILABLE', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((success, error) => {
          error({
            code: 2,
            message: 'Position unavailable',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3
          });
        })
      };

      vi.stubGlobal('navigator', { geolocation: mockGeolocation });

      try {
        await sensor.getLocation();
      } catch (error) {
        expect((error as SensorError).type).toBe('unavailable');
      }
    });

    it('should use custom timeout value', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((success, error, options) => {
          // Should be called with timeout less than provided value
          expect(options.timeout).toBeLessThanOrEqual(10000);
        })
      };

      vi.stubGlobal('navigator', { geolocation: mockGeolocation });

      sensor.getLocation(15000).catch(() => {});
    });
  });

  describe('getOrientation', () => {
    it('should return orientation data on success', async () => {
      const mockEvent = new Event('deviceorientation') as DeviceOrientationEvent;
      Object.defineProperty(mockEvent, 'alpha', { value: 180 });
      Object.defineProperty(mockEvent, 'beta', { value: 45 });
      Object.defineProperty(mockEvent, 'gamma', { value: 30 });
      Object.defineProperty(mockEvent, 'absolute', { value: true });

      const mockDeviceOrientationEvent = class MockDeviceOrientationEvent {};
      const mockWindow = {
        addEventListener: vi.fn((event, handler) => {
          // Simulate event firing
          setTimeout(() => (handler as any)(mockEvent), 10);
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        DeviceOrientationEvent: mockDeviceOrientationEvent
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('DeviceOrientationEvent', mockDeviceOrientationEvent);
      
      const orientation = await sensor.getOrientation();
      
      expect(orientation.alpha).toBe(180);
      expect(orientation.beta).toBe(45);
      expect(orientation.gamma).toBe(30);
      expect(orientation.absolute).toBe(true);
    });

    it('should cache orientation data', async () => {
      const mockEvent = new Event('deviceorientation') as DeviceOrientationEvent;
      Object.defineProperty(mockEvent, 'alpha', { value: 90 });
      Object.defineProperty(mockEvent, 'beta', { value: 0 });
      Object.defineProperty(mockEvent, 'gamma', { value: 0 });
      Object.defineProperty(mockEvent, 'absolute', { value: false });

      const mockDeviceOrientationEvent = class MockDeviceOrientationEvent {};
      const mockWindow = {
        addEventListener: vi.fn((event, handler) => {
          setTimeout(() => (handler as any)(mockEvent), 10);
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        DeviceOrientationEvent: mockDeviceOrientationEvent
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('DeviceOrientationEvent', mockDeviceOrientationEvent);
      
      await sensor.getOrientation();
      const cached = sensor.getCachedOrientation();
      
      expect(cached).toBeDefined();
      expect(cached?.alpha).toBe(90);
    });

    it('should handle null orientation values', async () => {
      const mockEvent = new Event('deviceorientation') as DeviceOrientationEvent;
      Object.defineProperty(mockEvent, 'alpha', { value: null });
      Object.defineProperty(mockEvent, 'beta', { value: null });
      Object.defineProperty(mockEvent, 'gamma', { value: null });
      Object.defineProperty(mockEvent, 'absolute', { value: false });

      const mockDeviceOrientationEvent = class MockDeviceOrientationEvent {};
      const mockWindow = {
        addEventListener: vi.fn((event, handler) => {
          setTimeout(() => (handler as any)(mockEvent), 10);
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        DeviceOrientationEvent: mockDeviceOrientationEvent
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('DeviceOrientationEvent', mockDeviceOrientationEvent);
      
      const orientation = await sensor.getOrientation();
      
      expect(orientation.alpha).toBe(0);
      expect(orientation.beta).toBe(0);
      expect(orientation.gamma).toBe(0);
    });

    it('should reject if DeviceOrientationEvent not supported', async () => {
      const mockWindow = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        DeviceOrientationEvent: undefined
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('DeviceOrientationEvent', undefined);

      await expect(sensor.getOrientation()).rejects.toThrow(SensorError);
      await expect(sensor.getOrientation()).rejects.toThrow('not supported');
    });

    it('should timeout if no orientation data received', async () => {
      const mockDeviceOrientationEvent = class MockDeviceOrientationEvent {};
      const mockWindow = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        DeviceOrientationEvent: mockDeviceOrientationEvent
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('DeviceOrientationEvent', mockDeviceOrientationEvent);

      try {
        await sensor.getOrientation();
        expect.fail('Should have thrown SensorError');
      } catch (error) {
        expect(error).toBeInstanceOf(SensorError);
        expect((error as SensorError).type).toBe('timeout');
      }
    }, 6000);

    it('should request permission on iOS 13+', async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue('granted');
      
      const mockEvent = new Event('deviceorientation') as DeviceOrientationEvent;
      Object.defineProperty(mockEvent, 'alpha', { value: 45 });
      Object.defineProperty(mockEvent, 'beta', { value: 0 });
      Object.defineProperty(mockEvent, 'gamma', { value: 0 });
      Object.defineProperty(mockEvent, 'absolute', { value: true });

      const mockDeviceOrientationEvent = class MockDeviceOrientationEvent {
        static requestPermission = mockRequestPermission;
      };

      const mockWindow = {
        addEventListener: vi.fn((event, handler) => {
          setTimeout(() => (handler as any)(mockEvent), 10);
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        DeviceOrientationEvent: mockDeviceOrientationEvent
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('DeviceOrientationEvent', mockDeviceOrientationEvent);

      await sensor.getOrientation();
      
      expect(mockRequestPermission).toHaveBeenCalled();
    });

    it('should reject if iOS permission denied', async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue('denied');
      
      const mockDeviceOrientationEvent = class MockDeviceOrientationEvent {
        static requestPermission = mockRequestPermission;
      };

      const mockWindow = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        DeviceOrientationEvent: mockDeviceOrientationEvent
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('DeviceOrientationEvent', mockDeviceOrientationEvent);

      await expect(sensor.getOrientation()).rejects.toThrow(SensorError);
      
      try {
        await sensor.getOrientation();
      } catch (error) {
        expect((error as SensorError).type).toBe('permission');
      }
    });

    it('should reject if iOS permission request fails', async () => {
      const mockRequestPermission = vi.fn().mockRejectedValue(new Error('Permission failed'));
      
      const mockDeviceOrientationEvent = class MockDeviceOrientationEvent {
        static requestPermission = mockRequestPermission;
      };

      const mockWindow = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        DeviceOrientationEvent: mockDeviceOrientationEvent
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('DeviceOrientationEvent', mockDeviceOrientationEvent);

      await expect(sensor.getOrientation()).rejects.toThrow(SensorError);
      
      try {
        await sensor.getOrientation();
      } catch (error) {
        expect((error as SensorError).type).toBe('permission');
      }
    });
  });

  describe('getHeading', () => {
    it('should return absolute heading when available', async () => {
      const mockEvent = new Event('deviceorientation') as DeviceOrientationEvent;
      Object.defineProperty(mockEvent, 'alpha', { value: 270 });
      Object.defineProperty(mockEvent, 'beta', { value: 0 });
      Object.defineProperty(mockEvent, 'gamma', { value: 0 });
      Object.defineProperty(mockEvent, 'absolute', { value: true });

      const mockDeviceOrientationEvent = class MockDeviceOrientationEvent {};
      const mockWindow = {
        addEventListener: vi.fn((event, handler) => {
          setTimeout(() => (handler as any)(mockEvent), 10);
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        DeviceOrientationEvent: mockDeviceOrientationEvent
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('DeviceOrientationEvent', mockDeviceOrientationEvent);
      
      const heading = await sensor.getHeading(['true']);
      
      expect(heading).toBe(270);
    });

    it('should fall back to magnetic heading', async () => {
      const mockEvent = new Event('deviceorientation') as DeviceOrientationEvent;
      Object.defineProperty(mockEvent, 'alpha', { value: 180 });
      Object.defineProperty(mockEvent, 'beta', { value: 0 });
      Object.defineProperty(mockEvent, 'gamma', { value: 0 });
      Object.defineProperty(mockEvent, 'absolute', { value: false });

      const mockDeviceOrientationEvent = class MockDeviceOrientationEvent {};
      const mockWindow = {
        addEventListener: vi.fn((event, handler) => {
          setTimeout(() => (handler as any)(mockEvent), 10);
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        DeviceOrientationEvent: mockDeviceOrientationEvent
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('DeviceOrientationEvent', mockDeviceOrientationEvent);
      
      const heading = await sensor.getHeading(['true', 'mag']);
      
      expect(heading).toBe(180);
    });

    it('should return 0 for manual heading', async () => {
      const heading = await sensor.getHeading(['manual']);
      expect(heading).toBe(0);
    });

    it('should try sources in priority order', async () => {
      vi.stubGlobal('DeviceOrientationEvent', undefined);

      const heading = await sensor.getHeading(['true', 'mag', 'manual']);
      
      // Should fall through to manual after true and mag fail
      expect(heading).toBe(0);
    });

    it('should reject if no sources available', async () => {
      vi.stubGlobal('DeviceOrientationEvent', undefined);

      await expect(sensor.getHeading(['true', 'mag'])).rejects.toThrow(SensorError);
      
      try {
        await sensor.getHeading(['true', 'mag']);
      } catch (error) {
        expect((error as SensorError).type).toBe('unavailable');
      }
    });
  });

  describe('startVideoStream', () => {
    it('should start video stream with default constraints', async () => {
      const mockStream = {
        getTracks: vi.fn().mockReturnValue([]),
        getVideoTracks: vi.fn().mockReturnValue([])
      };

      const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      const stream = await sensor.startVideoStream();
      
      expect(stream).toBe(mockStream);
      expect(mockGetUserMedia).toHaveBeenCalled();
    });

    it('should use enhanced constraints', async () => {
      const mockStream = {
        getTracks: vi.fn().mockReturnValue([]),
        getVideoTracks: vi.fn().mockReturnValue([])
      };

      const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      await sensor.startVideoStream();
      
      const callArgs = mockGetUserMedia.mock.calls[0][0];
      expect(callArgs.video).toHaveProperty('width');
      expect(callArgs.video).toHaveProperty('height');
      expect(callArgs.video).toHaveProperty('frameRate');
    });

    it('should fall back to basic constraints if enhanced fail', async () => {
      const mockStream = {
        getTracks: vi.fn().mockReturnValue([]),
        getVideoTracks: vi.fn().mockReturnValue([])
      };

      let callCount = 0;
      const mockGetUserMedia = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new DOMException('Constraints failed', 'OverconstrainedError'));
        }
        return Promise.resolve(mockStream);
      });

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      const stream = await sensor.startVideoStream();
      
      expect(stream).toBe(mockStream);
      expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    });

    it('should reject if camera API not supported', async () => {
      vi.stubGlobal('navigator', {});

      await expect(sensor.startVideoStream()).rejects.toThrow(SensorError);
      await expect(sensor.startVideoStream()).rejects.toThrow('not supported');
    });

    it('should reject with permission error on NotAllowedError', async () => {
      const mockGetUserMedia = vi.fn().mockRejectedValue(
        new DOMException('Permission denied', 'NotAllowedError')
      );

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      try {
        await sensor.startVideoStream();
      } catch (error) {
        expect((error as SensorError).type).toBe('permission');
        expect((error as SensorError).message).toContain('permission denied');
      }
    });

    it('should reject with permission error on PermissionDeniedError', async () => {
      const mockGetUserMedia = vi.fn().mockRejectedValue(
        new DOMException('Permission denied', 'PermissionDeniedError')
      );

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      try {
        await sensor.startVideoStream();
      } catch (error) {
        expect((error as SensorError).type).toBe('permission');
      }
    });

    it('should reject with unavailable error on NotFoundError', async () => {
      const mockGetUserMedia = vi.fn().mockRejectedValue(
        new DOMException('No camera', 'NotFoundError')
      );

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      try {
        await sensor.startVideoStream();
      } catch (error) {
        expect((error as SensorError).type).toBe('unavailable');
        expect((error as SensorError).message).toContain('No camera found');
      }
    });

    it('should handle NotReadableError', async () => {
      const mockGetUserMedia = vi.fn().mockRejectedValue(
        new DOMException('Camera in use', 'NotReadableError')
      );

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      try {
        await sensor.startVideoStream();
      } catch (error) {
        expect((error as SensorError).message).toContain('already in use');
      }
    });

    it('should handle OverconstrainedError', async () => {
      const mockGetUserMedia = vi.fn()
        .mockRejectedValueOnce(new DOMException('Overconstrained', 'OverconstrainedError'))
        .mockRejectedValueOnce(new DOMException('Overconstrained', 'OverconstrainedError'));

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      try {
        await sensor.startVideoStream();
      } catch (error) {
        expect((error as SensorError).message).toContain('does not meet');
      }
    });

    it('should handle SecurityError', async () => {
      const mockGetUserMedia = vi.fn()
        .mockRejectedValueOnce(new DOMException('Security', 'SecurityError'))
        .mockRejectedValueOnce(new DOMException('Security', 'SecurityError'));

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      try {
        await sensor.startVideoStream();
      } catch (error) {
        expect((error as SensorError).type).toBe('permission');
        expect((error as SensorError).message).toContain('HTTPS');
      }
    });

    it('should handle AbortError', async () => {
      const mockGetUserMedia = vi.fn()
        .mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))
        .mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      try {
        await sensor.startVideoStream();
      } catch (error) {
        expect((error as SensorError).message).toContain('cancelled');
      }
    });

    it('should handle custom constraints', async () => {
      const mockStream = {
        getTracks: vi.fn().mockReturnValue([]),
        getVideoTracks: vi.fn().mockReturnValue([])
      };

      const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      await sensor.startVideoStream({
        video: { facingMode: 'user' },
        audio: false
      });
      
      const callArgs = mockGetUserMedia.mock.calls[0][0];
      expect(callArgs.video.facingMode).toBe('user');
    });

    it('should handle non-DOMException errors', async () => {
      const mockGetUserMedia = vi.fn()
        .mockRejectedValueOnce(new Error('Generic error'))
        .mockRejectedValueOnce(new Error('Generic error'));

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      try {
        await sensor.startVideoStream();
      } catch (error) {
        expect((error as SensorError).message).toContain('Could not access camera');
      }
    });
  });

  describe('requestCameraPermission', () => {
    it('should request and grant camera permission', async () => {
      const mockTrack = {
        stop: vi.fn()
      };

      const mockStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack]),
        getVideoTracks: vi.fn().mockReturnValue([])
      };

      const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      const result = await sensor.requestCameraPermission();
      
      expect(result).toBe(true);
      expect(mockTrack.stop).toHaveBeenCalled();
    });

    it('should return false if camera API not supported', async () => {
      vi.stubGlobal('navigator', {});

      const result = await sensor.requestCameraPermission();
      
      expect(result).toBe(false);
    });

    it('should return false if permission denied', async () => {
      const mockGetUserMedia = vi.fn().mockRejectedValue(
        new DOMException('Permission denied', 'NotAllowedError')
      );

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      const result = await sensor.requestCameraPermission();
      
      expect(result).toBe(false);
    });
  });

  describe('requestPermission', () => {
    it('should request geolocation permission', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: null,
          accuracy: 10,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      };

      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => {
          success(mockPosition);
        })
      };

      vi.stubGlobal('navigator', { geolocation: mockGeolocation });

      const result = await sensor.requestPermission('geolocation');
      
      expect(result).toBe(true);
    });

    it('should request orientation permission', async () => {
      const mockEvent = new Event('deviceorientation') as DeviceOrientationEvent;
      Object.defineProperty(mockEvent, 'alpha', { value: 0 });
      Object.defineProperty(mockEvent, 'beta', { value: 0 });
      Object.defineProperty(mockEvent, 'gamma', { value: 0 });
      Object.defineProperty(mockEvent, 'absolute', { value: false });

      const mockDeviceOrientationEvent = class MockDeviceOrientationEvent {};
      const mockWindow = {
        addEventListener: vi.fn((event, handler) => {
          setTimeout(() => (handler as any)(mockEvent), 10);
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        DeviceOrientationEvent: mockDeviceOrientationEvent
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('DeviceOrientationEvent', mockDeviceOrientationEvent);
      
      const result = await sensor.requestPermission('orientation');
      
      expect(result).toBe(true);
    });

    it('should request camera permission', async () => {
      const mockTrack = {
        stop: vi.fn()
      };

      const mockStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack]),
        getVideoTracks: vi.fn().mockReturnValue([])
      };

      const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      const result = await sensor.requestPermission('camera');
      
      expect(result).toBe(true);
    });

    it('should return false on permission denial', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((success, error) => {
          error({
            code: 1,
            message: 'Permission denied',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3
          });
        })
      };

      vi.stubGlobal('navigator', { geolocation: mockGeolocation });

      const result = await sensor.requestPermission('geolocation');
      
      expect(result).toBe(false);
    });

    it('should throw on non-permission errors', async () => {
      vi.stubGlobal('navigator', {});

      await expect(sensor.requestPermission('geolocation')).rejects.toThrow();
    });
  });

  describe('getCachedLocation', () => {
    it('should return null initially', () => {
      const cached = sensor.getCachedLocation();
      expect(cached).toBeNull();
    });

    it('should return cached data after successful location request', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 40.7128,
          longitude: -74.0060,
          altitude: null,
          accuracy: 15,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      };

      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => {
          success(mockPosition);
        })
      };

      vi.stubGlobal('navigator', { geolocation: mockGeolocation });

      await sensor.getLocation();
      const cached = sensor.getCachedLocation();
      
      expect(cached?.lat).toBe(40.7128);
      expect(cached?.lon).toBe(-74.0060);
    });
  });

  describe('getCachedOrientation', () => {
    it('should return null initially', () => {
      const cached = sensor.getCachedOrientation();
      expect(cached).toBeNull();
    });

    it('should return cached data after successful orientation request', async () => {
      const mockEvent = new Event('deviceorientation') as DeviceOrientationEvent;
      Object.defineProperty(mockEvent, 'alpha', { value: 135 });
      Object.defineProperty(mockEvent, 'beta', { value: 10 });
      Object.defineProperty(mockEvent, 'gamma', { value: -5 });
      Object.defineProperty(mockEvent, 'absolute', { value: true });

      const mockDeviceOrientationEvent = class MockDeviceOrientationEvent {};
      const mockWindow = {
        addEventListener: vi.fn((event, handler) => {
          setTimeout(() => (handler as any)(mockEvent), 10);
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        DeviceOrientationEvent: mockDeviceOrientationEvent
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('DeviceOrientationEvent', mockDeviceOrientationEvent);
      
      await sensor.getOrientation();
      const cached = sensor.getCachedOrientation();
      
      expect(cached?.alpha).toBe(135);
      expect(cached?.beta).toBe(10);
      expect(cached?.gamma).toBe(-5);
    });
  });

  describe('switchCamera', () => {
    it('should switch from environment to user camera', async () => {
      const mockTrack = {
        stop: vi.fn(),
        getSettings: vi.fn().mockReturnValue({ facingMode: 'environment' })
      };

      const mockCurrentStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack]),
        getVideoTracks: vi.fn().mockReturnValue([mockTrack])
      };

      const mockNewStream = {
        getTracks: vi.fn().mockReturnValue([]),
        getVideoTracks: vi.fn().mockReturnValue([])
      };

      const mockGetUserMedia = vi.fn().mockResolvedValue(mockNewStream);

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      const newStream = await sensor.switchCamera(mockCurrentStream as any);
      
      expect(mockTrack.stop).toHaveBeenCalled();
      expect(newStream).toBe(mockNewStream);
      
      const callArgs = mockGetUserMedia.mock.calls[0][0];
      expect(callArgs.video.facingMode).toBe('user');
    });

    it('should switch from user to environment camera', async () => {
      const mockTrack = {
        stop: vi.fn(),
        getSettings: vi.fn().mockReturnValue({ facingMode: 'user' })
      };

      const mockCurrentStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack]),
        getVideoTracks: vi.fn().mockReturnValue([mockTrack])
      };

      const mockNewStream = {
        getTracks: vi.fn().mockReturnValue([]),
        getVideoTracks: vi.fn().mockReturnValue([])
      };

      const mockGetUserMedia = vi.fn().mockResolvedValue(mockNewStream);

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      const newStream = await sensor.switchCamera(mockCurrentStream as any);
      
      const callArgs = mockGetUserMedia.mock.calls[0][0];
      expect(callArgs.video.facingMode).toBe('environment');
    });

    it('should try exact constraint if preferred fails', async () => {
      const mockTrack = {
        stop: vi.fn(),
        getSettings: vi.fn().mockReturnValue({ facingMode: 'environment' })
      };

      const mockCurrentStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack]),
        getVideoTracks: vi.fn().mockReturnValue([mockTrack])
      };

      const mockNewStream = {
        getTracks: vi.fn().mockReturnValue([]),
        getVideoTracks: vi.fn().mockReturnValue([])
      };

      let callCount = 0;
      const mockGetUserMedia = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Preferred failed'));
        }
        return Promise.resolve(mockNewStream);
      });

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      await sensor.switchCamera(mockCurrentStream as any);
      
      expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    });

    it('should fall back to original camera if all attempts fail', async () => {
      const mockTrack = {
        stop: vi.fn(),
        getSettings: vi.fn().mockReturnValue({ facingMode: 'environment' })
      };

      const mockCurrentStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack]),
        getVideoTracks: vi.fn().mockReturnValue([mockTrack])
      };

      const mockFallbackStream = {
        getTracks: vi.fn().mockReturnValue([]),
        getVideoTracks: vi.fn().mockReturnValue([])
      };

      let callCount = 0;
      const mockGetUserMedia = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Switch failed'));
        }
        return Promise.resolve(mockFallbackStream);
      });

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      const result = await sensor.switchCamera(mockCurrentStream as any);
      
      expect(result).toBe(mockFallbackStream);
      expect(mockGetUserMedia).toHaveBeenCalledTimes(3);
    });

    it('should handle empty video tracks', async () => {
      const mockCurrentStream = {
        getTracks: vi.fn().mockReturnValue([]),
        getVideoTracks: vi.fn().mockReturnValue([])
      };

      const mockNewStream = {
        getTracks: vi.fn().mockReturnValue([]),
        getVideoTracks: vi.fn().mockReturnValue([])
      };

      const mockGetUserMedia = vi.fn().mockResolvedValue(mockNewStream);

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: mockGetUserMedia
        }
      });

      const newStream = await sensor.switchCamera(mockCurrentStream as any);
      
      expect(newStream).toBe(mockNewStream);
    });
  });

  describe('getAvailableCameras', () => {
    it('should return list of video input devices', async () => {
      const mockDevices: MediaDeviceInfo[] = [
        {
          deviceId: 'camera1',
          kind: 'videoinput',
          label: 'Front Camera',
          groupId: 'group1',
          toJSON: () => ({})
        },
        {
          deviceId: 'camera2',
          kind: 'videoinput',
          label: 'Back Camera',
          groupId: 'group2',
          toJSON: () => ({})
        },
        {
          deviceId: 'mic1',
          kind: 'audioinput',
          label: 'Microphone',
          groupId: 'group3',
          toJSON: () => ({})
        }
      ];

      const mockEnumerateDevices = vi.fn().mockResolvedValue(mockDevices);

      vi.stubGlobal('navigator', {
        mediaDevices: {
          enumerateDevices: mockEnumerateDevices
        }
      });

      const cameras = await sensor.getAvailableCameras();
      
      expect(cameras).toHaveLength(2);
      expect(cameras[0].kind).toBe('videoinput');
      expect(cameras[1].kind).toBe('videoinput');
    });

    it('should return empty array if enumeration fails', async () => {
      const mockEnumerateDevices = vi.fn().mockRejectedValue(new Error('Enumeration failed'));

      vi.stubGlobal('navigator', {
        mediaDevices: {
          enumerateDevices: mockEnumerateDevices
        }
      });

      const cameras = await sensor.getAvailableCameras();
      
      expect(cameras).toEqual([]);
    });

    it('should filter out non-video devices', async () => {
      const mockDevices: MediaDeviceInfo[] = [
        {
          deviceId: 'mic1',
          kind: 'audioinput',
          label: 'Microphone',
          groupId: 'group1',
          toJSON: () => ({})
        },
        {
          deviceId: 'speaker1',
          kind: 'audiooutput',
          label: 'Speaker',
          groupId: 'group2',
          toJSON: () => ({})
        }
      ];

      const mockEnumerateDevices = vi.fn().mockResolvedValue(mockDevices);

      vi.stubGlobal('navigator', {
        mediaDevices: {
          enumerateDevices: mockEnumerateDevices
        }
      });

      const cameras = await sensor.getAvailableCameras();
      
      expect(cameras).toEqual([]);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle sequential location requests', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: null,
          accuracy: 10,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      };

      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => {
          success(mockPosition);
        })
      };

      vi.stubGlobal('navigator', { geolocation: mockGeolocation });

      const location1 = await sensor.getLocation();
      const location2 = await sensor.getLocation();
      
      expect(location1.lat).toBe(location2.lat);
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed sensor requests', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: null,
          accuracy: 10,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      };

      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => {
          success(mockPosition);
        })
      };

      const mockEvent = new Event('deviceorientation') as DeviceOrientationEvent;
      Object.defineProperty(mockEvent, 'alpha', { value: 180 });
      Object.defineProperty(mockEvent, 'beta', { value: 0 });
      Object.defineProperty(mockEvent, 'gamma', { value: 0 });
      Object.defineProperty(mockEvent, 'absolute', { value: true });

      const mockDeviceOrientationEvent = class MockDeviceOrientationEvent {};
      const mockWindow = {
        addEventListener: vi.fn((event, handler) => {
          setTimeout(() => (handler as any)(mockEvent), 10);
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        DeviceOrientationEvent: mockDeviceOrientationEvent
      };

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('navigator', { geolocation: mockGeolocation });
      vi.stubGlobal('DeviceOrientationEvent', mockDeviceOrientationEvent);

      const [location, orientation] = await Promise.all([
        sensor.getLocation(),
        sensor.getOrientation()
      ]);
      
      expect(location.lat).toBe(37.7749);
      expect(orientation.alpha).toBe(180);
    });
  });
});
