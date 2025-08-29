# SunSetter - AR Sun Overlay Web App

A device-agnostic web application that provides an AR-style overlay of the sun's position, 24-hour path, and sunrise/sunset markers aligned to the user's real-world skyline via browser webcam.

## Features

- **Device-agnostic**: Works on iOS/Android/desktop browsers without native apps
- **Privacy-first**: No location/camera data leaves your device
- **Offline-capable**: Core sun calculations work without internet
- **Real-time sun tracking**: Shows current sun position and daily path
- **2D compass view**: Fallback visualization when AR is not available
- **Automatic fallbacks**: Graceful degradation when sensors are unavailable

## Quick Start

### Development

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

## Usage

1. **Get Location**: Click "Get Location" to allow the app to access your GPS coordinates
2. **View Sun Path**: The app will display the sun's current position and 24-hour path
3. **Toggle Views**: Switch between 2D compass view and AR mode (when available)

## Architecture

The app follows an agentic architecture with specialized agents:

- **Orchestrator Agent**: Coordinates the overall application flow
- **Ephemeris Agent**: Computes sun positions using astronomical algorithms
- **Sensor Agent**: Manages device sensors (GPS, orientation, compass)
- **Rendering Agent**: Handles 2D and AR visualization

## Technical Stack

- **TypeScript** for type safety and better development experience
- **Vite** for fast development and optimized builds
- **Three.js** for 3D graphics and WebGL rendering
- **Web APIs** for geolocation, device orientation, and camera access
- **Browser APIs only** - no server-side dependencies for core functionality

## Browser Support

- Chrome/Edge 90+
- Safari 15+ (iOS 15+)
- Firefox 90+
- Mobile browsers with WebGL support

## Privacy & Security

- All core computations happen locally on your device
- Location data never leaves your device without explicit consent
- No tracking or analytics by default
- Works offline for core sun position calculations

## Accuracy

- Sun position accuracy: ≤0.5° error above 5° elevation
- Near horizon accuracy: ≤2° (atmospheric refraction limits)
- Based on established astronomical algorithms (NOAA Solar Position Algorithm)

## Development Roadmap

This implementation covers **Phase 0: Foundations** from the original specification:

- ✅ Basic project setup with Vite + TypeScript
- ✅ Ephemeris calculations for sun position  
- ✅ Geolocation sensor integration
- ✅ 2D compass-style rendering
- ✅ Permission handling and graceful fallbacks

Future phases will add:
- AR camera overlay with device orientation
- Enhanced calibration and accuracy
- Terrain occlusion data
- Seasonal sun path visualization
- PWA capabilities

## Contributing

This project implements the comprehensive Sun Overlay AR Web App specification. See the problem statement for the complete multi-phase development plan.

## License

ISC
