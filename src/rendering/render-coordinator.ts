/**
 * Render Coordinator - Mode switching and coordination for rendering
 * This is the main public API for the rendering system
 */

import * as THREE from 'three';
import { SunSample, CelestialData } from '../ephemeris.js';
import { WebGLRenderer } from './webgl-renderer.js';
import { ARRenderer } from './ar-renderer.js';

/**
 * Options for configuring the rendering system
 */
export interface RenderOptions {
  /** Maximum frames per second to render (default: unlimited) */
  fpsLimit?: number;
  /** Whether to force fallback 2D canvas rendering (default: false) */
  fallback?: boolean;
}

/**
 * Main rendering coordinator that manages both 2D and AR rendering modes
 * This is the primary public API for the rendering system. It coordinates between
 * WebGL rendering (3D globe view) and AR mode (camera overlay with sun tracking).
 * @example
 * ```typescript
 * const container = document.getElementById('app');
 * const renderer = new RenderingAgent(container);
 * renderer.render2D(sunSamples, deviceHeading);
 * renderer.startAnimationLoop();
 * ```
 */
export class RenderingAgent {
  private canvas: HTMLCanvasElement;
  private webglRenderer: WebGLRenderer;
  private arRenderer: ARRenderer;
  private animationId: number | null = null;
  private mode: '2D' | 'AR' = '2D';
  private videoElement: HTMLVideoElement | null = null;
  private videoTexture: THREE.VideoTexture | null = null;
  private latestSamples: SunSample[] = [];
  private latestHeading: number = 0;

  /**
   * Creates a new rendering coordinator
   * @param container - HTML element to render into (canvas will be created and appended)
   */
  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);
    this.videoElement = document.getElementById('cameraFeed') as HTMLVideoElement;

    this.webglRenderer = new WebGLRenderer(this.canvas);
    this.arRenderer = new ARRenderer(this.webglRenderer.getScene());
  }

  /**
   * Render in 2D mode (compass-style view)
   * Displays the sun's position and path on a compass-style interface
   * @param samples - Array of sun position samples over time
   * @param heading - Device compass heading in degrees (default: 0, North)
   */
  render2D(samples: SunSample[], heading: number = 0) {
    if (this.webglRenderer.getRenderer()) {
      this.webglRenderer.render2DThreeJS(samples, heading);
    } else {
      this.webglRenderer.render2DCanvas(samples, heading);
    }
  }

  /**
   * Start the animation loop for continuous rendering
   * Must be called after initial data is set up. The loop will continuously
   * render the scene and update animations until dispose() is called.
   */
  startAnimationLoop() {
    if (this.animationId !== null) {
      return;
    }

    const renderer = this.webglRenderer.getRenderer();
    if (renderer) {
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      renderer.setPixelRatio(pixelRatio);
    }

    const animate = () => {
      this.animationId = requestAnimationFrame(animate);

      if (this.mode === 'AR') {
        this.arRenderer.renderAR(this.latestSamples, this.latestHeading);
        this.arRenderer.updatePulsingAnimations();
      } else {
        this.webglRenderer.updateGlobeAnimation(Date.now());
        this.webglRenderer.updateCelestialAnimations(Date.now());
      }

      if (this.videoTexture && this.videoElement) {
        this.videoTexture.needsUpdate = true;
      }

      const rendererInstance = this.webglRenderer.getRenderer();
      if (rendererInstance) {
        rendererInstance.render(this.webglRenderer.getScene(), this.webglRenderer.getCamera());
      }
    };

    animate();
  }

  /**
   * Update data for the animation loop
   * Call this whenever sun samples or heading changes to update the visualization
   * @param samples - Updated array of sun position samples
   * @param heading - Updated device compass heading in degrees
   */
  public updateData(samples: SunSample[], heading: number) {
    this.latestSamples = samples;
    this.latestHeading = heading;
  }

  /**
   * Get current rendering mode
   * @returns Current mode: '2D' for compass view or 'AR' for camera overlay
   */
  get currentMode(): '2D' | 'AR' {
    return this.mode;
  }

  /**
   * Toggle between 2D and AR modes
   * Switches the visualization between compass view (2D) and camera overlay (AR)
   * @param stream - Optional MediaStream for AR mode camera feed
   * @returns The new mode after toggling
   */
  toggleMode(stream?: MediaStream): '2D' | 'AR' {
    this.mode = this.mode === '2D' ? 'AR' : '2D';
    
    this.arRenderer.reset();

    const renderer = this.webglRenderer.getRenderer();
    const scene = this.webglRenderer.getScene();
    const globeGroup = this.webglRenderer.getGlobeGroup();

    if (this.mode === 'AR' && stream && this.videoElement) {
      this.videoElement.srcObject = stream;
      this.videoElement.style.display = 'block';
      
      if (globeGroup) {
        globeGroup.visible = false;
      }

      if (renderer) {
        this.videoTexture = new THREE.VideoTexture(this.videoElement);
        scene.background = this.videoTexture;
        renderer.setClearColor(0x000000, 0);
      }
    } else {
      if (this.videoElement) {
        this.videoElement.style.display = 'none';
        if (this.videoElement.srcObject) {
          (this.videoElement.srcObject as MediaStream).getTracks().forEach(track => track.stop());
          this.videoElement.srcObject = null;
        }
      }
      
      if (globeGroup) {
        globeGroup.visible = true;
      }
      
      if (renderer) {
        scene.background = new THREE.Color(0x000033);
        renderer.setClearColor(0x000033, 1);
      }
      if (this.videoTexture) {
        this.videoTexture.dispose();
        this.videoTexture = null;
      }
    }

    return this.mode;
  }

  /**
   * Take a snapshot of current view
   * Captures the current rendering as a PNG image
   * @param _metadata - Optional metadata to embed (not currently used)
   * @returns Data URL string of the captured image (PNG format)
   */
  snapshot(_metadata?: any): string {
    return this.canvas.toDataURL('image/png');
  }

  /**
   * Update celestial positions on the globe
   * Updates the 3D positions of sun and moon on the globe visualization
   * @param celestialData - Current sun and moon position data
   * @param userLat - User's latitude in degrees
   * @param userLon - User's longitude in degrees
   */
  updateCelestialPositions(celestialData: CelestialData, userLat: number, userLon: number): void {
    this.webglRenderer.updateCelestialPositions(celestialData, userLat, userLon);
  }

  /**
   * Dispose of resources and clean up
   * Stops the animation loop and releases all rendering resources
   * Should be called when the renderer is no longer needed
   */
  dispose() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    this.webglRenderer.dispose();
  }
}
