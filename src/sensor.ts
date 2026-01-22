/**
 * Sensor Agent - Acquires real-time device data with fallbacks
 */

/**
 * Location data from the device's geolocation sensor
 */
export interface LocationData {
  /** Latitude in degrees (-90 to 90, negative=South, positive=North) */
  lat: number;
  /** Longitude in degrees (-180 to 180, negative=West, positive=East) */
  lon: number;
  /** Altitude above sea level in meters (optional) */
  alt?: number;
  /** Accuracy radius in meters */
  accuracy: number;
  /** Timestamp when location was obtained */
  timestamp: number;
}

/**
 * Device orientation data from the device's orientation sensors
 */
export interface OrientationData {
  /** Compass heading (0-360 degrees, 0=North, 90=East, 180=South, 270=West) */
  alpha: number;
  /** Front-to-back tilt (-180 to 180 degrees) */
  beta: number;
  /** Left-to-right tilt (-90 to 90 degrees) */
  gamma: number;
  /** Whether the orientation is absolute (true north) or relative */
  absolute: boolean;
}

/**
 * Custom error class for sensor-related failures
 * Provides typed error information for different sensor failure modes
 */
export class SensorError extends Error {
  /**
   * Creates a new sensor error
   * @param message - Human-readable error description
   * @param type - Type of sensor error (permission denied, timeout, or unavailable)
   */
  constructor(message: string, public type: 'permission' | 'timeout' | 'unavailable') {
    super(message);
    this.name = 'SensorError';
  }
}

/**
 * Sensor agent that acquires real-time device data with fallbacks
 * Handles location, orientation, and camera access across different devices and browsers
 * with mobile-specific optimizations and graceful error handling
 */
export class SensorAgent {
  private locationCache: LocationData | null = null;
  private orientationCache: OrientationData | null = null;

