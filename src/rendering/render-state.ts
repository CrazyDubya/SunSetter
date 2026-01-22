/**
 * Render State - State management and coordinate conversion utilities
 */

import * as THREE from 'three';
import { SunSample } from '../ephemeris.js';

/**
 * Find the sample closest to a given timestamp
 * Uses a linear search to find the sun sample with the smallest time difference
 * @param samples - Array of sun position samples to search
 * @param timestamp - Target timestamp in milliseconds
 * @returns The closest sample, or null if array is empty
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
 * @param azimuth - Horizontal angle in degrees (0=North, 90=East, 180=South, 270=West)
 * @param elevation - Vertical angle in degrees (0=horizon, 90=zenith, negative=below horizon)
 * @param distance - Distance from camera in arbitrary units (affects perspective)
 * @returns Three.js Vector3 with x, y, z coordinates in camera space
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
 * @param elevation - Vertical angle in degrees (0=horizon, 90=zenith, negative=below horizon)
 * @returns Distance value for AR rendering (closer to horizon = further distance)
 */
export function getARDistance(elevation: number): number {
  const minDistance = 8;
  const maxDistance = 20;
  
  const normalizedElevation = Math.max(0, (elevation + 10) / 90);
  return minDistance + (maxDistance - minDistance) * (1 - normalizedElevation);
}

/**
 * Convert azimuth/elevation to canvas 2D coordinates
 * Projects celestial coordinates onto a flat circular compass view
 * @param azimuth - Horizontal angle in degrees (0=North, 90=East, 180=South, 270=West)
 * @param elevation - Vertical angle in degrees (0=horizon, 90=zenith at center)
 * @param centerX - X coordinate of compass center on canvas
 * @param centerY - Y coordinate of compass center on canvas
 * @param radius - Radius of the compass circle in pixels
 * @returns Object with x, y pixel coordinates on canvas
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
 * Projects geographic coordinates onto a 3D sphere representing Earth
 * @param lat - Latitude in degrees (-90 to 90, negative=South, positive=North)
 * @param lon - Longitude in degrees (-180 to 180, negative=West, positive=East)
 * @param radius - Radius of the sphere (default: 10 units)
 * @returns Three.js Vector3 representing the position on the globe surface
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
 * Places sun/moon at appropriate positions relative to the globe visualization
 * @param azimuth - Horizontal angle in degrees (0=North, 90=East, 180=South, 270=West)
 * @param elevation - Vertical angle in degrees (0=horizon, 90=zenith, negative=below horizon)
 * @param distance - Distance from origin in arbitrary units
 * @returns Three.js Vector3 with adjusted position for globe rendering
 */
export function celestialToGlobePosition(azimuth: number, elevation: number, distance: number): THREE.Vector3 {
  const azRad = (azimuth * Math.PI) / 180;
  const elRad = (elevation * Math.PI) / 180;
  
  const x = distance * Math.cos(elRad) * Math.sin(azRad);
  const y = distance * Math.sin(elRad);
  const z = -distance * Math.cos(elRad) * Math.cos(azRad);
  
  return new THREE.Vector3(x, y - 5, z - 20);
}
