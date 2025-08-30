/**
 * Rendering Agent - Draws overlays in AR/2D modes
 */

import * as THREE from 'three';
import { SunSample } from './ephemeris.js';

export interface RenderOptions {
  fpsLimit?: number;
  fallback?: boolean;
}

export class RenderingAgent {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private animationId: number | null = null;
  private mode: '2D' | 'AR' = '2D';
  private sunMesh: THREE.Mesh | null = null;
  private pathLine: THREE.Line | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private videoTexture: THREE.VideoTexture | null = null;
  private latestSamples: SunSample[] = [];
  private latestHeading: number = 0;

  constructor(container: HTMLElement) {
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);
    this.videoElement = document.getElementById('cameraFeed') as HTMLVideoElement;

    // Initialize Three.js
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    try {
      this.renderer = new THREE.WebGLRenderer({ 
        canvas: this.canvas,
        alpha: true,
        antialias: true
      });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setClearColor(0x87CEEB, 1); // Sky blue background
    } catch (error) {
      console.warn('WebGL not available, falling back to 2D canvas');
      this.setupCanvas2D();
    }

    this.setupScene();
    this.handleResize();
  }

  private setupScene() {
    if (!this.renderer) return;

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);

    // Add directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 5);
    this.scene.add(directionalLight);

    // Create sun mesh
    const sunGeometry = new THREE.SphereGeometry(0.1, 16, 16);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      fog: false
    });
    this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);

    // Add a light to the sun mesh to make it glow
    const sunLight = new THREE.PointLight(0xffffff, 1.2, 100);
    this.sunMesh.add(sunLight);

    this.scene.add(this.sunMesh);

    // Position camera
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);
  }

  private setupCanvas2D() {
    // Fallback 2D canvas implementation
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * Render in 2D mode (compass-style view)
   */
  render2D(samples: SunSample[], heading: number = 0) {
    if (this.renderer && this.scene) {
      this.render2DThreeJS(samples, heading);
    } else {
      this.render2DCanvas(samples, heading);
    }
  }

  private render2DThreeJS(samples: SunSample[], heading: number) {
    if (!this.renderer || !this.sunMesh) return;

    // Clear previous path
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
    }

    // Find current sun position
    const now = Date.now();
    const currentSample = this.findClosestSample(samples, now);
    
    if (currentSample) {
      // Convert azimuth/elevation to 3D position
      const sunPos = this.azElTo3D(currentSample.az - heading, currentSample.el, 5);
      this.sunMesh.position.copy(sunPos);
    }

    // Create sun path line
    const pathPoints: THREE.Vector3[] = [];
    samples.forEach(sample => {
      if (sample.el > -10) { // Only show when sun is near or above horizon
        const pos = this.azElTo3D(sample.az - heading, sample.el, 4.8);
        pathPoints.push(pos);
      }
    });

    if (pathPoints.length > 1) {
      const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
      const pathMaterial = new THREE.LineBasicMaterial({
        color: 0xffff00,
        opacity: 0.9,
        transparent: true
      });
      this.pathLine = new THREE.Line(pathGeometry, pathMaterial);
      this.scene.add(this.pathLine);
    }

    this.renderer.render(this.scene, this.camera);
  }

  private render2DCanvas(samples: SunSample[], heading: number) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.4;

    // Clear canvas
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, width, height);

    // Draw compass circle
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw cardinal directions
    ctx.fillStyle = '#333';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('N', centerX, centerY - radius - 10);
    ctx.fillText('S', centerX, centerY + radius + 25);
    ctx.textAlign = 'left';
    ctx.fillText('E', centerX + radius + 10, centerY + 5);
    ctx.textAlign = 'right';
    ctx.fillText('W', centerX - radius - 10, centerY + 5);

    // Draw sun path
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    let pathStarted = false;

    samples.forEach(sample => {
      if (sample.el > -10) {
        const { x, y } = this.azElToCanvas(sample.az - heading, sample.el, centerX, centerY, radius);
        if (!pathStarted) {
          ctx.moveTo(x, y);
          pathStarted = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();

    // Draw current sun position
    const now = Date.now();
    const currentSample = this.findClosestSample(samples, now);
    
    if (currentSample && currentSample.el > -10) {
      const { x, y } = this.azElToCanvas(currentSample.az - heading, currentSample.el, centerX, centerY, radius);
      
      ctx.fillStyle = '#ffff00';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.strokeStyle = '#ff6600';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  startAnimationLoop() {
    if (this.animationId !== null) {
      // Loop is already running
      return;
    }

    const animate = () => {
      this.animationId = requestAnimationFrame(animate);

      if (this.mode === 'AR') {
        this.renderAR(this.latestSamples, this.latestHeading);
      }
      // No need to call render2D continuously as it's not animated in the same way.
      // The orchestrator can call it when data changes.

      if (this.renderer) {
        this.renderer.render(this.scene, this.camera);
      }
    };

    animate();
  }

  public updateData(samples: SunSample[], heading: number) {
      this.latestSamples = samples;
      this.latestHeading = heading;
  }

  /**
   * Render in AR mode (camera overlay)
   */
  renderAR(samples: SunSample[], heading: number) {
    if (!this.renderer || !this.sunMesh) return;

    // Clear previous path and markers
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
    }
    
    // Clean up old time markers
    const markersToRemove = this.scene.children.filter(child => child.userData.isTimeMarker);
    markersToRemove.forEach(marker => this.scene.remove(marker));

    // Find current sun position
    const now = Date.now();
    const currentSample = this.findClosestSample(samples, now);

    if (currentSample) {
      // Convert azimuth/elevation to 3D position for AR overlay
      const sunPos = this.azElTo3D(currentSample.az - heading, currentSample.el, 5);
      this.sunMesh.position.copy(sunPos);
      
      // Ensure sun is visible in AR mode
      this.sunMesh.visible = currentSample.el > -10; // Only show when sun is above horizon
      
      // Make sun more prominent in AR mode
      const sunMaterial = this.sunMesh.material as THREE.MeshBasicMaterial;
      sunMaterial.color.setHex(0xffff00);
      sunMaterial.transparent = false;
      sunMaterial.opacity = 1.0;
    }

    // Create enhanced sun path line for AR
    const pathPoints: THREE.Vector3[] = [];
    const visibleSamples = samples.filter(sample => sample.el > -10);
    
    visibleSamples.forEach(sample => {
      const pos = this.azElTo3D(sample.az - heading, sample.el, 4.8);
      pathPoints.push(pos);
    });

    if (pathPoints.length > 1) {
      const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
      const pathMaterial = new THREE.LineBasicMaterial({
        color: 0xffaa00,
        opacity: 0.8,
        transparent: true,
        linewidth: 3
      });
      this.pathLine = new THREE.Line(pathGeometry, pathMaterial);
      this.scene.add(this.pathLine);
    }

    // Add time markers and labels for better AR experience
    this.addTimeMarkers(visibleSamples, heading);

    // Ensure proper rendering with camera background
    if (this.videoTexture && this.videoElement) {
      this.videoTexture.needsUpdate = true;
    }
  }

  /**
   * Add time markers along the sun path for AR mode
   */
  private addTimeMarkers(samples: SunSample[], heading: number) {
    // Add markers every 2 hours
    const markerSamples = samples.filter((_, index) => index % 24 === 0); // Every 2 hours (assuming 5-minute intervals)
    
    markerSamples.forEach((sample) => {
      const markerPos = this.azElTo3D(sample.az - heading, sample.el, 4.9);
      
      // Create a small sphere marker
      const markerGeometry = new THREE.SphereGeometry(0.05, 8, 8);
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(markerPos);
      
      // Add marker to scene
      this.scene.add(marker);
      
      // Store marker for cleanup (simplified approach)
      marker.userData.isTimeMarker = true;
    });
  }

  /**
   * Toggle between 2D and AR modes
   */
  get currentMode(): '2D' | 'AR' {
    return this.mode;
  }

  toggleMode(stream?: MediaStream): '2D' | 'AR' {
    this.mode = this.mode === '2D' ? 'AR' : '2D';

    if (this.mode === 'AR' && stream && this.videoElement) {
      this.videoElement.srcObject = stream;
      this.videoElement.style.display = 'block';

      if (this.renderer) {
        this.videoTexture = new THREE.VideoTexture(this.videoElement);
        this.scene.background = this.videoTexture;
        this.renderer.setClearColor(0x000000, 0);
      }
    } else {
      if (this.videoElement) {
        this.videoElement.style.display = 'none';
        if (this.videoElement.srcObject) {
            (this.videoElement.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
      }
      if (this.renderer) {
        this.scene.background = new THREE.Color(0x87CEEB);
        this.renderer.setClearColor(0x87CEEB, 1);
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
   */
  snapshot(_metadata?: any): string {
    return this.canvas.toDataURL('image/png');
  }

  private findClosestSample(samples: SunSample[], timestamp: number): SunSample | null {
    if (samples.length === 0) return null;
    
    return samples.reduce((closest, sample) => {
      const currentDiff = Math.abs(sample.t - timestamp);
      const closestDiff = Math.abs(closest.t - timestamp);
      return currentDiff < closestDiff ? sample : closest;
    });
  }

  private azElTo3D(azimuth: number, elevation: number, distance: number): THREE.Vector3 {
    const azRad = (azimuth * Math.PI) / 180;
    const elRad = (elevation * Math.PI) / 180;
    
    const x = distance * Math.cos(elRad) * Math.sin(azRad);
    const y = distance * Math.sin(elRad);
    const z = -distance * Math.cos(elRad) * Math.cos(azRad);
    
    return new THREE.Vector3(x, y, z);
  }

  private azElToCanvas(azimuth: number, elevation: number, centerX: number, centerY: number, radius: number): { x: number; y: number } {
    // Project onto circle based on elevation (closer to center = higher elevation)
    const elevationFactor = Math.max(0, (90 - elevation) / 90);
    const projectedRadius = radius * elevationFactor;
    
    const azRad = (azimuth * Math.PI) / 180;
    const x = centerX + projectedRadius * Math.sin(azRad);
    const y = centerY - projectedRadius * Math.cos(azRad);
    
    return { x, y };
  }

  private handleResize() {
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      if (this.renderer) {
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
      } else {
        this.canvas.width = width;
        this.canvas.height = height;
      }
    });
  }

  dispose() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}