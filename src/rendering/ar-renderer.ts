/**
 * AR Renderer - AR overlay logic for augmented reality rendering
 */

import * as THREE from 'three';
import { SunSample } from '../ephemeris.js';
import { findClosestSample, azElTo3D, getARDistance } from './render-state.js';

/**
 * Manages AR-specific rendering with camera overlay and sun tracking
 * Handles real-time sun position overlay on camera feed with optimized
 * path rendering and sunrise/sunset markers
 */
export class ARRenderer {
  private scene: THREE.Scene;
  private pathLine: THREE.Line | null = null;
  private lastARHeading: number = -999;
  private lastARSamples: SunSample[] = [];
  private arObjectsCreated: boolean = false;

  /**
   * Creates a new AR renderer
   * @param scene - The Three.js scene to add AR objects to
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Render in AR mode with optimized updates
   * Only recreates sun path and markers when heading or samples change significantly,
   * while updating the current sun marker every frame
   * @param samples - Array of sun position samples over time
   * @param heading - Device compass heading in degrees
   */
  renderAR(samples: SunSample[], heading: number) {
    const headingChanged = Math.abs(heading - this.lastARHeading) > 1.5;
    const samplesChanged = samples.length !== this.lastARSamples.length || 
                          !this.arObjectsCreated;

    if (headingChanged || samplesChanged) {
      if (this.pathLine) {
        this.scene.remove(this.pathLine);
      }
      
      const markersToRemove = this.scene.children.filter(child => 
        child.userData.isTimeMarker || 
        child.userData.isSunPath || 
        child.userData.isSunriseMarker || 
        child.userData.isSunsetMarker
      );
      markersToRemove.forEach(marker => this.scene.remove(marker));

      this.createOptimizedSunPath(samples, heading);
      this.addEssentialMarkers(samples, heading);

      this.lastARHeading = heading;
      this.lastARSamples = [...samples];
      this.arObjectsCreated = true;
    }

    this.updateCurrentSunInAR(samples, heading);
  }

  /**
   * Update only the current sun position in AR mode (called every frame)
   */
  private updateCurrentSunInAR(samples: SunSample[], heading: number) {
    const now = Date.now();
    const currentSample = findClosestSample(samples, now);

    if (currentSample) {
      const oldMarkers = this.scene.children.filter(child => 
        child.userData.isCurrentSunMarker
      );
      oldMarkers.forEach(marker => this.scene.remove(marker));

      const distance = getARDistance(Math.max(currentSample.el, -5));
      const pos = azElTo3D(currentSample.az - heading, Math.max(currentSample.el, -5), distance);
      
      const sunMarker = new THREE.Group();
      
      const sunGeometry = new THREE.SphereGeometry(0.8, 32, 32);
      const sunMaterial = new THREE.MeshBasicMaterial({
        color: currentSample.el > 0 ? 0xffff00 : 0xff6600,
        transparent: true,
        opacity: 0.9
      });
      
      const sun = new THREE.Mesh(sunGeometry, sunMaterial);
      sunMarker.add(sun);
      
      const coronaGeometry = new THREE.SphereGeometry(1.2, 16, 16);
      const coronaMaterial = new THREE.MeshBasicMaterial({
        color: currentSample.el > 0 ? 0xffff00 : 0xff6600,
        transparent: true,
        opacity: 0.2
      });
      const corona = new THREE.Mesh(coronaGeometry, coronaMaterial);
      sunMarker.add(corona);
      
      sunMarker.position.copy(pos);
      sunMarker.userData.isCurrentSunMarker = true;
      sunMarker.userData.isPulsing = true;
      sunMarker.userData.baseScale = 1.0;
      
      this.scene.add(sunMarker);
    }
  }

  /**
   * Create optimized sun path with single line and gradient colors
   */
  private createOptimizedSunPath(samples: SunSample[], heading: number) {
    const pathPoints: THREE.Vector3[] = [];
    const colors: number[] = [];
    
    samples.forEach(sample => {
      if (sample.el > -15) {
        const distance = getARDistance(sample.el);
        const pos = azElTo3D(sample.az - heading, sample.el, distance);
        pathPoints.push(pos);
        
        let r, g, b;
        if (sample.el > 0) {
          const factor = Math.min(sample.el / 30, 1);
          r = 1; g = 1; b = 0.3 + 0.7 * factor;
        } else {
          const factor = Math.max((sample.el + 15) / 15, 0);
          r = 1; g = 0.3 + 0.4 * factor; b = 0.1;
        }
        colors.push(r, g, b);
      }
    });

    if (pathPoints.length > 1) {
      const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
      pathGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      
      const pathMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        opacity: 0.8,
        transparent: true,
        linewidth: 3
      });
      
      this.pathLine = new THREE.Line(pathGeometry, pathMaterial);
      this.pathLine.userData.isSunPath = true;
      this.scene.add(this.pathLine);
    }
  }

  /**
   * Add only essential markers (sunrise/sunset) for clean AR view
   */
  private addEssentialMarkers(samples: SunSample[], heading: number) {
    let sunriseIndex = -1;
    let sunsetIndex = -1;

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      
      if (prev.el < -0.833 && curr.el >= -0.833 && sunriseIndex === -1) {
        sunriseIndex = i;
      }
      if (prev.el >= -0.833 && curr.el < -0.833 && sunriseIndex !== -1 && sunsetIndex === -1) {
        sunsetIndex = i;
      }
    }

    if (sunriseIndex !== -1) {
      const sample = samples[sunriseIndex];
      const distance = getARDistance(sample.el);
      const pos = azElTo3D(sample.az - heading, sample.el, distance);
      const marker = this.createCleanARMarker(pos, '🌅', 0xff6600, 1.2);
      marker.userData.isSunriseMarker = true;
      this.scene.add(marker);
    }

    if (sunsetIndex !== -1) {
      const sample = samples[sunsetIndex];
      const distance = getARDistance(sample.el);
      const pos = azElTo3D(sample.az - heading, sample.el, distance);
      const marker = this.createCleanARMarker(pos, '🌇', 0xff3300, 1.2);
      marker.userData.isSunsetMarker = true;
      this.scene.add(marker);
    }
  }

  /**
   * Create clean, minimal AR marker
   */
  private createCleanARMarker(position: THREE.Vector3, _emoji: string, color: number, size: number): THREE.Group {
    const group = new THREE.Group();
    
    const geometry = new THREE.SphereGeometry(size * 0.3, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8
    });
    
    const sphere = new THREE.Mesh(geometry, material);
    group.add(sphere);
    
    group.position.copy(position);
    return group;
  }

  /**
   * Update pulsing animations for markers
   * Creates breathing/pulsing effect for AR markers to draw attention
   */
  updatePulsingAnimations() {
    const time = Date.now() * 0.002;
    
    this.scene.traverse((child) => {
      if (child.userData.isPulsing) {
        const baseScale = child.userData.baseScale || 1.0;
        const pulseAmount = Math.sin(time) * 0.3 + 1.0;
        child.scale.setScalar(baseScale * pulseAmount);
      }
    });
  }

  /**
   * Reset AR tracking state
   * Clears cached data to force a full regeneration of AR objects
   * Should be called when switching to AR mode or resetting the view
   */
  reset() {
    this.lastARHeading = -999;
    this.lastARSamples = [];
    this.arObjectsCreated = false;
  }
}
