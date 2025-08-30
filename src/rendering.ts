/**
 * Rendering Agent - Draws overlays in AR/2D modes
 */

import * as THREE from 'three';
import { SunSample, CelestialData } from './ephemeris.js';

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
  private globeGroup: THREE.Group | null = null;
  private moonMesh: THREE.Mesh | null = null;
  private userLocationMesh: THREE.Mesh | null = null;

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

    // Create wireframe globe for 2D mode
    this.createWireframeGlobe();

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
      // AR mode - hide globe, show camera
      this.videoElement.srcObject = stream;
      this.videoElement.style.display = 'block';
      
      if (this.globeGroup) {
        this.globeGroup.visible = false;
      }

      if (this.renderer) {
        this.videoTexture = new THREE.VideoTexture(this.videoElement);
        this.scene.background = this.videoTexture;
        this.renderer.setClearColor(0x000000, 0);
      }
    } else {
      // 2D mode - show globe, hide camera
      if (this.videoElement) {
        this.videoElement.style.display = 'none';
        if (this.videoElement.srcObject) {
            (this.videoElement.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
      }
      
      if (this.globeGroup) {
        this.globeGroup.visible = true;
      }
      
      if (this.renderer) {
        this.scene.background = new THREE.Color(0x000033); // Dark space background for globe view
        this.renderer.setClearColor(0x000033, 1);
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

  /**
   * Create wireframe globe with continents and celestial bodies
   */
  private createWireframeGlobe(): void {
    if (!this.renderer) return;

    this.globeGroup = new THREE.Group();
    
    // Create Earth wireframe sphere
    const earthGeometry = new THREE.SphereGeometry(10, 32, 16);
    const earthWireframe = new THREE.WireframeGeometry(earthGeometry);
    const earthMaterial = new THREE.LineBasicMaterial({ 
      color: 0x00aaff, 
      transparent: true, 
      opacity: 0.6 
    });
    const earthMesh = new THREE.LineSegments(earthWireframe, earthMaterial);
    this.globeGroup.add(earthMesh);

    // Add equator line
    const equatorGeometry = new THREE.RingGeometry(10, 10.1, 64);
    const equatorMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00ff00, 
      transparent: true, 
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    const equatorRing = new THREE.Mesh(equatorGeometry, equatorMaterial);
    equatorRing.rotation.x = Math.PI / 2;
    this.globeGroup.add(equatorRing);

    // Add prime meridian and other major lines
    this.addMajorLines();

    // Add basic landmasses
    this.addBasicLandmasses();

    // Create moon
    const moonGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const moonMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xcccccc,
      transparent: true,
      opacity: 0.8
    });
    this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    this.globeGroup.add(this.moonMesh);

    // Create user location marker
    const locationGeometry = new THREE.ConeGeometry(0.3, 1, 8);
    const locationMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.userLocationMesh = new THREE.Mesh(locationGeometry, locationMaterial);
    this.globeGroup.add(this.userLocationMesh);

    // Position globe in scene
    this.globeGroup.position.set(0, -5, -20);
    this.scene.add(this.globeGroup);
  }

  private addMajorLines(): void {
    if (!this.globeGroup) return;

    // Add meridian lines (longitude)
    for (let lon = 0; lon < 360; lon += 30) {
      const points = [];
      for (let lat = -90; lat <= 90; lat += 10) {
        const latRad = (lat * Math.PI) / 180;
        const lonRad = (lon * Math.PI) / 180;
        
        const x = 10 * Math.cos(latRad) * Math.cos(lonRad);
        const y = 10 * Math.sin(latRad);
        const z = -10 * Math.cos(latRad) * Math.sin(lonRad);
        
        points.push(new THREE.Vector3(x, y, z));
      }
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ 
        color: 0x444444, 
        transparent: true, 
        opacity: 0.4 
      });
      const line = new THREE.Line(geometry, material);
      this.globeGroup.add(line);
    }

    // Add parallel lines (latitude)
    for (let lat = -60; lat <= 60; lat += 30) {
      const points = [];
      const radius = 10 * Math.cos((lat * Math.PI) / 180);
      const y = 10 * Math.sin((lat * Math.PI) / 180);
      
      for (let lon = 0; lon <= 360; lon += 10) {
        const lonRad = (lon * Math.PI) / 180;
        const x = radius * Math.cos(lonRad);
        const z = -radius * Math.sin(lonRad);
        points.push(new THREE.Vector3(x, y, z));
      }
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ 
        color: 0x444444, 
        transparent: true, 
        opacity: 0.4 
      });
      const line = new THREE.Line(geometry, material);
      this.globeGroup.add(line);
    }
  }

  private addBasicLandmasses(): void {
    if (!this.globeGroup) return;

    // Basic landmass outlines using simplified continental shapes
    const landmassData = [
      // North America (simplified)
      { name: 'North America', points: [
        { lat: 70, lon: -100 }, { lat: 60, lon: -140 }, { lat: 35, lon: -120 }, 
        { lat: 25, lon: -100 }, { lat: 30, lon: -85 }, { lat: 45, lon: -75 }, 
        { lat: 60, lon: -65 }, { lat: 70, lon: -100 }
      ]},
      
      // South America (simplified)
      { name: 'South America', points: [
        { lat: 10, lon: -70 }, { lat: -20, lon: -70 }, { lat: -35, lon: -60 }, 
        { lat: -55, lon: -70 }, { lat: -30, lon: -40 }, { lat: 5, lon: -50 }, 
        { lat: 10, lon: -70 }
      ]},
      
      // Europe (simplified)
      { name: 'Europe', points: [
        { lat: 70, lon: 20 }, { lat: 60, lon: -10 }, { lat: 35, lon: 0 }, 
        { lat: 35, lon: 40 }, { lat: 60, lon: 60 }, { lat: 70, lon: 20 }
      ]},
      
      // Africa (simplified)
      { name: 'Africa', points: [
        { lat: 35, lon: 0 }, { lat: 35, lon: 50 }, { lat: -35, lon: 40 }, 
        { lat: -35, lon: 15 }, { lat: 35, lon: 0 }
      ]},
      
      // Asia (simplified)
      { name: 'Asia', points: [
        { lat: 70, lon: 60 }, { lat: 70, lon: 140 }, { lat: 20, lon: 140 }, 
        { lat: 20, lon: 60 }, { lat: 70, lon: 60 }
      ]},
      
      // Australia (simplified)
      { name: 'Australia', points: [
        { lat: -10, lon: 115 }, { lat: -35, lon: 115 }, { lat: -35, lon: 150 }, 
        { lat: -10, lon: 150 }, { lat: -10, lon: 115 }
      ]},
    ];

    landmassData.forEach(landmass => {
      const points = [];
      
      for (const coord of landmass.points) {
        const pos = this.latLonToGlobePosition(coord.lat, coord.lon, 10.1); // Slightly above surface
        points.push(pos);
      }
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ 
        color: 0x66ff66, 
        transparent: true, 
        opacity: 0.6,
        linewidth: 2 
      });
      const landmassLine = new THREE.Line(geometry, material);
      this.globeGroup!.add(landmassLine);
    });
  }

  /**
   * Convert latitude/longitude to 3D globe position
   */
  private latLonToGlobePosition(lat: number, lon: number, radius: number = 10): THREE.Vector3 {
    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;
    
    const x = radius * Math.cos(latRad) * Math.cos(lonRad);
    const y = radius * Math.sin(latRad);
    const z = -radius * Math.cos(latRad) * Math.sin(lonRad);
    
    return new THREE.Vector3(x, y, z);
  }

  /**
   * Update celestial positions on the globe
   */
  updateCelestialPositions(celestialData: CelestialData, userLat: number, userLon: number): void {
    if (!this.globeGroup || !this.moonMesh || !this.userLocationMesh) return;

    // Update sun position - always visible, even below horizon
    if (this.sunMesh) {
      const sunDistance = 25; // Further from globe
      // Show below horizon by projecting to minimum elevation
      const displayElevation = Math.max(celestialData.sun.el, -30);
      const sunPos = this.celestialToGlobePosition(
        celestialData.sun.az, 
        displayElevation, 
        sunDistance
      );
      this.sunMesh.position.copy(sunPos);
      this.sunMesh.visible = true;
      
      // Scale sun based on mass (closer = larger)
      const sunMass = celestialData.sun.mass || 1.0;
      this.sunMesh.scale.setScalar(sunMass * 0.8 + 0.2); // Scale between 0.2-1.0
      
      // Dim sun when below horizon
      const sunMaterial = this.sunMesh.material as THREE.MeshBasicMaterial;
      if (celestialData.sun.el < -0.833) {
        sunMaterial.opacity = 0.4; // Dimmed when below horizon
        sunMaterial.transparent = true;
      } else {
        sunMaterial.opacity = 1.0;
        sunMaterial.transparent = false;
      }
    }

    // Update moon position - always visible, even below horizon
    if (this.moonMesh) {
      const moonDistance = 20;
      // Show below horizon by projecting to minimum elevation
      const displayElevation = Math.max(celestialData.moon.el, -25);
      const moonPos = this.celestialToGlobePosition(
        celestialData.moon.az,
        displayElevation,
        moonDistance
      );
      this.moonMesh.position.copy(moonPos);
      this.moonMesh.visible = true;
      
      // Scale moon based on mass/distance (closer = larger)
      const moonMass = celestialData.moon.mass || 1.0;
      this.moonMesh.scale.setScalar(moonMass * 0.6 + 0.3); // Scale between 0.3-0.9
      
      // Update moon appearance based on phase and visibility
      const moonMaterial = this.moonMesh.material as THREE.MeshBasicMaterial;
      let brightness = Math.max(0.3, celestialData.moon.illumination);
      
      // Dim moon when below horizon
      if (celestialData.moon.el < -0.833) {
        brightness *= 0.5; // Dimmed when below horizon
        moonMaterial.transparent = true;
        moonMaterial.opacity = 0.6;
      } else {
        moonMaterial.transparent = celestialData.moon.illumination < 0.1;
        moonMaterial.opacity = 1.0;
      }
      
      moonMaterial.color.setRGB(brightness, brightness, brightness);
    }

    // Update user location on globe
    const userPos = this.latLonToGlobePosition(userLat, userLon, 10.5);
    this.userLocationMesh.position.copy(userPos);
    
    // Point location marker outward from globe center
    this.userLocationMesh.lookAt(
      userPos.x * 2,
      userPos.y * 2, 
      userPos.z * 2
    );
  }

  private celestialToGlobePosition(azimuth: number, elevation: number, distance: number): THREE.Vector3 {
    // Convert celestial coordinates to 3D position around globe
    const azRad = (azimuth * Math.PI) / 180;
    const elRad = (elevation * Math.PI) / 180;
    
    const x = distance * Math.cos(elRad) * Math.sin(azRad);
    const y = distance * Math.sin(elRad);
    const z = -distance * Math.cos(elRad) * Math.cos(azRad);
    
    // Add globe position offset
    return new THREE.Vector3(x, y - 5, z - 20);
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