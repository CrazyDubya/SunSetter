/**
 * Rendering Utilities - Helper functions for coordinate transformations and rendering
 */

import * as THREE from 'three';
import { SunSample } from '../ephemeris.js';

/**
 * Convert azimuth/elevation to 3D position
 */
export function azElTo3D(
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

/**
 * Get AR distance based on elevation
 */
export function getARDistance(elevation: number): number {
  if (elevation < 0) return 100;
  if (elevation < 10) return 80;
  if (elevation < 30) return 60;
  if (elevation < 60) return 40;
  return 25;
}

/**
 * Convert azimuth/elevation to canvas coordinates
 */
export function azElToCanvas(
  azimuth: number,
  elevation: number,
  centerX: number,
  centerY: number,
  radius: number
): { x: number; y: number } {
  const normalizedEl = Math.max(0, Math.min(90, elevation));
  const distance = radius * (1 - normalizedEl / 90);
  const angle = ((azimuth - 90) * Math.PI) / 180;

  return {
    x: centerX + distance * Math.cos(angle),
    y: centerY + distance * Math.sin(angle)
  };
}

/**
 * Find closest sun sample to a given timestamp
 */
export function findClosestSample(
  samples: SunSample[],
  timestamp: number
): SunSample | null {
  if (!samples || samples.length === 0) return null;

  let closest = samples[0];
  let minDiff = Math.abs(samples[0].t - timestamp);

  for (const sample of samples) {
    const diff = Math.abs(sample.t - timestamp);
    if (diff < minDiff) {
      minDiff = diff;
      closest = sample;
    }
  }

  return closest;
}

/**
 * Create a sun glow effect
 */
export function createSunGlow(
  position: THREE.Vector3,
  elevation: number
): THREE.PointLight {
  const glowIntensity = elevation > 0 ? 2.0 : 0.5;
  const glow = new THREE.PointLight(0xffaa00, glowIntensity, 50);
  glow.position.copy(position);
  return glow;
}

/**
 * Create horizon line for AR mode
 */
export function createHorizonLine(heading: number): THREE.Line {
  const points: THREE.Vector3[] = [];
  const radius = 100;
  
  for (let angle = 0; angle <= 360; angle += 10) {
    const azimuth = angle - heading;
    const pos = azElTo3D(azimuth, 0, radius);
    points.push(pos);
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0x4488ff,
    opacity: 0.5,
    transparent: true
  });

  return new THREE.Line(geometry, material);
}

/**
 * Create cardinal direction markers
 */
export function createCardinalDirections(
  heading: number,
  scene: THREE.Scene
): THREE.Group[] {
  const directions = [
    { label: 'N', angle: 0, color: 0xff0000 },
    { label: 'E', angle: 90, color: 0x00ff00 },
    { label: 'S', angle: 180, color: 0x0000ff },
    { label: 'W', angle: 270, color: 0xffff00 }
  ];

  const groups: THREE.Group[] = [];

  directions.forEach(dir => {
    const group = new THREE.Group();
    const azimuth = dir.angle - heading;
    const position = azElTo3D(azimuth, 0, 80);

    const geometry = new THREE.SphereGeometry(1, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: dir.color });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    
    group.add(marker);
    scene.add(group);
    groups.push(group);
  });

  return groups;
}
