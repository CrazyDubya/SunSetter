/**
 * Sensor Agent - Acquires real-time device data with fallbacks
 */

export interface LocationData {
  lat: number;
  lon: number;
  alt?: number;
  accuracy: number;
  timestamp: number;
}

export interface OrientationData {
  alpha: number;  // compass heading (0-360)
  beta: number;   // front-to-back tilt (-180 to 180)
  gamma: number;  // left-to-right tilt (-90 to 90)
  absolute: boolean;
}

export class SensorError extends Error {
  constructor(message: string, public type: 'permission' | 'timeout' | 'unavailable') {
    super(message);
    this.name = 'SensorError';
  }
}

export class SensorAgent {
  private locationCache: LocationData | null = null;
  private orientationCache: OrientationData | null = null;

  /**
   * Get current location with timeout
   */
  async getLocation(timeoutMs: number = 5000): Promise<LocationData> {
    return new Promise((resolve, reject) => {
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        reject(new SensorError('Geolocation not supported', 'unavailable'));
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new SensorError('Location request timed out', 'timeout'));
      }, timeoutMs);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          const locationData: LocationData = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            alt: position.coords.altitude ?? undefined,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          };
          this.locationCache = locationData;
          resolve(locationData);
        },
        (error) => {
          clearTimeout(timeoutId);
          let errorType: 'permission' | 'timeout' | 'unavailable' = 'unavailable';
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorType = 'permission';
              break;
            case error.TIMEOUT:
              errorType = 'timeout';
              break;
            default:
              errorType = 'unavailable';
          }
          
          reject(new SensorError(error.message, errorType));
        },
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 60000 // 1 minute cache
        }
      );
    });
  }

  /**
   * Get device orientation (compass heading)
   */
  async getOrientation(): Promise<OrientationData> {
    return new Promise((resolve, reject) => {
      // Check if DeviceOrientationEvent is supported
      if (!window.DeviceOrientationEvent) {
        reject(new SensorError('Device orientation not supported', 'unavailable'));
        return;
      }

      // For iOS 13+ we need to request permission
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        (DeviceOrientationEvent as any).requestPermission()
          .then((response: string) => {
            if (response === 'granted') {
              this.setupOrientationListener(resolve, reject);
            } else {
              reject(new SensorError('Device orientation permission denied', 'permission'));
            }
          })
          .catch(() => {
            reject(new SensorError('Failed to request orientation permission', 'permission'));
          });
      } else {
        this.setupOrientationListener(resolve, reject);
      }
    });
  }

  private setupOrientationListener(resolve: (data: OrientationData) => void, reject: (error: SensorError) => void) {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        reject(new SensorError('Orientation data timeout', 'timeout'));
      }
    }, 5000);

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (resolved) return;
      
      window.removeEventListener('deviceorientation', handleOrientation);
      clearTimeout(timeout);
      resolved = true;

      const orientationData: OrientationData = {
        alpha: event.alpha ?? 0,
        beta: event.beta ?? 0,
        gamma: event.gamma ?? 0,
        absolute: event.absolute ?? false
      };
      
      this.orientationCache = orientationData;
      resolve(orientationData);
    };

    window.addEventListener('deviceorientation', handleOrientation);
  }

  /**
   * Get compass heading with fallback sources
   */
  async getHeading(sourcePriority: ('true' | 'mag' | 'manual')[] = ['true', 'mag', 'manual']): Promise<number> {
    for (const source of sourcePriority) {
      try {
        switch (source) {
          case 'true':
            // Try to get absolute compass heading
            const orientationTrue = await this.getOrientation();
            if (orientationTrue.absolute && orientationTrue.alpha !== null) {
              return orientationTrue.alpha;
            }
            break;
          case 'mag':
            // Fallback to magnetic compass (if available)
            const orientationMag = await this.getOrientation();
            if (orientationMag.alpha !== null) {
              return orientationMag.alpha;
            }
            break;
          case 'manual':
            // Manual heading input - would need UI component
            return 0; // Default to North for now
        }
      } catch (error) {
        console.warn(`Failed to get heading from ${source}:`, error);
      }
    }
    
    throw new SensorError('No heading source available', 'unavailable');
  }

  /**
   * Request permission for sensors
   */
  async requestPermission(type: 'geolocation' | 'orientation'): Promise<boolean> {
    try {
      switch (type) {
        case 'geolocation':
          await this.getLocation(1000);
          return true;
        case 'orientation':
          await this.getOrientation();
          return true;
        default:
          return false;
      }
    } catch (error) {
      if (error instanceof SensorError && error.type === 'permission') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get cached location data
   */
  getCachedLocation(): LocationData | null {
    return this.locationCache;
  }

  /**
   * Get cached orientation data
   */
  getCachedOrientation(): OrientationData | null {
    return this.orientationCache;
  }
}