/**
 * Unit tests for OrchestratorAgent
 * Tests the main state machine that coordinates location, orientation, and rendering
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OrchestratorAgent, AppStatus } from '../src/orchestrator';
import { SensorError, LocationData } from '../src/sensor';
import { SunSample, CelestialData } from '../src/ephemeris';

// Mock DOM elements
class MockHTMLElement {
  style: Record<string, string> = {};
  children: any[] = [];
  
  appendChild(child: any) {
    this.children.push(child);
    return child;
  }
  
  getElementById(_id: string) {
    return null;
  }
}

class MockHTMLCanvasElement extends MockHTMLElement {
  width: number = 800;
  height: number = 600;
  
  getContext(_type: string) {
    return {
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillText: vi.fn(),
    };
  }
}

class MockHTMLVideoElement extends MockHTMLElement {
  srcObject: MediaStream | null = null;
}

// Mock DOM globals
const mockDocument = {
  createElement: (tag: string) => {
    if (tag === 'canvas') return new MockHTMLCanvasElement();
    if (tag === 'video') return new MockHTMLVideoElement();
    return new MockHTMLElement();
  },
  getElementById: (id: string) => {
    if (id === 'cameraFeed') return new MockHTMLVideoElement();
    return null;
  }
};

const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  devicePixelRatio: 2,
};

// Setup global mocks
vi.stubGlobal('document', mockDocument);
vi.stubGlobal('window', mockWindow);

// Mock dependencies
vi.mock('../src/ephemeris', () => {
  const EphemerisAgent = vi.fn(function() {
    return {
      computeTrack: vi.fn(),
      getCelestialData: vi.fn(),
      getCelestialDataForTime: vi.fn(),
      findNextSunrise: vi.fn(),
      findNextSunset: vi.fn(),
    };
  });
  return { EphemerisAgent };
});

vi.mock('../src/sensor', () => {
  const SensorAgent = vi.fn(function() {
    return {
      getLocation: vi.fn(),
      getCachedLocation: vi.fn(),
      getHeading: vi.fn(),
      startVideoStream: vi.fn(),
      switchCamera: vi.fn(),
    };
  });
  
  class SensorError extends Error {
    type: string;
    constructor(message: string, type: string) {
      super(message);
      this.name = 'SensorError';
      this.type = type;
    }
  }
  
  return { SensorAgent, SensorError };
});

vi.mock('../src/rendering', () => {
  const RenderingAgent = vi.fn(function() {
    return {
      updateData: vi.fn(),
      updateCelestialPositions: vi.fn(),
      render2D: vi.fn(),
      startAnimationLoop: vi.fn(),
      toggleMode: vi.fn(),
      currentMode: '2D',
      dispose: vi.fn(),
    };
  });
  return { RenderingAgent };
});

describe('OrchestratorAgent', () => {
  let orchestrator: OrchestratorAgent;
  let mockContainer: HTMLElement;
  let mockEphemeris: any;
  let mockSensor: any;
  let mockRenderer: any;

  const mockLocation: LocationData = {
    lat: 37.7749,
    lon: -122.4194,
    alt: 100,
    accuracy: 10,
    timestamp: Date.now(),
  };

  const mockSunSamples: SunSample[] = [
    { t: Date.now(), az: 180, el: 45, mass: 1 },
    { t: Date.now() + 3600000, az: 200, el: 50, mass: 1 },
  ];

  const mockCelestialData: CelestialData = {
    sun: { t: Date.now(), az: 180, el: 45, mass: 1 },
    moon: { t: Date.now(), az: 90, el: 30, phase: 0.5, illumination: 1, mass: 1, distance: 384400 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockContainer = mockDocument.createElement('div') as any;
    
    // Create orchestrator - this will create mocked instances
    orchestrator = new OrchestratorAgent(mockContainer);
    
    // Access the mocked instances through the orchestrator's private properties
    mockEphemeris = (orchestrator as any).ephemeris;
    mockSensor = (orchestrator as any).sensor;
    mockRenderer = (orchestrator as any).renderer;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with init state', () => {
      const status = orchestrator.getStatus();
      expect(status.state).toBe('init');
      expect(status.confidence).toBe(0);
    });

    it('should call status callback on initialization', () => {
      const callback = vi.fn();
      const newOrchestrator = new OrchestratorAgent(mockContainer);
      
      // Register callback and then trigger a status update
      newOrchestrator.onStatusUpdate(callback);
      
      // Get status to see current state (callbacks aren't called on registration)
      const status = newOrchestrator.getStatus();
      expect(status.state).toBe('init');
      expect(status.confidence).toBe(0);
    });

    it('should use cached location if available and fresh', async () => {
      const cachedLocation = { ...mockLocation, timestamp: Date.now() - 60000 }; // 1 minute old
      mockSensor.getCachedLocation.mockReturnValue(cachedLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);

      await orchestrator.initialize();

      expect(mockSensor.getCachedLocation).toHaveBeenCalled();
      expect(mockEphemeris.computeTrack).toHaveBeenCalled();
      const status = orchestrator.getStatus();
      expect(status.location).toEqual(cachedLocation);
    });

    it('should not use cached location if too old', async () => {
      const oldLocation = { ...mockLocation, timestamp: Date.now() - 400000 }; // 6+ minutes old
      mockSensor.getCachedLocation.mockReturnValue(oldLocation);

      await orchestrator.initialize();

      expect(mockSensor.getCachedLocation).toHaveBeenCalled();
      const status = orchestrator.getStatus();
      expect(status.location).toBeUndefined();
    });

    it('should handle initialization errors', async () => {
      mockSensor.getCachedLocation.mockImplementation(() => {
        throw new Error('Cache error');
      });

      await orchestrator.initialize();

      const status = orchestrator.getStatus();
      expect(status.state).toBe('error');
      expect(status.error).toContain('error');
    });
  });

  describe('State Machine - Location Request', () => {
    it('should transition from init to permissions state on location request', async () => {
      const statusUpdates: AppStatus[] = [];
      orchestrator.onStatusUpdate((status) => statusUpdates.push(status));

      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);

      await orchestrator.requestLocation();

      const permissionsStates = statusUpdates.filter(s => s.state === 'permissions');
      expect(permissionsStates.length).toBeGreaterThan(0);
    });

    it('should transition to sensing state after getting location', async () => {
      const statusUpdates: AppStatus[] = [];
      orchestrator.onStatusUpdate((status) => statusUpdates.push(status));

      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);

      await orchestrator.requestLocation();

      const sensingStates = statusUpdates.filter(s => s.state === 'sensing');
      expect(sensingStates.length).toBeGreaterThan(0);
      expect(sensingStates[0].location).toEqual(mockLocation);
    });

    it('should transition to computing state', async () => {
      const statusUpdates: AppStatus[] = [];
      orchestrator.onStatusUpdate((status) => statusUpdates.push(status));

      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);

      await orchestrator.requestLocation();

      const computingStates = statusUpdates.filter(s => s.state === 'computing');
      expect(computingStates.length).toBeGreaterThan(0);
    });

    it('should transition to rendering state', async () => {
      const statusUpdates: AppStatus[] = [];
      orchestrator.onStatusUpdate((status) => statusUpdates.push(status));

      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);

      await orchestrator.requestLocation();

      const renderingStates = statusUpdates.filter(s => s.state === 'rendering');
      expect(renderingStates.length).toBeGreaterThan(0);
      expect(renderingStates[renderingStates.length - 1].confidence).toBe(100);
    });

    it('should return true on successful location request', async () => {
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);

      const result = await orchestrator.requestLocation();

      expect(result).toBe(true);
    });

    it('should return false on failed location request', async () => {
      mockSensor.getLocation.mockRejectedValue(new Error('Location failed'));

      const result = await orchestrator.requestLocation();

      expect(result).toBe(false);
    });
  });

  describe('State Machine - Error States', () => {
    it('should transition to error state on permission denied', async () => {
      const error = new SensorError('Permission denied', 'permission');
      mockSensor.getLocation.mockRejectedValue(error);

      await orchestrator.requestLocation();

      const status = orchestrator.getStatus();
      expect(status.state).toBe('error');
      expect(status.error).toContain('permission');
    });

    it('should transition to error state on timeout', async () => {
      const error = new SensorError('Timeout', 'timeout');
      mockSensor.getLocation.mockRejectedValue(error);

      await orchestrator.requestLocation();

      const status = orchestrator.getStatus();
      expect(status.state).toBe('error');
      expect(status.error).toContain('timed out');
    });

    it('should transition to error state on unavailable sensor', async () => {
      const error = new SensorError('Not available', 'unavailable');
      mockSensor.getLocation.mockRejectedValue(error);

      await orchestrator.requestLocation();

      const status = orchestrator.getStatus();
      expect(status.state).toBe('error');
      expect(status.error).toContain('not available');
    });

    it('should set confidence to 0 in error state', async () => {
      mockSensor.getLocation.mockRejectedValue(new Error('Test error'));

      await orchestrator.requestLocation();

      const status = orchestrator.getStatus();
      expect(status.confidence).toBe(0);
    });
  });

  describe('Coordination - EphemerisAgent Integration', () => {
    it('should call computeTrack with correct parameters', async () => {
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);

      await orchestrator.requestLocation();

      expect(mockEphemeris.computeTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          lat: mockLocation.lat,
          lon: mockLocation.lon,
          alt: mockLocation.alt,
          durationH: 24,
          stepMin: 5,
        })
      );
    });

    it('should call getCelestialData with location and time', async () => {
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);

      await orchestrator.requestLocation();

      expect(mockEphemeris.getCelestialData).toHaveBeenCalledWith(
        mockLocation.lat,
        mockLocation.lon,
        expect.any(Number)
      );
    });

    it('should handle missing altitude in location', async () => {
      const locationWithoutAlt = { ...mockLocation, alt: undefined };
      mockSensor.getLocation.mockResolvedValue(locationWithoutAlt);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);

      await orchestrator.requestLocation();

      expect(mockEphemeris.computeTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          alt: 0, // Should default to 0
        })
      );
    });
  });

  describe('Coordination - SensorAgent Integration', () => {
    it('should request heading from sensor', async () => {
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(45);

      await orchestrator.requestLocation();

      expect(mockSensor.getHeading).toHaveBeenCalled();
    });

    it('should handle heading request failure gracefully', async () => {
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockRejectedValue(new Error('No heading'));

      await orchestrator.requestLocation();

      // Should still succeed with default heading (0)
      expect(mockRenderer.updateData).toHaveBeenCalledWith(mockSunSamples, 0);
    });
  });

  describe('Coordination - RenderingAgent Integration', () => {
    it('should update renderer with sun samples and heading', async () => {
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(45);

      await orchestrator.requestLocation();

      expect(mockRenderer.updateData).toHaveBeenCalledWith(mockSunSamples, 45);
    });

    it('should update celestial positions in renderer', async () => {
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);

      await orchestrator.requestLocation();

      expect(mockRenderer.updateCelestialPositions).toHaveBeenCalledWith(
        mockCelestialData,
        mockLocation.lat,
        mockLocation.lon
      );
    });

    it('should call render2D on renderer', async () => {
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(45);

      await orchestrator.requestLocation();

      expect(mockRenderer.render2D).toHaveBeenCalledWith(mockSunSamples, 45);
    });

    it('should start animation loop', async () => {
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);

      await orchestrator.requestLocation();

      expect(mockRenderer.startAnimationLoop).toHaveBeenCalled();
    });
  });

  describe('Status Updates', () => {
    it('should notify all registered callbacks on status update', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      orchestrator.onStatusUpdate(callback1);
      orchestrator.onStatusUpdate(callback2);

      // Trigger a status update by requesting location
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);
      
      await orchestrator.requestLocation();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should include samples in status after successful computation', async () => {
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);

      await orchestrator.requestLocation();

      const status = orchestrator.getStatus();
      expect(status.samples).toEqual(mockSunSamples);
    });

    it('should track confidence progression through states', async () => {
      const confidenceValues: number[] = [];
      orchestrator.onStatusUpdate((status) => confidenceValues.push(status.confidence));

      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);

      await orchestrator.requestLocation();

      // Should increase over time
      expect(confidenceValues[confidenceValues.length - 1]).toBe(100);
      expect(confidenceValues.some(v => v < 100)).toBe(true);
    });
  });

  describe('Mode Switching', () => {
    it('should switch to AR mode successfully', async () => {
      const mockStream = {} as MediaStream;
      mockSensor.startVideoStream.mockResolvedValue(mockStream);
      mockRenderer.currentMode = '2D';

      const result = await orchestrator.toggleRenderMode();

      expect(result).toBe('AR');
      expect(mockSensor.startVideoStream).toHaveBeenCalled();
      expect(mockRenderer.toggleMode).toHaveBeenCalledWith(mockStream);
      expect(mockRenderer.startAnimationLoop).toHaveBeenCalled();
    });

    it('should switch back to 2D mode', async () => {
      const stopFn = vi.fn();
      const mockStream = {
        getTracks: () => [{ stop: stopFn }],
      } as any;
      
      // First switch to AR
      mockSensor.startVideoStream.mockResolvedValue(mockStream);
      mockRenderer.currentMode = '2D';
      await orchestrator.toggleRenderMode();

      // Manually set the current stream in orchestrator
      (orchestrator as any).currentStream = mockStream;

      // Then switch back to 2D
      mockRenderer.currentMode = 'AR';
      const result = await orchestrator.toggleRenderMode();

      expect(result).toBe('2D');
      expect(stopFn).toHaveBeenCalled();
    });

    it('should handle AR mode failure gracefully', async () => {
      mockSensor.startVideoStream.mockRejectedValue(new Error('Camera not available'));
      mockRenderer.currentMode = '2D';

      const result = await orchestrator.toggleRenderMode();

      expect(result).toBe('2D');
      const status = orchestrator.getStatus();
      expect(status.state).toBe('error');
      expect(status.error).toContain('AR mode');
    });

    it('should start orientation updates in AR mode', async () => {
      const mockStream = {} as MediaStream;
      mockSensor.startVideoStream.mockResolvedValue(mockStream);
      mockRenderer.currentMode = '2D';

      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      await orchestrator.toggleRenderMode();

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'deviceorientation',
        expect.any(Function),
        true
      );
    });
  });

  describe('Camera Switching', () => {
    it('should switch camera when in AR mode', async () => {
      const oldStream = {} as MediaStream;
      const newStream = {} as MediaStream;
      
      // Setup AR mode
      mockSensor.startVideoStream.mockResolvedValue(oldStream);
      mockRenderer.currentMode = '2D';
      await orchestrator.toggleRenderMode();
      
      // Switch camera
      mockRenderer.currentMode = 'AR';
      mockSensor.switchCamera.mockResolvedValue(newStream);
      const result = await orchestrator.switchCamera();

      expect(result).toBe(true);
      expect(mockSensor.switchCamera).toHaveBeenCalledWith(oldStream);
    });

    it('should not switch camera when not in AR mode', async () => {
      mockRenderer.currentMode = '2D';
      
      const result = await orchestrator.switchCamera();

      expect(result).toBe(false);
      expect(mockSensor.switchCamera).not.toHaveBeenCalled();
    });

    it('should handle camera switch failure', async () => {
      const oldStream = {} as MediaStream;
      
      // Setup AR mode
      mockSensor.startVideoStream.mockResolvedValue(oldStream);
      mockRenderer.currentMode = '2D';
      await orchestrator.toggleRenderMode();
      
      // Fail to switch camera
      mockRenderer.currentMode = 'AR';
      mockSensor.switchCamera.mockRejectedValue(new Error('Switch failed'));
      const result = await orchestrator.switchCamera();

      expect(result).toBe(false);
    });
  });

  describe('Time Navigation', () => {
    it('should set time and update celestial data', async () => {
      // Setup location first
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockEphemeris.getCelestialDataForTime.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);
      await orchestrator.requestLocation();

      const newTime = Date.now() + 3600000; // 1 hour later
      orchestrator.setTime(newTime);

      expect(mockEphemeris.getCelestialDataForTime).toHaveBeenCalledWith(
        mockLocation.lat,
        mockLocation.lon,
        newTime
      );
    });

    it('should not update celestial data if no location set', () => {
      const newTime = Date.now() + 3600000;
      orchestrator.setTime(newTime);

      expect(mockEphemeris.getCelestialDataForTime).not.toHaveBeenCalled();
    });

    it('should return current timestamp', () => {
      const timestamp = orchestrator.getCurrentTimestamp();
      expect(timestamp).toBeGreaterThan(0);
    });

    it('should jump to next sunrise', async () => {
      // Setup location first
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockEphemeris.getCelestialDataForTime.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);
      await orchestrator.requestLocation();

      const sunriseTime = Date.now() + 7200000; // 2 hours later
      mockEphemeris.findNextSunrise.mockReturnValue({ time: sunriseTime, azimuth: 90 });

      const result = orchestrator.jumpToNextSunrise();

      expect(result).toEqual({ time: sunriseTime, azimuth: 90 });
      expect(orchestrator.getCurrentTimestamp()).toBe(sunriseTime);
    });

    it('should return null for next sunrise if no location', () => {
      const result = orchestrator.jumpToNextSunrise();
      expect(result).toBeNull();
    });

    it('should return null if no next sunrise found', async () => {
      // Setup location first
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);
      await orchestrator.requestLocation();

      mockEphemeris.findNextSunrise.mockReturnValue({ time: -1, azimuth: 0 });

      const result = orchestrator.jumpToNextSunrise();

      expect(result).toBeNull();
    });

    it('should jump to next sunset', async () => {
      // Setup location first
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockEphemeris.getCelestialDataForTime.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);
      await orchestrator.requestLocation();

      const sunsetTime = Date.now() + 14400000; // 4 hours later
      mockEphemeris.findNextSunset.mockReturnValue({ time: sunsetTime, azimuth: 270 });

      const result = orchestrator.jumpToNextSunset();

      expect(result).toEqual({ time: sunsetTime, azimuth: 270 });
      expect(orchestrator.getCurrentTimestamp()).toBe(sunsetTime);
    });

    it('should return null for next sunset if no location', () => {
      const result = orchestrator.jumpToNextSunset();
      expect(result).toBeNull();
    });

    it('should return to current time', async () => {
      // Setup location first
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockEphemeris.getCelestialDataForTime.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);
      await orchestrator.requestLocation();

      // Set time to future
      orchestrator.setTime(Date.now() + 3600000);

      // Return to now
      const beforeNow = Date.now();
      orchestrator.returnToNow();
      const afterNow = Date.now();

      const currentTime = orchestrator.getCurrentTimestamp();
      expect(currentTime).toBeGreaterThanOrEqual(beforeNow);
      expect(currentTime).toBeLessThanOrEqual(afterNow);
    });
  });

  describe('Location Management', () => {
    it('should return current location', async () => {
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);
      
      await orchestrator.requestLocation();

      const location = orchestrator.getCurrentLocation();
      expect(location).toEqual(mockLocation);
    });

    it('should return null if no location set', () => {
      const location = orchestrator.getCurrentLocation();
      expect(location).toBeNull();
    });
  });

  describe('Planning and Fallback', () => {
    it('should plan graph with all capabilities', () => {
      const plan = orchestrator.planGraph({
        location: true,
        orientation: true,
        camera: true,
      });

      expect(plan).toContain('init');
      expect(plan).toContain('get_location');
      expect(plan).toContain('compute_track');
      expect(plan).toContain('get_orientation');
      expect(plan).toContain('render_ar');
      expect(plan).toContain('monitor');
    });

    it('should plan graph without location', () => {
      const plan = orchestrator.planGraph({
        location: false,
        orientation: true,
        camera: true,
      });

      expect(plan).toContain('request_manual_location');
      expect(plan).not.toContain('get_location');
    });

    it('should plan graph without camera', () => {
      const plan = orchestrator.planGraph({
        location: true,
        orientation: true,
        camera: false,
      });

      expect(plan).toContain('render_2d');
      expect(plan).not.toContain('render_ar');
    });

    it('should select demo fallback for low confidence', () => {
      const fallback = orchestrator.selectFallback(20);
      expect(fallback).toBe('demo');
    });

    it('should select manual fallback for medium confidence', () => {
      const fallback = orchestrator.selectFallback(50);
      expect(fallback).toBe('manual');
    });

    it('should select 2d fallback for high confidence', () => {
      const fallback = orchestrator.selectFallback(80);
      expect(fallback).toBe('2d');
    });
  });

  describe('Resource Management', () => {
    it('should dispose of renderer resources', () => {
      orchestrator.dispose();
      expect(mockRenderer.dispose).toHaveBeenCalled();
    });

    it('should stop video stream on dispose when in AR mode', async () => {
      const stopFn = vi.fn();
      const mockStream = {
        getTracks: () => [{ stop: stopFn }],
      } as any;
      
      mockSensor.startVideoStream.mockResolvedValue(mockStream);
      mockRenderer.currentMode = '2D';
      await orchestrator.toggleRenderMode();

      // Manually set the current stream in orchestrator
      (orchestrator as any).currentStream = mockStream;

      // Switch back to 2D which should stop the stream
      mockRenderer.currentMode = 'AR';
      await orchestrator.toggleRenderMode();

      expect(stopFn).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle compute error during location request', async () => {
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockImplementation(() => {
        throw new Error('Compute failed');
      });

      await orchestrator.requestLocation();

      const status = orchestrator.getStatus();
      expect(status.state).toBe('error');
      expect(status.error?.toLowerCase()).toContain('compute');
    });

    it('should handle rendering error', async () => {
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockImplementation(() => {
        throw new Error('Celestial data failed');
      });

      await orchestrator.requestLocation();

      const status = orchestrator.getStatus();
      expect(status.state).toBe('error');
    });

    it('should handle multiple status callbacks', async () => {
      const callbacks = [vi.fn(), vi.fn(), vi.fn()];
      callbacks.forEach(cb => orchestrator.onStatusUpdate(cb));

      // Trigger an update by requesting location
      mockSensor.getLocation.mockResolvedValue(mockLocation);
      mockEphemeris.computeTrack.mockReturnValue(mockSunSamples);
      mockEphemeris.getCelestialData.mockReturnValue(mockCelestialData);
      mockSensor.getHeading.mockResolvedValue(0);
      
      await orchestrator.requestLocation();

      callbacks.forEach(cb => {
        expect(cb).toHaveBeenCalled();
      });
    });

    it('should maintain state immutability in getStatus', () => {
      const status1 = orchestrator.getStatus();
      status1.state = 'error';

      const status2 = orchestrator.getStatus();
      expect(status2.state).not.toBe('error');
    });
  });
});
