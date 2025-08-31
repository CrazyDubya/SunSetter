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
  
  // AR optimization tracking
  private lastARHeading: number = -999;
  private lastARSamples: SunSample[] = [];
  private arObjectsCreated: boolean = false;

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

    // Create sun mesh with bright glow
    const sunGeometry = new THREE.SphereGeometry(0.1, 32, 32);
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

    // Set up high-DPI display support
    if (this.renderer) {
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      this.renderer.setPixelRatio(pixelRatio);
    }

    let lastTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;
    let forceUpdate = false;

    const animate = (currentTime: number) => {
      this.animationId = requestAnimationFrame(animate);

      // Frame limiting for consistent performance, but allow forced updates
      const deltaTime = currentTime - lastTime;
      if (deltaTime < frameInterval && !forceUpdate) {
        return;
      }
      lastTime = currentTime - (deltaTime % frameInterval);
      forceUpdate = false;

      // Update both modes with smooth animations
      if (this.mode === 'AR') {
        this.renderAR(this.latestSamples, this.latestHeading);
        this.updatePulsingAnimations();
      } else {
        // Continuously animate 2D globe
        this.updateGlobeAnimation(currentTime);
        this.updateCelestialAnimations(currentTime);
      }

      if (this.renderer) {
        this.renderer.render(this.scene, this.camera);
      }
    };

    animate(0);
  }

  public updateData(samples: SunSample[], heading: number) {
      this.latestSamples = samples;
      this.latestHeading = heading;
      
      // Force immediate update if in AR mode for responsive tracking
      if (this.mode === 'AR') {
        this.renderAR(samples, heading);
        if (this.renderer) {
          this.renderer.render(this.scene, this.camera);
        }
      }
  }

  /**
   * Update globe rotation and animations for 2D mode
   */
  private updateGlobeAnimation(time: number) {
    if (!this.globeGroup) return;
    
    // Gentle continuous rotation to show it's live
    const rotationSpeed = 0.0002;
    this.globeGroup.rotation.y += rotationSpeed;
    
    // Slight bob animation for visual interest
    const bobAmount = 0.1;
    const bobSpeed = 0.001;
    this.globeGroup.position.y = -5 + Math.sin(time * bobSpeed) * bobAmount;
  }

  /**
   * Update celestial body animations for 2D mode
   */
  private updateCelestialAnimations(time: number) {
    if (!this.sunMesh || !this.moonMesh) return;
    
    // Add subtle color pulsing to sun
    const sunMaterial = this.sunMesh.material as THREE.MeshBasicMaterial;
    const glowIntensity = 0.8 + Math.sin(time * 0.003) * 0.2;
    const brightness = Math.floor(255 * glowIntensity);
    sunMaterial.color.setHex((brightness << 16) | (brightness << 8) | 0x00);
    
    // Add phase-based brightness variation to moon
    const moonMaterial = this.moonMesh.material as THREE.MeshBasicMaterial;
    const moonPhase = Math.sin(time * 0.001) * 0.5 + 0.5; // Simulate moon phase
    moonMaterial.opacity = 0.5 + moonPhase * 0.4;
  }

  /**
   * Update pulsing animations for markers
   */
  private updatePulsingAnimations() {
    const time = Date.now() * 0.002; // Slow pulsing
    
    this.scene.traverse((child) => {
      if (child.userData.isPulsing) {
        const baseScale = child.userData.baseScale || 1.0;
        const pulseAmount = Math.sin(time) * 0.3 + 1.0; // Pulse between 0.7 and 1.3
        child.scale.setScalar(baseScale * pulseAmount);
      }
    });
  }

  /**
   * Render in AR mode (camera overlay) - optimized version
   */
  renderAR(samples: SunSample[], heading: number) {
    if (!this.renderer || !this.sunMesh) return;

    // More responsive AR updates - lower threshold for heading changes
    const headingChanged = Math.abs(heading - this.lastARHeading) > 0.5; // 0.5 degree threshold for smoother tracking
    const samplesChanged = samples.length !== this.lastARSamples.length || 
                          !this.arObjectsCreated;

    if (headingChanged || samplesChanged) {
      // Clear previous path and markers only when needed
      if (this.pathLine) {
        this.scene.remove(this.pathLine);
      }
      
      // Clean up old time markers and sun path objects
      const markersToRemove = this.scene.children.filter(child => 
        child.userData.isTimeMarker || 
        child.userData.isSunPath || 
        child.userData.isSunriseMarker || 
        child.userData.isSunsetMarker
      );
      markersToRemove.forEach(marker => this.scene.remove(marker));

      // Create clean, optimized sun path
      this.createOptimizedSunPath(samples, heading);
      
      // Add only essential markers (sunrise/sunset)
      this.addEssentialMarkers(samples, heading);

      // Update tracking variables
      this.lastARHeading = heading;
      this.lastARSamples = [...samples];
      this.arObjectsCreated = true;
    }

    // Always update current sun position (this should move with device)
    this.updateCurrentSunInAR(samples, heading);

    // Ensure proper rendering with camera background
    if (this.videoTexture && this.videoElement) {
      this.videoTexture.needsUpdate = true;
    }
  }

  /**
   * Update only the current sun position in AR mode (called every frame)
   */
  private updateCurrentSunInAR(samples: SunSample[], heading: number) {
    const now = Date.now();
    const currentSample = this.findClosestSample(samples, now);

    if (currentSample) {
      // Remove old current sun marker
      const oldMarkers = this.scene.children.filter(child => 
        child.userData.isCurrentSunMarker
      );
      oldMarkers.forEach(marker => this.scene.remove(marker));

      // Create clean current sun marker
      const distance = this.getARDistance(Math.max(currentSample.el, -5));
      const pos = this.azElTo3D(currentSample.az - heading, Math.max(currentSample.el, -5), distance);
      
      // Create bright, pulsing current sun marker
      const sunMarker = new THREE.Group();
      
      // Main sun sphere
      const sunGeometry = new THREE.SphereGeometry(0.8, 32, 32);
      const sunMaterial = new THREE.MeshBasicMaterial({
        color: currentSample.el > 0 ? 0xffff00 : 0xff6600,
        transparent: true,
        opacity: 0.9
      });
      
      const sun = new THREE.Mesh(sunGeometry, sunMaterial);
      sunMarker.add(sun);
      
      // Add corona glow
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
      if (sample.el > -15) { // Show path from well below horizon to above
        const distance = this.getARDistance(sample.el);
        const pos = this.azElTo3D(sample.az - heading, sample.el, distance);
        pathPoints.push(pos);
        
        // Color based on elevation
        let r, g, b;
        if (sample.el > 0) {
          // Above horizon - yellow to white gradient
          const factor = Math.min(sample.el / 30, 1);
          r = 1; g = 1; b = 0.3 + 0.7 * factor;
        } else {
          // Below horizon - orange to red gradient
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

    // Find sunrise and sunset
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

    // Add clean sunrise marker
    if (sunriseIndex !== -1) {
      const sample = samples[sunriseIndex];
      const distance = this.getARDistance(sample.el);
      const pos = this.azElTo3D(sample.az - heading, sample.el, distance);
      const marker = this.createCleanARMarker(pos, '🌅', 0xff6600, 1.2);
      marker.userData.isSunriseMarker = true;
      this.scene.add(marker);
    }

    // Add clean sunset marker
    if (sunsetIndex !== -1) {
      const sample = samples[sunsetIndex];
      const distance = this.getARDistance(sample.el);
      const pos = this.azElTo3D(sample.az - heading, sample.el, distance);
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
    
    // Simple bright sphere for the marker
    const geometry = new THREE.SphereGeometry(size * 0.3, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8
    });
    
    const sphere = new THREE.Mesh(geometry, material);
    group.add(sphere);
    
    // Remove problematic ring - it appears as weird box in AR
    
    group.position.copy(position);
    return group;
  }

  /**
   * Add time markers along the sun path for AR mode (deprecated - using simplified markers)
   */
  // @ts-ignore
  private _addTimeMarkers(samples: SunSample[], heading: number) {
    // Add markers every hour for major times only (to avoid clutter)
    const hourlyMarkers = [8, 10, 12, 14, 16, 18]; // Key times for photography
    
    hourlyMarkers.forEach(hour => {
      // Find sample closest to this hour
      const targetTime = new Date();
      targetTime.setHours(hour, 0, 0, 0);
      const targetTimestamp = targetTime.getTime();
      
      let closestSample = samples[0];
      let minDiff = Math.abs(samples[0].t - targetTimestamp);
      
      samples.forEach(sample => {
        const diff = Math.abs(sample.t - targetTimestamp);
        if (diff < minDiff) {
          minDiff = diff;
          closestSample = sample;
        }
      });
      
      // Only show marker if sun is above horizon or close to it
      if (closestSample.el > -5) {
        const markerPos = this.azElTo3D(closestSample.az - heading, Math.max(closestSample.el, -2), 4.9);
        
        // Create time marker with hour label
        const marker = this.createARTimeMarker(markerPos, new Date(closestSample.t), 0xffffff, false);
        marker.userData.isTimeMarker = true;
        this.scene.add(marker);
      }
    });
  }

  /**
   * Create complete sun path for AR mode (deprecated - using optimized version)
   */
  // @ts-ignore
  private _createCompleteSunPath(samples: SunSample[], heading: number) {
    // Separate points by elevation and create gradient effect
    const allPoints: Array<{pos: THREE.Vector3, el: number, t: number}> = [];
    
    samples.forEach(sample => {
      const pos = this.azElTo3D(sample.az - heading, Math.max(sample.el, -15), 4.8);
      allPoints.push({pos, el: sample.el, t: sample.t});
    });

    // Create gradient sun path using multiple segments
    for (let i = 0; i < allPoints.length - 1; i++) {
      const current = allPoints[i];
      const next = allPoints[i + 1];
      
      // Create individual line segment with color based on elevation and time
      const segmentGeometry = new THREE.BufferGeometry().setFromPoints([current.pos, next.pos]);
      
      // Calculate color based on sun elevation and time of day
      let color, opacity, linewidth;
      
      if (current.el > 30) {
        // High sun - bright white/yellow
        color = 0xffffff;
        opacity = 1.0;
        linewidth = 6;
      } else if (current.el > 10) {
        // Medium sun - yellow/orange
        color = 0xffd700;
        opacity = 0.95;
        linewidth = 5;
      } else if (current.el > -0.833) {
        // Low sun - orange/red (golden hour)
        color = 0xff6600;
        opacity = 0.9;
        linewidth = 4;
      } else if (current.el > -6) {
        // Civil twilight - red/purple
        color = 0xff3366;
        opacity = 0.6;
        linewidth = 3;
      } else if (current.el > -12) {
        // Nautical twilight - purple/blue
        color = 0x6633ff;
        opacity = 0.4;
        linewidth = 2;
      } else {
        // Night - dark blue
        color = 0x0033ff;
        opacity = 0.25;
        linewidth = 1;
      }
      
      const segmentMaterial = new THREE.LineBasicMaterial({
        color: color,
        opacity: opacity,
        transparent: true,
        linewidth: linewidth
      });
      
      const segment = new THREE.Line(segmentGeometry, segmentMaterial);
      segment.userData.isSunPath = true;
      this.scene.add(segment);
    }

    // Add horizon line for reference
    this.createHorizonLine(heading);
    
    // Add cardinal direction markers
    this.createCardinalDirections(heading);
  }

  /**
   * Add sunrise and sunset markers (deprecated - using essential markers)
   */
  // @ts-ignore
  private _addSunriseSunsetMarkers(samples: SunSample[], heading: number) {
    // Find sunrise and sunset samples (elevation crosses horizon)
    let sunriseIndex = -1;
    let sunsetIndex = -1;

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      
      // Sunrise: elevation goes from below to above -0.833 degrees
      if (prev.el < -0.833 && curr.el >= -0.833 && sunriseIndex === -1) {
        sunriseIndex = i;
      }
      
      // Sunset: elevation goes from above to below -0.833 degrees
      if (prev.el >= -0.833 && curr.el < -0.833 && sunriseIndex !== -1 && sunsetIndex === -1) {
        sunsetIndex = i;
      }
    }

    // Add sunrise marker
    if (sunriseIndex !== -1) {
      const sunrisePos = this.azElTo3D(samples[sunriseIndex].az - heading, samples[sunriseIndex].el, 4.9);
      const sunriseMarker = this.createARTimeMarker(sunrisePos, new Date(samples[sunriseIndex].t), 0xff6600, false, '🌅');
      sunriseMarker.userData.isSunriseMarker = true;
      this.scene.add(sunriseMarker);
    }

    // Add sunset marker
    if (sunsetIndex !== -1) {
      const sunsetPos = this.azElTo3D(samples[sunsetIndex].az - heading, samples[sunsetIndex].el, 4.9);
      const sunsetMarker = this.createARTimeMarker(sunsetPos, new Date(samples[sunsetIndex].t), 0xff3300, false, '🌇');
      sunsetMarker.userData.isSunsetMarker = true;
      this.scene.add(sunsetMarker);
    }
  }

  /**
   * Create animated current sun marker (deprecated - using simplified version)
   */
  // @ts-ignore
  private _createAnimatedCurrentSun(currentSample: SunSample, heading: number, now: number) {
    if (!this.sunMesh) return;
    
    const displayElevation = Math.max(currentSample.el, -5);
    const sunPos = this.azElTo3D(currentSample.az - heading, displayElevation, 5);
    
    // Update main sun mesh position and styling
    this.sunMesh.position.copy(sunPos);
    this.sunMesh.visible = true;
    
    const sunMaterial = this.sunMesh.material as THREE.MeshBasicMaterial;
    
    // Enhanced sun styling based on elevation
    if (currentSample.el > 30) {
      // High sun - brilliant white with yellow tint
      sunMaterial.color.setHex(0xffffcc);
      sunMaterial.transparent = false;
      sunMaterial.opacity = 1.0;
      this.sunMesh.scale.setScalar(1.5); // Larger when high
    } else if (currentSample.el > 10) {
      // Medium sun - bright yellow
      sunMaterial.color.setHex(0xffff00);
      sunMaterial.transparent = false;
      sunMaterial.opacity = 1.0;
      this.sunMesh.scale.setScalar(1.3);
    } else if (currentSample.el > -0.833) {
      // Low sun - golden orange
      sunMaterial.color.setHex(0xff9900);
      sunMaterial.transparent = false;
      sunMaterial.opacity = 1.0;
      this.sunMesh.scale.setScalar(1.4); // Larger at horizon for visual impact
    } else {
      // Below horizon - dimmed red
      sunMaterial.color.setHex(0xff3300);
      sunMaterial.transparent = true;
      sunMaterial.opacity = 0.7;
      this.sunMesh.scale.setScalar(1.0);
    }

    // Create glow effect around current sun
    this.createSunGlow(sunPos, currentSample.el);
    
    // Add current time marker with enhanced styling
    const currentMarker = this.createEnhancedARTimeMarker(sunPos, new Date(now), 0xff0000, true, '☀️');
    currentMarker.userData.isCurrentSunMarker = true;
    this.scene.add(currentMarker);
  }

  /**
   * Create glowing halo effect around the current sun
   */
  private createSunGlow(position: THREE.Vector3, elevation: number) {
    // Create multiple glow rings for better effect
    const glowIntensity = Math.max(0.3, (elevation + 10) / 50); // Stronger glow when higher
    
    for (let i = 0; i < 3; i++) {
      const size = 0.3 + (i * 0.2);
      const opacity = (0.4 - i * 0.1) * glowIntensity;
      
      const glowGeometry = new THREE.SphereGeometry(size, 16, 16);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: elevation > -0.833 ? 0xffff00 : 0xff6600,
        transparent: true,
        opacity: opacity,
        side: THREE.BackSide // Only render backface for glow effect
      });
      
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.position.copy(position);
      glow.userData.isCurrentSunMarker = true;
      this.scene.add(glow);
    }
  }

  /**
   * Create horizon line for AR reference
   */
  private createHorizonLine(heading: number) {
    const horizonPoints: THREE.Vector3[] = [];
    
    // Create horizon line spanning 360 degrees
    for (let az = 0; az < 360; az += 5) {
      const pos = this.azElTo3D(az - heading, 0, 6); // At horizon (0 elevation)
      horizonPoints.push(pos);
    }
    
    if (horizonPoints.length > 1) {
      const horizonGeometry = new THREE.BufferGeometry().setFromPoints(horizonPoints);
      const horizonMaterial = new THREE.LineBasicMaterial({
        color: 0x66ccff,
        opacity: 0.5,
        transparent: true,
        linewidth: 1
      });
      
      const horizonLine = new THREE.Line(horizonGeometry, horizonMaterial);
      horizonLine.userData.isSunPath = true; // For cleanup
      this.scene.add(horizonLine);
    }
  }

  /**
   * Create cardinal direction markers (N, E, S, W)
   */
  private createCardinalDirections(heading: number) {
    const directions = [
      { name: 'N', azimuth: 0, color: 0x00ff00 },
      { name: 'E', azimuth: 90, color: 0xffff00 },
      { name: 'S', azimuth: 180, color: 0xff0000 },
      { name: 'W', azimuth: 270, color: 0x00ffff }
    ];
    
    directions.forEach(dir => {
      const pos = this.azElTo3D(dir.azimuth - heading, 10, 7); // Slightly above horizon
      const marker = this.createEnhancedARTimeMarker(pos, new Date(), dir.color, false, dir.name);
      marker.userData.isSunPath = true; // For cleanup
      this.scene.add(marker);
    });
  }

  /**
   * Enhanced AR time marker with better text and effects
   */
  private createEnhancedARTimeMarker(position: THREE.Vector3, time: Date, color: number, isCurrentTime: boolean = false, emoji?: string): THREE.Group {
    const markerGroup = new THREE.Group();
    
    // Create marker sphere with enhanced materials
    const sphereGeometry = new THREE.SphereGeometry(isCurrentTime ? 0.12 : 0.08, 20, 20);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: isCurrentTime ? 1.0 : 0.9
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    markerGroup.add(sphere);

    // Add pulsing effect for current time marker
    if (isCurrentTime) {
      // Store animation data for pulsing effect
      sphere.userData.isPulsing = true;
      sphere.userData.baseScale = 1.0;
      sphere.userData.pulseSpeed = 0.05;
    }

    // Create enhanced text label with better rendering
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 512;
    canvas.height = 128;
    
    // Clear canvas with rounded background
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add border glow effect
    context.strokeStyle = `rgb(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255})`;
    context.lineWidth = 3;
    context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    
    // Add text with better styling
    context.fillStyle = '#ffffff';
    context.font = isCurrentTime ? 'bold 32px Arial' : 'bold 24px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(0, 0, 0, 0.8)';
    context.shadowBlur = 4;
    context.shadowOffsetX = 2;
    context.shadowOffsetY = 2;
    
    let displayText;
    if (emoji && (emoji === 'N' || emoji === 'E' || emoji === 'S' || emoji === 'W')) {
      // Cardinal direction
      displayText = emoji;
    } else {
      // Time display
      const timeText = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      displayText = emoji ? `${emoji} ${timeText}` : timeText;
    }
    
    context.fillText(displayText, canvas.width / 2, canvas.height / 2);
    
    // Create texture and sprite with better scaling
    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    
    const labelMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      alphaTest: 0.1
    });
    
    const label = new THREE.Sprite(labelMaterial);
    label.scale.set(isCurrentTime ? 2.0 : 1.5, isCurrentTime ? 0.5 : 0.375, 1);
    label.position.set(0, isCurrentTime ? 0.3 : 0.25, 0);
    markerGroup.add(label);
    
    markerGroup.position.copy(position);
    return markerGroup;
  }

  /**
   * Create AR time marker with optional emoji (legacy method - redirects to enhanced)
   */
  private createARTimeMarker(position: THREE.Vector3, time: Date, color: number, isCurrentTime: boolean = false, emoji?: string): THREE.Group {
    return this.createEnhancedARTimeMarker(position, time, color, isCurrentTime, emoji);
  }

  /**
   * Toggle between 2D and AR modes
   */
  get currentMode(): '2D' | 'AR' {
    return this.mode;
  }

  toggleMode(stream?: MediaStream): '2D' | 'AR' {
    this.mode = this.mode === '2D' ? 'AR' : '2D';
    
    // Reset AR tracking when switching modes
    this.lastARHeading = -999;
    this.lastARSamples = [];
    this.arObjectsCreated = false;

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

  /**
   * Convert azimuth/elevation to 3D coordinates for AR mode
   * Uses proper spherical to cartesian conversion with AR-appropriate scaling
   */
  private azElTo3D(azimuth: number, elevation: number, distance: number): THREE.Vector3 {
    // Convert to radians
    const azRad = (azimuth * Math.PI) / 180;
    const elRad = (elevation * Math.PI) / 180;
    
    // Use standard spherical coordinate system
    // In AR, we want objects at the horizon to appear at screen edges
    const r = distance;
    const x = r * Math.cos(elRad) * Math.sin(azRad);
    const y = r * Math.sin(elRad);
    const z = -r * Math.cos(elRad) * Math.cos(azRad);
    
    return new THREE.Vector3(x, y, z);
  }

  /**
   * Calculate appropriate distance for AR overlay based on elevation
   * Objects near horizon should appear further to maintain proper perspective
   */
  private getARDistance(elevation: number): number {
    // Scale distance based on elevation for better AR perspective
    const minDistance = 8;   // Close objects for high elevations
    const maxDistance = 20;  // Far objects for horizon
    
    // Objects at horizon appear further away
    const normalizedElevation = Math.max(0, (elevation + 10) / 90); // -10° to 80° range
    return minDistance + (maxDistance - minDistance) * (1 - normalizedElevation);
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
    
    // Create beautiful solid Earth sphere
    const earthGeometry = new THREE.SphereGeometry(10, 128, 64);
    const earthMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x1e3a5f, // Deep ocean blue
      transparent: true, 
      opacity: 0.9 
    });
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    this.globeGroup.add(earthMesh);
    
    // Add atmosphere glow
    const atmosphereGeometry = new THREE.SphereGeometry(10.8, 32, 16);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x87ceeb,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    this.globeGroup.add(atmosphere);

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

    // Add enhanced landmasses with better visibility
    this.addEnhancedLandmasses();

    // Add subtle grid lines
    this.addGridLines();

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

  private addGridLines(): void {
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

  private addEnhancedLandmasses(): void {
    if (!this.globeGroup) return;

    // Enhanced landmass shapes that show up well on solid globe
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
        const pos = this.latLonToGlobePosition(coord.lat, coord.lon, 10.08); // Slightly above surface
        points.push(pos);
      }
      
      if (points.length > 2) {
        // Create bright, visible landmass outlines
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
          color: 0x44ff55, 
          transparent: true, 
          opacity: 0.9,
          linewidth: 4
        });
        const landmassLine = new THREE.Line(geometry, material);
        this.globeGroup!.add(landmassLine);
        
        // Add small glowing dots at key points for better visibility
        points.forEach((point, index) => {
          if (index % 3 === 0) { // Every third point to avoid clutter
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