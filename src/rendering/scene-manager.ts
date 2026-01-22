/**
 * Scene Manager - Handles Three.js scene setup, camera, and globe creation
 */

import * as THREE from 'three';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer | null = null;
  public sunMesh: THREE.Mesh | null = null;
  public moonMesh: THREE.Mesh | null = null;
  public globeGroup: THREE.Group | null = null;
  public userLocationMesh: THREE.Mesh | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        powerPreference: 'low-power'
      });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setClearColor(0x87ceeb, 1);

      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      this.renderer.setPixelRatio(pixelRatio);
    } catch (error) {
      console.warn('WebGL not available', error);
      this.renderer = null;
    }

    if (this.renderer) {
      this.setupScene();
    }

    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);
  }

  private setupScene(): void {
    if (!this.renderer) return;

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);

    // Add directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 5);
    this.scene.add(directionalLight);

    // Create sun mesh
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
  }

  public handleResize(): void {
    if (!this.renderer) return;

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(pixelRatio);
  }

  public createWireframeGlobe(): void {
    if (this.globeGroup) {
      this.scene.remove(this.globeGroup);
    }

    this.globeGroup = new THREE.Group();
    const globeRadius = 10;

    // Create main globe sphere
    const sphereGeometry = new THREE.SphereGeometry(globeRadius, 64, 64);
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      wireframe: true,
      transparent: true,
      opacity: 0.15
    });
    const globeMesh = new THREE.Mesh(sphereGeometry, wireframeMaterial);
    this.globeGroup.add(globeMesh);

    // Add grid lines
    this.addGridLines(globeRadius);

    // Add landmasses
    this.addEnhancedLandmasses(globeRadius);

    this.scene.add(this.globeGroup);
  }

  private addGridLines(globeRadius: number): void {
    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.3
    });

    // Latitude lines
    for (let lat = -75; lat <= 75; lat += 15) {
      const points: THREE.Vector3[] = [];
      for (let lon = 0; lon <= 360; lon += 5) {
        const pos = this.latLonToGlobePosition(lat, lon, globeRadius);
        points.push(pos);
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, gridMaterial);
      this.globeGroup?.add(line);
    }

    // Longitude lines
    for (let lon = 0; lon < 180; lon += 15) {
      const points: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 5) {
        const pos = this.latLonToGlobePosition(lat, lon, globeRadius);
        points.push(pos);
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, gridMaterial);
      this.globeGroup?.add(line);
    }
  }

  private addEnhancedLandmasses(globeRadius: number): void {
    const landMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.4
    });

    // Simplified continent outlines
    const continents = [
      // North America
      { lat: 45, lon: -100, size: 0.8 },
      { lat: 50, lon: -95, size: 0.6 },
      { lat: 40, lon: -75, size: 0.4 },
      // South America
      { lat: -10, lon: -60, size: 0.6 },
      { lat: -20, lon: -55, size: 0.5 },
      // Europe
      { lat: 50, lon: 10, size: 0.5 },
      { lat: 55, lon: 25, size: 0.4 },
      // Africa
      { lat: 0, lon: 20, size: 0.7 },
      { lat: -20, lon: 25, size: 0.6 },
      // Asia
      { lat: 35, lon: 100, size: 0.9 },
      { lat: 50, lon: 80, size: 0.7 },
      { lat: 20, lon: 80, size: 0.6 },
      // Australia
      { lat: -25, lon: 135, size: 0.5 }
    ];

    continents.forEach(({ lat, lon, size }) => {
      const position = this.latLonToGlobePosition(lat, lon, globeRadius + 0.1);
      const geometry = new THREE.SphereGeometry(size, 8, 8);
      const mesh = new THREE.Mesh(geometry, landMaterial);
      mesh.position.copy(position);
      this.globeGroup?.add(mesh);
    });
  }

  public latLonToGlobePosition(
    lat: number,
    lon: number,
    radius: number = 10
  ): THREE.Vector3 {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    return new THREE.Vector3(x, y, z);
  }

  public updateCelestialPositions(
    sunAz: number,
    sunEl: number,
    moonAz: number,
    moonEl: number,
    userLat: number,
    userLon: number
  ): void {
    if (!this.globeGroup) return;

    // Update sun position on globe
    if (this.sunMesh) {
      const sunPos = this.celestialToGlobePosition(sunAz, sunEl, 15);
      this.sunMesh.position.copy(sunPos);
    }

    // Update moon position
    if (!this.moonMesh && this.globeGroup) {
      const moonGeometry = new THREE.SphereGeometry(0.08, 32, 32);
      const moonMaterial = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        fog: false
      });
      this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
      this.scene.add(this.moonMesh);
    }

    if (this.moonMesh) {
      const moonPos = this.celestialToGlobePosition(moonAz, moonEl, 15);
      this.moonMesh.position.copy(moonPos);
    }

    // Update user location marker
    if (!this.userLocationMesh && this.globeGroup) {
      const markerGeometry = new THREE.SphereGeometry(0.15, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        fog: false
      });
      this.userLocationMesh = new THREE.Mesh(markerGeometry, markerMaterial);
      this.scene.add(this.userLocationMesh);
    }

    if (this.userLocationMesh) {
      const userPos = this.latLonToGlobePosition(userLat, userLon, 10.2);
      this.userLocationMesh.position.copy(userPos);
    }
  }

  private celestialToGlobePosition(
    azimuth: number,
    elevation: number,
    distance: number
  ): THREE.Vector3 {
    const azRad = ((azimuth - 180) * Math.PI) / 180;
    const elRad = (elevation * Math.PI) / 180;

    const x = distance * Math.cos(elRad) * Math.sin(azRad);
    const y = distance * Math.sin(elRad);
    const z = -distance * Math.cos(elRad) * Math.cos(azRad);

    return new THREE.Vector3(x, y, z);
  }

  public dispose(): void {
    if (this.renderer) {
      this.renderer.dispose();
    }
    // Clean up geometries and materials
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (object.material instanceof THREE.Material) {
          object.material.dispose();
        }
      }
    });
  }
}
