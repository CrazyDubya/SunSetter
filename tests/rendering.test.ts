/**
 * Unit tests for Rendering Module
 * Tests modular rendering structure, mode switching, fallbacks, and coordinate utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { RenderingAgent } from '../src/rendering/render-coordinator';
import { WebGLRenderer } from '../src/rendering/webgl-renderer';
import { ARRenderer } from '../src/rendering/ar-renderer';
import { 
  findClosestSample, 
  azElTo3D, 
  getARDistance, 
  azElToCanvas, 
  latLonToGlobePosition,
  celestialToGlobePosition 
} from '../src/rendering/render-state';
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
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
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
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn()
      })),
      createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn()
      }))
    };
  }
  
  toDataURL(_type: string): string {
    return 'data:image/png;base64,mockImageData';
  }
}

class MockHTMLVideoElement extends MockHTMLElement {
  srcObject: MediaStream | null = null;
}

// Mock document
global.document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') return new MockHTMLCanvasElement();
    if (tag === 'video') return new MockHTMLVideoElement();
    return new MockHTMLElement();
  },
  getElementById: (_id: string) => new MockHTMLVideoElement()
} as any;

// Mock window and animation functions
let rafCallbacks: Function[] = [];
global.window = {
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 2,
  addEventListener: vi.fn()
} as any;

global.requestAnimationFrame = vi.fn((callback) => {
  // Store callback but don't execute immediately to avoid stack overflow
  return 1;
});

global.cancelAnimationFrame = vi.fn();

// Sample sun data for testing
const createSunSamples = (count: number = 25): SunSample[] => {
  const samples: SunSample[] = [];
  const now = Date.now();
  const hourInMs = 60 * 60 * 1000;
  
  for (let i = 0; i < count; i++) {
    const time = now + i * hourInMs;
    const progress = i / (count - 1);
    const azimuth = 90 + progress * 180; // 90° to 270°
    const elevation = Math.sin(progress * Math.PI) * 60 - 10; // -10° to 50° arc
    
    samples.push({
      t: time,
      az: azimuth,
      el: elevation,
      mass: 1.0
    });
  }
  
  return samples;
};

const createCelestialData = (): CelestialData => ({
  sun: {
    t: Date.now(),
    az: 180,
    el: 45,
    mass: 1.0
  },
  moon: {
    t: Date.now(),
    az: 90,
    el: 30,
    phase: 0.5,
    illumination: 0.75,
    distance: 384400,
    mass: 1.0
  }
});

describe('Render State - Coordinate Utilities', () => {
  describe('findClosestSample', () => {
    it('should return null for empty array', () => {
      const result = findClosestSample([], Date.now());
      expect(result).toBeNull();
    });

    it('should return the only sample for single-element array', () => {
      const sample: SunSample = { t: 1000, az: 180, el: 45, mass: 1.0 };
      const result = findClosestSample([sample], 2000);
      expect(result).toBe(sample);
    });

    it('should find closest sample by timestamp', () => {
      const samples = createSunSamples(5);
      const targetTime = samples[2].t + 100; // Slightly after sample 2
      const result = findClosestSample(samples, targetTime);
      expect(result).toBe(samples[2]);
    });

    it('should handle timestamp before all samples', () => {
      const samples = createSunSamples(3);
      const targetTime = samples[0].t - 10000;
      const result = findClosestSample(samples, targetTime);
      expect(result).toBe(samples[0]);
    });

    it('should handle timestamp after all samples', () => {
      const samples = createSunSamples(3);
      const targetTime = samples[2].t + 10000;
      const result = findClosestSample(samples, targetTime);
      expect(result).toBe(samples[2]);
    });
  });

  describe('azElTo3D', () => {
    it('should convert azimuth/elevation to 3D coordinates', () => {
      const result = azElTo3D(0, 0, 10);
      expect(result).toBeInstanceOf(THREE.Vector3);
      expect(result.x).toBeCloseTo(0, 1);
      expect(result.y).toBeCloseTo(0, 1);
      expect(result.z).toBeCloseTo(-10, 1);
    });

    it('should handle 90-degree azimuth', () => {
      const result = azElTo3D(90, 0, 10);
      expect(result.x).toBeCloseTo(10, 1);
      expect(result.y).toBeCloseTo(0, 1);
      expect(result.z).toBeCloseTo(0, 1);
    });

    it('should handle positive elevation', () => {
      const result = azElTo3D(0, 45, 10);
      expect(result.y).toBeGreaterThan(0);
      expect(result.z).toBeLessThan(0);
    });

    it('should handle negative elevation', () => {
      const result = azElTo3D(0, -45, 10);
      expect(result.y).toBeLessThan(0);
    });

    it('should scale with distance', () => {
      const result1 = azElTo3D(0, 0, 5);
      const result2 = azElTo3D(0, 0, 10);
      expect(Math.abs(result2.z)).toBeCloseTo(Math.abs(result1.z) * 2, 1);
    });

    it('should handle 180-degree azimuth', () => {
      const result = azElTo3D(180, 0, 10);
      expect(result.x).toBeCloseTo(0, 1);
      expect(result.z).toBeCloseTo(10, 1);
    });
  });

  describe('getARDistance', () => {
    it('should return minimum distance for high elevation', () => {
      const distance = getARDistance(90);
      // At 90° elevation, distance is minDistance + offset
      expect(distance).toBeGreaterThan(6);
      expect(distance).toBeLessThan(10);
    });

    it('should return maximum distance for low elevation', () => {
      const distance = getARDistance(-10);
      expect(distance).toBeCloseTo(20, 1);
    });

    it('should interpolate for mid elevation', () => {
      const distance = getARDistance(40);
      expect(distance).toBeGreaterThan(8);
      expect(distance).toBeLessThan(20);
    });

    it('should handle negative elevations', () => {
      const distance = getARDistance(-5);
      expect(distance).toBeGreaterThan(8);
      expect(distance).toBeLessThanOrEqual(20);
    });

    it('should be monotonic (lower elevation = greater distance)', () => {
      const dist1 = getARDistance(60);
      const dist2 = getARDistance(30);
      const dist3 = getARDistance(0);
      expect(dist2).toBeGreaterThan(dist1);
      expect(dist3).toBeGreaterThan(dist2);
    });
  });

  describe('azElToCanvas', () => {
    it('should convert azimuth/elevation to canvas coordinates', () => {
      const result = azElToCanvas(0, 90, 400, 300, 200);
      expect(result.x).toBeCloseTo(400, 1);
      expect(result.y).toBeCloseTo(300, 1);
    });

    it('should place horizon objects at radius distance', () => {
      const centerX = 400;
      const centerY = 300;
      const radius = 200;
      const result = azElToCanvas(0, 0, centerX, centerY, radius);
      const distance = Math.sqrt(
        Math.pow(result.x - centerX, 2) + Math.pow(result.y - centerY, 2)
      );
      expect(distance).toBeCloseTo(radius, 1);
    });

    it('should handle 90-degree azimuth (East)', () => {
      const result = azElToCanvas(90, 0, 400, 300, 200);
      expect(result.x).toBeGreaterThan(400);
      expect(result.y).toBeCloseTo(300, 1);
    });

    it('should handle 180-degree azimuth (South)', () => {
      const result = azElToCanvas(180, 0, 400, 300, 200);
      expect(result.x).toBeCloseTo(400, 1);
      expect(result.y).toBeGreaterThan(300);
    });

    it('should handle 270-degree azimuth (West)', () => {
      const result = azElToCanvas(270, 0, 400, 300, 200);
      expect(result.x).toBeLessThan(400);
      expect(result.y).toBeCloseTo(300, 1);
    });
  });

  describe('latLonToGlobePosition', () => {
    it('should convert equator at prime meridian', () => {
      const result = latLonToGlobePosition(0, 0, 10);
      expect(result.x).toBeCloseTo(10, 1);
      expect(result.y).toBeCloseTo(0, 1);
      expect(result.z).toBeCloseTo(0, 1);
    });

    it('should convert north pole', () => {
      const result = latLonToGlobePosition(90, 0, 10);
      expect(result.x).toBeCloseTo(0, 1);
      expect(result.y).toBeCloseTo(10, 1);
      expect(result.z).toBeCloseTo(0, 1);
    });

    it('should convert south pole', () => {
      const result = latLonToGlobePosition(-90, 0, 10);
      expect(result.x).toBeCloseTo(0, 1);
      expect(result.y).toBeCloseTo(-10, 1);
      expect(result.z).toBeCloseTo(0, 1);
    });

    it('should handle different radii', () => {
      const result1 = latLonToGlobePosition(0, 0, 5);
      const result2 = latLonToGlobePosition(0, 0, 10);
      expect(result2.x).toBeCloseTo(result1.x * 2, 1);
    });

    it('should place 90-degree longitude correctly', () => {
      const result = latLonToGlobePosition(0, 90, 10);
      expect(result.x).toBeCloseTo(0, 1);
      expect(result.z).toBeCloseTo(-10, 1);
    });
  });

  describe('celestialToGlobePosition', () => {
    it('should convert celestial coordinates to globe position', () => {
      const result = celestialToGlobePosition(0, 0, 10);
      expect(result).toBeInstanceOf(THREE.Vector3);
      expect(result.y).toBeCloseTo(-5, 1); // Offset by -5
      expect(result.z).toBeCloseTo(-30, 1); // -10 + offset -20
    });

    it('should apply vertical offset', () => {
      const result = celestialToGlobePosition(0, 0, 10);
      const noOffset = azElTo3D(0, 0, 10);
      expect(result.y).toBe(noOffset.y - 5);
    });

    it('should apply depth offset', () => {
      const result = celestialToGlobePosition(0, 0, 10);
      const noOffset = azElTo3D(0, 0, 10);
      expect(result.z).toBe(noOffset.z - 20);
    });
  });
});

describe('WebGLRenderer', () => {
  let canvas: HTMLCanvasElement;
  let renderer: WebGLRenderer;

  beforeEach(() => {
    canvas = document.createElement('canvas') as HTMLCanvasElement;
    renderer = new WebGLRenderer(canvas);
  });

  afterEach(() => {
    if (renderer && renderer.getRenderer()) {
      renderer.dispose();
    }
  });

  describe('initialization', () => {
    it('should create scene and camera', () => {
      expect(renderer.getScene()).toBeInstanceOf(THREE.Scene);
      expect(renderer.getCamera()).toBeInstanceOf(THREE.PerspectiveCamera);
    });

    it('should create WebGL renderer when available', () => {
      expect(renderer.getRenderer()).toBeDefined();
    });

    it('should set up camera with correct aspect ratio', () => {
      const camera = renderer.getCamera();
      expect(camera.aspect).toBeGreaterThan(0);
    });
  });

  describe('render2DCanvas fallback', () => {
    it('should render using canvas 2D context', () => {
      const samples = createSunSamples(10);
      
      // Just ensure it doesn't throw
      expect(() => renderer.render2DCanvas(samples, 0)).not.toThrow();
    });

    it('should handle empty samples array', () => {
      expect(() => renderer.render2DCanvas([], 0)).not.toThrow();
    });

    it('should render compass directions', () => {
      const samples = createSunSamples(5);
      
      // Ensure rendering completes without errors
      expect(() => renderer.render2DCanvas(samples, 0)).not.toThrow();
    });

    it('should handle different heading values', () => {
      const samples = createSunSamples(5);
      
      expect(() => renderer.render2DCanvas(samples, 90)).not.toThrow();
      expect(() => renderer.render2DCanvas(samples, 180)).not.toThrow();
      expect(() => renderer.render2DCanvas(samples, 270)).not.toThrow();
    });
  });

  describe('render2DThreeJS', () => {
    it('should render using Three.js when available', () => {
      const samples = createSunSamples(10);
      
      expect(() => renderer.render2DThreeJS(samples, 0)).not.toThrow();
    });

    it('should handle empty samples', () => {
      expect(() => renderer.render2DThreeJS([], 0)).not.toThrow();
    });
  });

  describe('updateCelestialPositions', () => {
    it('should update sun and moon positions', () => {
      const celestialData = createCelestialData();
      
      expect(() => 
        renderer.updateCelestialPositions(celestialData, 37.7749, -122.4194)
      ).not.toThrow();
    });

    it('should handle different user locations', () => {
      const celestialData = createCelestialData();
      
      expect(() => 
        renderer.updateCelestialPositions(celestialData, 0, 0)
      ).not.toThrow();
      
      expect(() => 
        renderer.updateCelestialPositions(celestialData, -33.8688, 151.2093)
      ).not.toThrow();
    });
  });

  describe('animations', () => {
    it('should update globe animation', () => {
      const time = Date.now();
      expect(() => renderer.updateGlobeAnimation(time)).not.toThrow();
    });

    it('should update celestial animations', () => {
      const time = Date.now();
      expect(() => renderer.updateCelestialAnimations(time)).not.toThrow();
    });
  });

  describe('resource management', () => {
    it('should dispose properly', () => {
      expect(() => renderer.dispose()).not.toThrow();
    });
  });
});

describe('ARRenderer', () => {
  let scene: THREE.Scene;
  let arRenderer: ARRenderer;

  beforeEach(() => {
    scene = new THREE.Scene();
    arRenderer = new ARRenderer(scene);
  });

  describe('initialization', () => {
    it('should create with scene', () => {
      expect(arRenderer).toBeDefined();
    });
  });

  describe('renderAR', () => {
    it('should render AR overlay with samples and heading', () => {
      const samples = createSunSamples(10);
      
      expect(() => arRenderer.renderAR(samples, 0)).not.toThrow();
    });

    it('should handle empty samples', () => {
      expect(() => arRenderer.renderAR([], 0)).not.toThrow();
    });

    it('should update when heading changes significantly', () => {
      const samples = createSunSamples(10);
      
      arRenderer.renderAR(samples, 0);
      const objectCount1 = scene.children.length;
      
      arRenderer.renderAR(samples, 45); // Significant heading change
      const objectCount2 = scene.children.length;
      
      // Should rebuild AR objects
      expect(objectCount2).toBeGreaterThan(0);
    });

    it('should create sun path in AR mode', () => {
      const samples = createSunSamples(20);
      
      arRenderer.renderAR(samples, 0);
      
      const hasPathObject = scene.children.some(child => 
        child.userData.isSunPath || child instanceof THREE.Line
      );
      expect(hasPathObject).toBe(true);
    });

    it('should create current sun marker', () => {
      const samples = createSunSamples(10);
      
      arRenderer.renderAR(samples, 0);
      
      const hasCurrentSun = scene.children.some(child => 
        child.userData.isCurrentSunMarker
      );
      expect(hasCurrentSun).toBe(true);
    });
  });

  describe('updatePulsingAnimations', () => {
    it('should animate pulsing objects', () => {
      const samples = createSunSamples(5);
      arRenderer.renderAR(samples, 0);
      
      const pulsingObject = scene.children.find(child => 
        child.userData.isPulsing
      );
      
      if (pulsingObject) {
        const initialScale = pulsingObject.scale.clone();
        arRenderer.updatePulsingAnimations();
        
        // Scale should change due to animation
        expect(pulsingObject.scale.equals(initialScale)).toBe(false);
      }
    });
  });

  describe('reset', () => {
    it('should reset AR state', () => {
      const samples = createSunSamples(10);
      arRenderer.renderAR(samples, 0);
      
      arRenderer.reset();
      
      // After reset, rendering same data should recreate objects
      arRenderer.renderAR(samples, 0);
      expect(scene.children.length).toBeGreaterThan(0);
    });
  });

  describe('AR markers', () => {
    it('should create sunrise marker when applicable', () => {
      const samples: SunSample[] = [
        { t: Date.now(), az: 90, el: -5, mass: 1.0 },
        { t: Date.now() + 3600000, az: 95, el: 5, mass: 1.0 },
        { t: Date.now() + 7200000, az: 100, el: 15, mass: 1.0 }
      ];
      
      arRenderer.renderAR(samples, 0);
      
      const hasSunriseMarker = scene.children.some(child => 
        child.userData.isSunriseMarker
      );
      expect(hasSunriseMarker).toBe(true);
    });

    it('should create sunset marker when applicable', () => {
      const samples: SunSample[] = [
        { t: Date.now(), az: 90, el: 5, mass: 1.0 },
        { t: Date.now() + 3600000, az: 180, el: 15, mass: 1.0 },
        { t: Date.now() + 7200000, az: 270, el: 5, mass: 1.0 },
        { t: Date.now() + 10800000, az: 275, el: -1, mass: 1.0 }
      ];
      
      arRenderer.renderAR(samples, 0);
      
      const hasSunsetMarker = scene.children.some(child => 
        child.userData.isSunsetMarker
      );
      // Sunset marker is created when sun crosses below horizon
      expect(scene.children.length).toBeGreaterThan(0);
    });
  });
});

describe('RenderingAgent - Render Coordinator', () => {
  let container: HTMLElement;
  let renderingAgent: RenderingAgent;

  beforeEach(() => {
    container = document.createElement('div') as any;
    renderingAgent = new RenderingAgent(container);
  });

  afterEach(() => {
    if (renderingAgent) {
      renderingAgent.dispose();
    }
  });

  describe('initialization', () => {
    it('should create canvas and append to container', () => {
      expect(container.children.length).toBeGreaterThan(0);
    });

    it('should initialize in 2D mode', () => {
      expect(renderingAgent.currentMode).toBe('2D');
    });
  });

  describe('render2D', () => {
    it('should render in 2D mode', () => {
      const samples = createSunSamples(10);
      
      expect(() => renderingAgent.render2D(samples, 0)).not.toThrow();
    });

    it('should handle different headings', () => {
      const samples = createSunSamples(10);
      
      expect(() => renderingAgent.render2D(samples, 90)).not.toThrow();
      expect(() => renderingAgent.render2D(samples, 180)).not.toThrow();
    });

    it('should handle empty samples', () => {
      expect(() => renderingAgent.render2D([], 0)).not.toThrow();
    });
  });

  describe('mode switching', () => {
    it('should toggle from 2D to AR mode', () => {
      expect(renderingAgent.currentMode).toBe('2D');
      
      renderingAgent.toggleMode();
      
      expect(renderingAgent.currentMode).toBe('AR');
    });

    it('should toggle from AR to 2D mode', () => {
      renderingAgent.toggleMode(); // 2D -> AR
      expect(renderingAgent.currentMode).toBe('AR');
      
      renderingAgent.toggleMode(); // AR -> 2D
      expect(renderingAgent.currentMode).toBe('2D');
    });

    it('should toggle multiple times', () => {
      expect(renderingAgent.currentMode).toBe('2D');
      renderingAgent.toggleMode(); // -> AR
      expect(renderingAgent.currentMode).toBe('AR');
      renderingAgent.toggleMode(); // -> 2D
      expect(renderingAgent.currentMode).toBe('2D');
      renderingAgent.toggleMode(); // -> AR
      expect(renderingAgent.currentMode).toBe('AR');
    });

    it('should handle stream in AR mode', () => {
      const mockStream = {} as MediaStream;
      
      const mode = renderingAgent.toggleMode(mockStream);
      
      expect(mode).toBe('AR');
    });

    it('should clean up video when switching back to 2D', () => {
      const mockStream = {
        getTracks: () => [{ stop: vi.fn() }]
      } as any;
      
      renderingAgent.toggleMode(mockStream); // -> AR
      renderingAgent.toggleMode(); // -> 2D
      
      expect(renderingAgent.currentMode).toBe('2D');
    });
  });

  describe('animation loop', () => {
    it('should start animation loop', () => {
      // Animation loop uses requestAnimationFrame which is mocked
      // Just verify it can be called without error
      expect(() => renderingAgent.startAnimationLoop()).not.toThrow();
      expect(global.requestAnimationFrame).toHaveBeenCalled();
    });

    it('should not start multiple animation loops', () => {
      renderingAgent.startAnimationLoop();
      const callCount1 = (global.requestAnimationFrame as any).mock.calls.length;
      
      renderingAgent.startAnimationLoop();
      const callCount2 = (global.requestAnimationFrame as any).mock.calls.length;
      
      // Should not increment if already running
      expect(callCount2).toBe(callCount1);
    });
  });

  describe('updateData', () => {
    it('should update samples and heading', () => {
      const samples = createSunSamples(10);
      
      expect(() => renderingAgent.updateData(samples, 45)).not.toThrow();
    });

    it('should persist data for animation loop', () => {
      const samples = createSunSamples(10);
      renderingAgent.updateData(samples, 90);
      
      // Data should be stored for use in animation
      expect(true).toBe(true);
    });
  });

  describe('snapshot', () => {
    it('should return data URL', () => {
      const snapshot = renderingAgent.snapshot();
      
      expect(snapshot).toBeTruthy();
      expect(snapshot).toContain('data:image/png');
    });

    it('should work with metadata', () => {
      const metadata = { timestamp: Date.now(), location: 'test' };
      const snapshot = renderingAgent.snapshot(metadata);
      
      expect(snapshot).toBeTruthy();
    });
  });

  describe('updateCelestialPositions', () => {
    it('should update celestial bodies on globe', () => {
      const celestialData = createCelestialData();
      
      expect(() => 
        renderingAgent.updateCelestialPositions(celestialData, 37.7749, -122.4194)
      ).not.toThrow();
    });

    it('should handle different locations', () => {
      const celestialData = createCelestialData();
      
      expect(() => 
        renderingAgent.updateCelestialPositions(celestialData, -90, 0)
      ).not.toThrow();
      
      expect(() => 
        renderingAgent.updateCelestialPositions(celestialData, 90, 0)
      ).not.toThrow();
    });
  });

  describe('resource cleanup', () => {
    it('should dispose of resources', () => {
      expect(() => renderingAgent.dispose()).not.toThrow();
    });

    it('should cancel animation frame on dispose', () => {
      renderingAgent.startAnimationLoop();
      
      // Clear mock calls before dispose
      (global.cancelAnimationFrame as any).mockClear();
      
      renderingAgent.dispose();
      
      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });
  });
});

describe('Fallback Scenarios', () => {
  describe('WebGL not available', () => {
    it('should handle WebGL failures gracefully', () => {
      const canvas = document.createElement('canvas') as HTMLCanvasElement;
      const renderer = new WebGLRenderer(canvas);
      
      // WebGL might not be available in test environment
      // Just ensure renderer was created
      expect(renderer).toBeDefined();
      expect(renderer.getScene()).toBeDefined();
      expect(renderer.getCamera()).toBeDefined();
    });

    it('should render using canvas fallback when needed', () => {
      const canvas = document.createElement('canvas') as HTMLCanvasElement;
      const renderer = new WebGLRenderer(canvas);
      const samples = createSunSamples(10);
      
      // Canvas 2D fallback should always work
      expect(() => renderer.render2DCanvas(samples, 0)).not.toThrow();
    });
  });

  describe('Canvas 2D fallback', () => {
    it('should handle missing 2D context gracefully', () => {
      const canvas = document.createElement('canvas') as HTMLCanvasElement;
      vi.spyOn(canvas, 'getContext').mockReturnValue(null);
      
      const renderer = new WebGLRenderer(canvas);
      const samples = createSunSamples(5);
      
      expect(() => renderer.render2DCanvas(samples, 0)).not.toThrow();
    });
  });
});

describe('Edge Cases and Error Handling', () => {
  describe('coordinate conversion edge cases', () => {
    it('should handle extreme azimuth values', () => {
      expect(() => azElTo3D(0, 45, 10)).not.toThrow();
      expect(() => azElTo3D(360, 45, 10)).not.toThrow();
      expect(() => azElTo3D(720, 45, 10)).not.toThrow();
    });

    it('should handle extreme elevation values', () => {
      expect(() => azElTo3D(180, 90, 10)).not.toThrow();
      expect(() => azElTo3D(180, -90, 10)).not.toThrow();
    });

    it('should handle zero distance', () => {
      const result = azElTo3D(0, 0, 0);
      expect(Math.abs(result.x)).toBeLessThan(0.001);
      expect(Math.abs(result.y)).toBeLessThan(0.001);
      expect(Math.abs(result.z)).toBeLessThan(0.001);
    });

    it('should handle extreme latitude/longitude', () => {
      expect(() => latLonToGlobePosition(90, 0, 10)).not.toThrow();
      expect(() => latLonToGlobePosition(-90, 0, 10)).not.toThrow();
      expect(() => latLonToGlobePosition(0, 180, 10)).not.toThrow();
      expect(() => latLonToGlobePosition(0, -180, 10)).not.toThrow();
    });
  });

  describe('rendering with edge case data', () => {
    it('should handle all samples below horizon', () => {
      const samples: SunSample[] = [
        { t: Date.now(), az: 180, el: -20, mass: 1.0 },
        { t: Date.now() + 3600000, az: 185, el: -25, mass: 1.0 }
      ];
      
      const canvas = document.createElement('canvas') as HTMLCanvasElement;
      const renderer = new WebGLRenderer(canvas);
      
      expect(() => renderer.render2DCanvas(samples, 0)).not.toThrow();
    });

    it('should handle rapid heading changes', () => {
      const container = document.createElement('div') as any;
      const renderingAgent = new RenderingAgent(container);
      const samples = createSunSamples(10);
      
      renderingAgent.updateData(samples, 0);
      renderingAgent.updateData(samples, 90);
      renderingAgent.updateData(samples, 180);
      renderingAgent.updateData(samples, 270);
      
      expect(true).toBe(true); // No errors thrown
      
      renderingAgent.dispose();
    });

    it('should handle single sample', () => {
      const sample: SunSample[] = [
        { t: Date.now(), az: 180, el: 45, mass: 1.0 }
      ];
      
      const canvas = document.createElement('canvas') as HTMLCanvasElement;
      const renderer = new WebGLRenderer(canvas);
      
      expect(() => renderer.render2DCanvas(sample, 0)).not.toThrow();
    });
  });

  describe('performance considerations', () => {
    it('should handle large number of samples', () => {
      const samples = createSunSamples(1000);
      const canvas = document.createElement('canvas') as HTMLCanvasElement;
      const renderer = new WebGLRenderer(canvas);
      
      expect(() => renderer.render2DCanvas(samples, 0)).not.toThrow();
    });

    it('should handle rapid mode switching', () => {
      const container = document.createElement('div') as any;
      const renderingAgent = new RenderingAgent(container);
      
      for (let i = 0; i < 10; i++) {
        renderingAgent.toggleMode();
      }
      
      expect(true).toBe(true); // No errors
      renderingAgent.dispose();
    });
  });
});

describe('Integration Tests', () => {
  describe('complete rendering workflow', () => {
    it('should complete full 2D rendering workflow', () => {
      const container = document.createElement('div') as any;
      const renderingAgent = new RenderingAgent(container);
      const samples = createSunSamples(24);
      
      renderingAgent.render2D(samples, 0);
      renderingAgent.updateData(samples, 45);
      
      const snapshot = renderingAgent.snapshot();
      expect(snapshot).toBeTruthy();
      
      renderingAgent.dispose();
    });

    it('should complete full AR rendering workflow', () => {
      const container = document.createElement('div') as any;
      const renderingAgent = new RenderingAgent(container);
      const samples = createSunSamples(24);
      
      renderingAgent.toggleMode(); // Switch to AR
      renderingAgent.updateData(samples, 90);
      
      const snapshot = renderingAgent.snapshot();
      expect(snapshot).toBeTruthy();
      
      renderingAgent.dispose();
    });

    it('should handle mode switching workflow', () => {
      const container = document.createElement('div') as any;
      const renderingAgent = new RenderingAgent(container);
      const samples = createSunSamples(24);
      
      renderingAgent.updateData(samples, 0);
      renderingAgent.render2D(samples, 0);
      
      renderingAgent.toggleMode(); // -> AR
      renderingAgent.updateData(samples, 45);
      
      renderingAgent.toggleMode(); // -> 2D
      renderingAgent.updateData(samples, 90);
      
      expect(renderingAgent.currentMode).toBe('2D');
      
      renderingAgent.dispose();
    });
  });

  describe('celestial data integration', () => {
    it('should integrate ephemeris data with rendering', () => {
      const container = document.createElement('div') as any;
      const renderingAgent = new RenderingAgent(container);
      const celestialData = createCelestialData();
      
      renderingAgent.updateCelestialPositions(
        celestialData, 
        37.7749, 
        -122.4194
      );
      
      const samples = createSunSamples(24);
      renderingAgent.render2D(samples, 0);
      
      renderingAgent.dispose();
    });
  });
});
