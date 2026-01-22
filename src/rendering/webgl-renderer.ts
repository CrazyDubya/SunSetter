/**
 * WebGL Renderer - WebGL/Three.js implementation for 3D scene, globe, and lighting
 */

import * as THREE from 'three';
import { SunSample, CelestialData } from '../ephemeris.js';
import { findClosestSample, azElTo3D, azElToCanvas, latLonToGlobePosition, celestialToGlobePosition } from './render-state.js';

/**
 * Manages WebGL rendering, scene setup, and 3D globe visualization
 */
export class WebGLRenderer {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunMesh: THREE.Mesh | null = null;
  private pathLine: THREE.Line | null = null;
  private globeGroup: THREE.Group | null = null;
  private moonMesh: THREE.Mesh | null = null;
  private userLocationMesh: THREE.Mesh | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    try {
      this.renderer = new THREE.WebGLRenderer({ 
        canvas: this.canvas,
        alpha: true,
        antialias: false,
        powerPreference: "low-power"
      });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setClearColor(0x87CEEB, 1);
      
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      this.renderer.setPixelRatio(pixelRatio);
      
    } catch (error) {
      console.warn('WebGL not available, falling back to 2D canvas');
    }

    this.setupScene();
    this.handleResize();
  }

  /**
   * Setup 3D scene with lights and initial objects
   */
  private setupScene() {
    if (!this.renderer) return;

    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 5);
    this.scene.add(directionalLight);

    const sunGeometry = new THREE.SphereGeometry(0.1, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      fog: false
    });
    this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);

    const sunLight = new THREE.PointLight(0xffffff, 1.2, 100);
    this.sunMesh.add(sunLight);

    this.scene.add(this.sunMesh);

    this.createWireframeGlobe();

    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);
  }

  /**
   * Render in 2D mode using Three.js
   */
  render2DThreeJS(samples: SunSample[], heading: number) {
    if (!this.renderer || !this.sunMesh) return;

    if (this.pathLine) {
      this.scene.remove(this.pathLine);
    }

    const now = Date.now();
    const currentSample = findClosestSample(samples, now);
    
    if (currentSample) {
      const sunPos = azElTo3D(currentSample.az - heading, currentSample.el, 5);
      this.sunMesh.position.copy(sunPos);
    }

    const pathPoints: THREE.Vector3[] = [];
    samples.forEach(sample => {
      if (sample.el > -10) {
        const pos = azElTo3D(sample.az - heading, sample.el, 4.8);
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

  /**
   * Fallback 2D canvas rendering
   */
  render2DCanvas(samples: SunSample[], heading: number) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.5);
    gradient.addColorStop(0, '#1e3c72');
    gradient.addColorStop(0.5, '#2a5298');
    gradient.addColorStop(1, '#0f1419');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.shadowColor = 'rgba(135, 206, 235, 0.5)';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#87ceeb';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let elev = 15; elev <= 75; elev += 15) {
      const ringRadius = radius * (1 - elev / 90);
      ctx.beginPath();
      ctx.arc(centerX, centerY, ringRadius, 0, 2 * Math.PI);
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    ctx.fillText('N', centerX, centerY - radius - 20);
    ctx.fillText('S', centerX, centerY + radius + 20);
    ctx.fillText('E', centerX + radius + 20, centerY);
    ctx.fillText('W', centerX - radius - 20, centerY);
    ctx.restore();

    if (samples.length > 1) {
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      const pathGradient = ctx.createLinearGradient(0, centerY - radius, 0, centerY + radius);
      pathGradient.addColorStop(0, '#ffd700');
      pathGradient.addColorStop(0.5, '#ffb347');
      pathGradient.addColorStop(1, '#ff6b35');
      
      ctx.strokeStyle = pathGradient;
      ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
      ctx.shadowBlur = 8;
      
      ctx.beginPath();
      let pathStarted = false;

      samples.forEach(sample => {
        if (sample.el > -10) {
          const { x, y } = azElToCanvas(sample.az - heading, sample.el, centerX, centerY, radius);
          if (!pathStarted) {
            ctx.moveTo(x, y);
            pathStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }

    const now = Date.now();
    const currentSample = findClosestSample(samples, now);
    
    if (currentSample && currentSample.el > -10) {
      const { x, y } = azElToCanvas(currentSample.az - heading, currentSample.el, centerX, centerY, radius);
      
      ctx.save();
      const sunGradient = ctx.createRadialGradient(x, y, 0, x, y, 20);
      sunGradient.addColorStop(0, 'rgba(255, 255, 0, 0.8)');
      sunGradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.4)');
      sunGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = sunGradient;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
      
      ctx.fillStyle = '#ffff00';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.strokeStyle = '#ff8c00';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.stroke();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 3;
      const timeStr = new Date(now).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      ctx.fillText(timeStr, x, y + 25);
    }
    
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /**
   * Update globe rotation and animations for 2D mode
   */
  updateGlobeAnimation(time: number) {
    if (!this.globeGroup) return;
    
    const rotationSpeed = 0.0002;
    this.globeGroup.rotation.y += rotationSpeed;
    
    const bobAmount = 0.1;
    const bobSpeed = 0.001;
    this.globeGroup.position.y = -5 + Math.sin(time * bobSpeed) * bobAmount;
  }

  /**
   * Update celestial body animations for 2D mode
   */
  updateCelestialAnimations(time: number) {
    if (!this.sunMesh || !this.moonMesh) return;
    
    const sunMaterial = this.sunMesh.material as THREE.MeshBasicMaterial;
    const glowIntensity = 0.8 + Math.sin(time * 0.003) * 0.2;
    const brightness = Math.floor(255 * glowIntensity);
    sunMaterial.color.setHex((brightness << 16) | (brightness << 8) | 0x00);
    
    const moonMaterial = this.moonMesh.material as THREE.MeshBasicMaterial;
    const moonPhase = Math.sin(time * 0.001) * 0.5 + 0.5;
    moonMaterial.opacity = 0.5 + moonPhase * 0.4;
  }

  /**
   * Create wireframe globe with continents and celestial bodies
   */
  private createWireframeGlobe(): void {
    if (!this.renderer) return;

    this.globeGroup = new THREE.Group();
    
    const earthGeometry = new THREE.SphereGeometry(10, 128, 64);
    const earthMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x1e3a5f,
      transparent: true, 
      opacity: 0.9 
    });
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    this.globeGroup.add(earthMesh);
    
    const atmosphereGeometry = new THREE.SphereGeometry(10.8, 32, 16);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x87ceeb,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    this.globeGroup.add(atmosphere);

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

    this.addEnhancedLandmasses();
    this.addGridLines();

    const moonGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const moonMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xcccccc,
      transparent: true,
      opacity: 0.8
    });
    this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    this.globeGroup.add(this.moonMesh);

    const locationGeometry = new THREE.ConeGeometry(0.3, 1, 8);
    const locationMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.userLocationMesh = new THREE.Mesh(locationGeometry, locationMaterial);
    this.globeGroup.add(this.userLocationMesh);

    this.globeGroup.position.set(0, -5, -20);
    this.scene.add(this.globeGroup);
  }

  /**
   * Add grid lines to globe
   */
  private addGridLines(): void {
    if (!this.globeGroup) return;

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

  /**
   * Add enhanced landmasses to globe
   */
  private addEnhancedLandmasses(): void {
    if (!this.globeGroup) return;

    const landmassData = [
      { name: 'North America', points: [
        { lat: 70, lon: -100 }, { lat: 60, lon: -140 }, { lat: 35, lon: -120 }, 
        { lat: 25, lon: -100 }, { lat: 30, lon: -85 }, { lat: 45, lon: -75 }, 
        { lat: 60, lon: -65 }, { lat: 70, lon: -100 }
      ]},
      { name: 'South America', points: [
        { lat: 10, lon: -70 }, { lat: -20, lon: -70 }, { lat: -35, lon: -60 }, 
        { lat: -55, lon: -70 }, { lat: -30, lon: -40 }, { lat: 5, lon: -50 }, 
        { lat: 10, lon: -70 }
      ]},
      { name: 'Europe', points: [
        { lat: 70, lon: 20 }, { lat: 60, lon: -10 }, { lat: 35, lon: 0 }, 
        { lat: 35, lon: 40 }, { lat: 60, lon: 60 }, { lat: 70, lon: 20 }
      ]},
      { name: 'Africa', points: [
        { lat: 35, lon: 0 }, { lat: 35, lon: 50 }, { lat: -35, lon: 40 }, 
        { lat: -35, lon: 15 }, { lat: 35, lon: 0 }
      ]},
      { name: 'Asia', points: [
        { lat: 70, lon: 60 }, { lat: 70, lon: 140 }, { lat: 20, lon: 140 }, 
        { lat: 20, lon: 60 }, { lat: 70, lon: 60 }
      ]},
      { name: 'Australia', points: [
        { lat: -10, lon: 115 }, { lat: -35, lon: 115 }, { lat: -35, lon: 150 }, 
        { lat: -10, lon: 150 }, { lat: -10, lon: 115 }
      ]},
    ];

    landmassData.forEach(landmass => {
      const points = [];
      
      for (const coord of landmass.points) {
        const pos = latLonToGlobePosition(coord.lat, coord.lon, 10.08);
        points.push(pos);
      }
      
      if (points.length > 2) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
          color: 0x44ff55, 
          transparent: true, 
          opacity: 0.9,
          linewidth: 4
        });
        const landmassLine = new THREE.Line(geometry, material);
        this.globeGroup!.add(landmassLine);
        
        points.forEach((point, index) => {
          if (index % 3 === 0) {
            const dotGeometry = new THREE.SphereGeometry(0.1, 8, 8);
            const dotMaterial = new THREE.MeshBasicMaterial({
              color: 0x66ff77,
              transparent: true,
              opacity: 0.8
            });
            const dot = new THREE.Mesh(dotGeometry, dotMaterial);
            dot.position.copy(point);
            this.globeGroup!.add(dot);
          }
        });
      }
    });
  }

  /**
   * Update celestial positions on the globe
   */
  updateCelestialPositions(celestialData: CelestialData, userLat: number, userLon: number): void {
    if (!this.globeGroup || !this.moonMesh || !this.userLocationMesh) return;

    if (this.sunMesh) {
      const sunDistance = 25;
      const displayElevation = Math.max(celestialData.sun.el, -30);
      const sunPos = celestialToGlobePosition(
        celestialData.sun.az, 
        displayElevation, 
        sunDistance
      );
      this.sunMesh.position.copy(sunPos);
      this.sunMesh.visible = true;
      
      const sunMass = celestialData.sun.mass || 1.0;
      this.sunMesh.scale.setScalar(sunMass * 0.8 + 0.2);
      
      const sunMaterial = this.sunMesh.material as THREE.MeshBasicMaterial;
      if (celestialData.sun.el < -0.833) {
        sunMaterial.opacity = 0.4;
        sunMaterial.transparent = true;
      } else {
        sunMaterial.opacity = 1.0;
        sunMaterial.transparent = false;
      }
    }

    if (this.moonMesh) {
      const moonDistance = 20;
      const displayElevation = Math.max(celestialData.moon.el, -25);
      const moonPos = celestialToGlobePosition(
        celestialData.moon.az,
        displayElevation,
        moonDistance
      );
      this.moonMesh.position.copy(moonPos);
      this.moonMesh.visible = true;
      
      const moonMass = celestialData.moon.mass || 1.0;
      this.moonMesh.scale.setScalar(moonMass * 0.6 + 0.3);
      
      const moonMaterial = this.moonMesh.material as THREE.MeshBasicMaterial;
      let brightness = Math.max(0.3, celestialData.moon.illumination);
      
      if (celestialData.moon.el < -0.833) {
        brightness *= 0.5;
        moonMaterial.transparent = true;
        moonMaterial.opacity = 0.6;
      } else {
        moonMaterial.transparent = celestialData.moon.illumination < 0.1;
        moonMaterial.opacity = 1.0;
      }
      
      moonMaterial.color.setRGB(brightness, brightness, brightness);
    }

    const userPos = latLonToGlobePosition(userLat, userLon, 10.5);
    this.userLocationMesh.position.copy(userPos);
    
    this.userLocationMesh.lookAt(
      userPos.x * 2,
      userPos.y * 2, 
      userPos.z * 2
    );
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

  getRenderer(): THREE.WebGLRenderer | null {
    return this.renderer;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getGlobeGroup(): THREE.Group | null {
    return this.globeGroup;
  }

  dispose() {
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
