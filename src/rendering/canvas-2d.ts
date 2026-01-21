/**
 * 2D Canvas Renderer - Handles fallback 2D compass visualization
 */

import { SunSample } from '../ephemeris.js';
import { azElToCanvas, findClosestSample } from './utils.js';

export class Canvas2DRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    if (this.ctx) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  }

  public render(samples: SunSample[], heading: number = 0): void {
    if (!this.ctx) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    // Clear and draw background
    this.drawBackground(centerX, centerY, radius);

    // Draw horizon circle
    this.drawHorizon(centerX, centerY, radius);

    // Draw elevation rings
    this.drawElevationRings(centerX, centerY, radius);

    // Draw cardinal directions
    this.drawCardinalDirections(centerX, centerY, radius, heading);

    // Draw sun path
    this.drawSunPath(samples, heading, centerX, centerY, radius);

    // Draw current sun position
    this.drawCurrentSun(samples, heading, centerX, centerY, radius);
  }

  private drawBackground(centerX: number, centerY: number, radius: number): void {
    if (!this.ctx) return;

    const gradient = this.ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, radius * 1.5
    );
    gradient.addColorStop(0, '#1e3c72');
    gradient.addColorStop(0.5, '#2a5298');
    gradient.addColorStop(1, '#0f1419');
    
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawHorizon(centerX: number, centerY: number, radius: number): void {
    if (!this.ctx) return;

    this.ctx.save();
    this.ctx.shadowColor = 'rgba(135, 206, 235, 0.5)';
    this.ctx.shadowBlur = 15;
    this.ctx.strokeStyle = '#87ceeb';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawElevationRings(centerX: number, centerY: number, radius: number): void {
    if (!this.ctx) return;

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.lineWidth = 1;
    
    for (let elev = 15; elev <= 75; elev += 15) {
      const ringRadius = radius * (1 - elev / 90);
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, ringRadius, 0, 2 * Math.PI);
      this.ctx.stroke();
    }
  }

  private drawCardinalDirections(
    centerX: number,
    centerY: number,
    radius: number,
    heading: number
  ): void {
    if (!this.ctx) return;

    const directions = [
      { label: 'N', angle: 0 },
      { label: 'E', angle: 90 },
      { label: 'S', angle: 180 },
      { label: 'W', angle: 270 }
    ];

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 20px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    directions.forEach(dir => {
      const adjustedAngle = dir.angle - heading;
      const pos = azElToCanvas(adjustedAngle, -5, centerX, centerY, radius);
      
      this.ctx!.save();
      this.ctx!.shadowColor = 'rgba(0, 0, 0, 0.8)';
      this.ctx!.shadowBlur = 4;
      this.ctx!.fillText(dir.label, pos.x, pos.y);
      this.ctx!.restore();
    });
  }

  private drawSunPath(
    samples: SunSample[],
    heading: number,
    centerX: number,
    centerY: number,
    radius: number
  ): void {
    if (!this.ctx || samples.length === 0) return;

    const pathGradient = this.ctx.createLinearGradient(
      0, centerY - radius,
      0, centerY + radius
    );
    pathGradient.addColorStop(0, 'rgba(255, 255, 0, 0.3)');
    pathGradient.addColorStop(0.5, 'rgba(255, 200, 0, 0.6)');
    pathGradient.addColorStop(1, 'rgba(255, 150, 0, 0.3)');

    this.ctx.strokeStyle = pathGradient;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();

    let first = true;
    samples.forEach(sample => {
      if (sample.el > -10) {
        const pos = azElToCanvas(
          sample.az - heading,
          sample.el,
          centerX,
          centerY,
          radius
        );
        
        if (first) {
          this.ctx!.moveTo(pos.x, pos.y);
          first = false;
        } else {
          this.ctx!.lineTo(pos.x, pos.y);
        }
      }
    });

    this.ctx.stroke();
  }

  private drawCurrentSun(
    samples: SunSample[],
    heading: number,
    centerX: number,
    centerY: number,
    radius: number
  ): void {
    if (!this.ctx) return;

    const now = Date.now();
    const currentSample = findClosestSample(samples, now);

    if (!currentSample || currentSample.el < -10) return;

    const pos = azElToCanvas(
      currentSample.az - heading,
      currentSample.el,
      centerX,
      centerY,
      radius
    );

    // Draw sun glow
    const sunGradient = this.ctx.createRadialGradient(
      pos.x, pos.y, 0,
      pos.x, pos.y, 20
    );
    sunGradient.addColorStop(0, 'rgba(255, 255, 0, 1)');
    sunGradient.addColorStop(0.5, 'rgba(255, 200, 0, 0.5)');
    sunGradient.addColorStop(1, 'rgba(255, 150, 0, 0)');

    this.ctx.fillStyle = sunGradient;
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI);
    this.ctx.fill();

    // Draw sun core
    this.ctx.fillStyle = '#ffff00';
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, 8, 0, 2 * Math.PI);
    this.ctx.fill();

    // Draw elevation text
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    this.ctx.shadowBlur = 3;
    this.ctx.fillText(
      `${Math.round(currentSample.el)}°`,
      pos.x,
      pos.y + 30
    );
  }

  public handleResize(): void {
    if (this.ctx) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  }
}
