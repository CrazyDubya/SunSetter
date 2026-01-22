/**
 * Render State - State management and coordinate conversion utilities
 */

import * as THREE from 'three';
import { SunSample } from '../ephemeris.js';

/**
 * Find the sample closest to a given timestamp
 */
export function findClosestSample(samples: SunSample[], timestamp: number): SunSample | null {
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
export function azElTo3D(azimuth: number, elevation: number, distance: number): THREE.Vector3 {
  const azRad = (azimuth * Math.PI) / 180;
  const elRad = (elevation * Math.PI) / 180;
  
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
export function getARDistance(elevation: number): number {
  const minDistance = 8;
  const maxDistance = 20;
  
  const normalizedElevation = Math.max(0, (elevation + 10) / 90);
  return minDistance + (maxDistance - minDistance) * (1 - normalizedElevation);
}

/**
 * Convert azimuth/elevation to canvas 2D coordinates
 */
export function azElToCanvas(azimuth: number, elevation: number, centerX: number, centerY: number, radius: number): { x: number; y: number } {
  const elevationFactor = Math.max(0, (90 - elevation) / 90);
  const projectedRadius = radius * elevationFactor;
  
  const azRad = (azimuth * Math.PI) / 180;
  const x = centerX + projectedRadius * Math.sin(azRad);
  const y = centerY - projectedRadius * Math.cos(azRad);
  
  return { x, y };
}

/**
 * Convert latitude/longitude to 3D globe position
 */
export function latLonToGlobePosition(lat: number, lon: number, radius: number = 10): THREE.Vector3 {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  
  const x = radius * Math.cos(latRad) * Math.cos(lonRad);
  const y = radius * Math.sin(latRad);
  const z = -radius * Math.cos(latRad) * Math.sin(lonRad);
  
  return new THREE.Vector3(x, y, z);
}

/**
 * Convert celestial coordinates to 3D position around globe
 */
export function celestialToGlobePosition(azimuth: number, elevation: number, distance: number): THREE.Vector3 {
  const azRad = (azimuth * Math.PI) / 180;
  const elRad = (elevation * Math.PI) / 180;
  
  const x = distance * Math.cos(elRad) * Math.sin(azRad);
  const y = distance * Math.sin(elRad);
  const z = -distance * Math.cos(elRad) * Math.cos(azRad);
  
  return new THREE.Vector3(x, y - 5, z - 20);
}