  /**
   * Get current location with enhanced mobile support
   * Attempts high-accuracy first, falls back to low-accuracy if needed
   * @param timeoutMs - Maximum time to wait for location in milliseconds (default: 15000)
   * @returns Promise resolving to location data
   * @throws {SensorError} If location cannot be obtained
   */
  async getLocation(timeoutMs: number = 15000): Promise<LocationData> {
    return new Promise((resolve, reject) => {
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        reject(new SensorError('Geolocation not supported on this device', 'unavailable'));
        return;
      }

      console.log('Requesting location with timeout:', timeoutMs);
      
      const timeoutId = setTimeout(() => {
        reject(new SensorError('Location request timed out - please try again or check location settings', 'timeout'));
      }, timeoutMs);

      // First try with high accuracy for mobile
      const highAccuracyOptions = {
        enableHighAccuracy: true,
        timeout: Math.min(timeoutMs - 1000, 10000), // Leave 1s buffer, max 10s
        maximumAge: 30000 // 30 seconds cache for mobile
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          console.log('Location obtained:', position.coords);
          
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
          console.warn('High accuracy location failed, trying low accuracy:', error);
          
          // Fallback to low accuracy for mobile Safari/Chrome issues
          const lowAccuracyOptions = {
            enableHighAccuracy: false,
            timeout: Math.max(timeoutMs - 5000, 5000),
            maximumAge: 60000 // 1 minute cache
          };
          
          navigator.geolocation.getCurrentPosition(
            (position) => {
              clearTimeout(timeoutId);
              console.log('Location obtained (low accuracy):', position.coords);
              
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
            (fallbackError) => {
              clearTimeout(timeoutId);
              console.error('All location attempts failed:', fallbackError);
              
              let errorType: 'permission' | 'timeout' | 'unavailable' = 'unavailable';
              let errorMessage = 'Location access failed';
              
              switch (fallbackError.code) {
                case fallbackError.PERMISSION_DENIED:
                  errorType = 'permission';
                  errorMessage = 'Location permission denied. Please enable location access in your browser settings and try again.';
                  break;
                case fallbackError.TIMEOUT:
                  errorType = 'timeout';
                  errorMessage = 'Location request timed out. Please try again with a stable connection.';
                  break;
                case fallbackError.POSITION_UNAVAILABLE:
                  errorType = 'unavailable';
                  errorMessage = 'Location unavailable. Please check your device location settings.';
                  break;
                default:
                  errorMessage = `Location error: ${fallbackError.message}`;
              }
              
              reject(new SensorError(errorMessage, errorType));
            },
            lowAccuracyOptions
          );
        },
        highAccuracyOptions
      );
    });
  }

  /**
   * Get device orientation (compass heading)
   * Handles iOS 13+ permission requirements automatically
   * @returns Promise resolving to orientation data
   * @throws {SensorError} If orientation cannot be obtained
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
   * Tries multiple methods in order: absolute orientation, magnetic compass, manual fallback
   * @param sourcePriority - Array of sources to try in order (default: ['true', 'mag', 'manual'])
   * @returns Promise resolving to heading in degrees (0-360, 0=North)
   * @throws {SensorError} If no heading source is available
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
   * Start video stream for AR with enhanced iOS support and camera switching
   * Attempts to access device camera with optimal settings, falling back to basic constraints
   * @param constraints - Media stream constraints (default: rear camera)
   * @returns Promise resolving to MediaStream for the camera feed
   * @throws {SensorError} If camera cannot be accessed
   */
  async startVideoStream(constraints: MediaStreamConstraints = { video: { facingMode: 'environment' }, audio: false }): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new SensorError('Camera API not supported', 'unavailable');
    }

    try {
      // Enhanced constraints for iOS compatibility
      const enhancedConstraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          ...constraints.video as MediaTrackConstraints
        },
        audio: false
      };

      // First attempt with enhanced constraints
      try {
        const stream = await navigator.mediaDevices.getUserMedia(enhancedConstraints);
        console.log('Camera stream started with enhanced constraints');
        return stream;
      } catch (enhancedError) {
        console.warn('Enhanced constraints failed, falling back to basic constraints:', enhancedError);
        
        // Fallback to basic constraints for older devices
        const basicConstraints: MediaStreamConstraints = {
          video: { facingMode: 'environment' },
          audio: false
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(basicConstraints);
        console.log('Camera stream started with basic constraints');
        return stream;
      }
    } catch (error) {
      console.error('Camera access failed:', error);
      
      if (error instanceof DOMException) {
        switch (error.name) {
          case 'NotAllowedError':
          case 'PermissionDeniedError':
            throw new SensorError('Camera permission denied. Please allow camera access in your browser settings.', 'permission');
          case 'NotFoundError':
          case 'DevicesNotFoundError':
            throw new SensorError('No camera found on this device', 'unavailable');
          case 'NotReadableError':
          case 'TrackStartError':
            throw new SensorError('Camera is already in use by another application', 'unavailable');
          case 'OverconstrainedError':
          case 'ConstraintNotSatisfiedError':
            throw new SensorError('Camera does not meet the required specifications', 'unavailable');
          case 'SecurityError':
            throw new SensorError('Camera access blocked by security policy. Please use HTTPS.', 'permission');
          case 'AbortError':
            throw new SensorError('Camera access request was cancelled', 'unavailable');
          default:
            throw new SensorError(`Camera error: ${error.message}`, 'unavailable');
        }
      } else {
        throw new SensorError('Could not access camera', 'unavailable');
      }
    }
  }

  /**
   * Request camera permissions explicitly for iOS
   * Triggers the permission dialog without keeping the stream active
   * @returns Promise resolving to true if permission granted, false otherwise
   */
  async requestCameraPermission(): Promise<boolean> {
    try {
      // Check if camera is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('Camera API not supported');
        return false;
      }

      // For iOS, we need to request permission through getUserMedia
      // This will trigger the permission dialog
      const testStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      
      // Stop the test stream immediately - we just wanted the permission
      testStream.getTracks().forEach(track => track.stop());
      
      console.log('Camera permission granted');
      return true;
    } catch (error) {
      console.error('Camera permission request failed:', error);
      return false;
    }
  }

  /**
   * Request permission for sensors
   * Generic method to request any sensor permission
   * @param type - Type of sensor to request ('geolocation', 'orientation', or 'camera')
   * @returns Promise resolving to true if permission granted, false if denied
   * @throws {SensorError} If permission request fails for reasons other than denial
   */
  async requestPermission(type: 'geolocation' | 'orientation' | 'camera'): Promise<boolean> {
    try {
      switch (type) {
        case 'geolocation':
          await this.getLocation(1000);
          return true;
        case 'orientation':
          await this.getOrientation();
          return true;
        case 'camera':
          return await this.requestCameraPermission();
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
   * Returns the most recently obtained location without requesting a new one
   * @returns Cached location data or null if none available
   */
  getCachedLocation(): LocationData | null {
    return this.locationCache;
  }

  /**
   * Get cached orientation data
   * Returns the most recently obtained orientation without requesting a new one
   * @returns Cached orientation data or null if none available
   */
  getCachedOrientation(): OrientationData | null {
    return this.orientationCache;
  }

  /**
   * Switch camera between front and back
   * Stops the current stream and starts a new one with the opposite camera
   * @param currentStream - The currently active MediaStream to switch from
   * @returns Promise resolving to new MediaStream with switched camera
   * @throws {SensorError} If camera switching fails
   */
  async switchCamera(currentStream: MediaStream): Promise<MediaStream> {
    // Stop current stream
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }

    // Determine current camera
    const videoTrack = currentStream.getVideoTracks()[0];
    const currentFacingMode = videoTrack ? videoTrack.getSettings().facingMode : 'environment';
    
    // Switch to opposite camera
    const newFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    
    console.log(`Switching camera from ${currentFacingMode} to ${newFacingMode}`);
    
    try {
      return await this.startVideoStream({
        video: { facingMode: newFacingMode },
        audio: false
      });
    } catch (error) {
      console.warn(`Failed to switch to ${newFacingMode} camera, trying exact constraint`);
      
      // Try with exact constraint if preferred fails
      try {
        return await this.startVideoStream({
          video: { facingMode: { exact: newFacingMode } },
          audio: false
        });
      } catch (exactError) {
        console.error('Failed to switch camera with exact constraint', exactError);
        // Fall back to original camera
        return await this.startVideoStream({
          video: { facingMode: currentFacingMode },
          audio: false
        });
      }
    }
  }

  /**
   * Get available camera devices
   * Enumerates all video input devices on the system
   * @returns Promise resolving to array of MediaDeviceInfo for cameras
   */
  async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
      console.error('Failed to enumerate camera devices:', error);
      return [];
    }
  }
}