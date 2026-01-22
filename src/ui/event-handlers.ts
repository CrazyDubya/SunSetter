/**
 * Event Handlers Module
 * Contains all button and UI event handler functions for user interactions
 * Provides clean separation between UI events and application logic
 */

import type { OrchestratorAgent } from '../orchestrator.js';
import { showSuccessMessage, updateStatus, formatDateTime, updateMoonInfo } from './status-display.js';
import { requestCameraWithUI, showCameraHelp } from './permission-manager.js';

/**
 * Handles location button click event
 * Requests location permission and updates UI based on result
 * @param orchestrator - The orchestrator agent instance
 * @param locationBtn - The location button element to update
 */
export async function handleLocationButton(
  orchestrator: OrchestratorAgent,
  locationBtn: HTMLButtonElement
): Promise<void> {
  locationBtn.disabled = true;
  locationBtn.textContent = 'Getting Location...';
  
  const success = await orchestrator.requestLocation();
  
  locationBtn.disabled = false;
  locationBtn.textContent = success ? 'Update Location' : 'Retry Location';
}

/**
 * Handles camera permission button click event
 * Shows platform-specific permission UI and handles the permission request
 * @param orchestrator - The orchestrator agent instance
 * @param cameraBtn - The camera button element to update
 */
export async function handleCameraButton(
  orchestrator: OrchestratorAgent,
  cameraBtn: HTMLButtonElement
): Promise<void> {
  cameraBtn.disabled = true;
  cameraBtn.textContent = 'Requesting Camera...';
  
  try {
    const hasPermission = await requestCameraWithUI(async () => {
      return await orchestrator['sensor'].requestCameraPermission();
    });
    
    if (hasPermission) {
      cameraBtn.style.display = 'none';
      updateStatus('Camera permission granted - AR mode available');
      showSuccessMessage('Camera access granted! You can now use AR mode.');
    } else {
      cameraBtn.textContent = 'Camera Denied - Try Settings';
      cameraBtn.disabled = false;
      showCameraHelp();
    }
  } catch (error) {
    console.error('Camera permission request failed:', error);
    cameraBtn.textContent = 'Camera Error - Need Help?';
    cameraBtn.disabled = false;
    showCameraHelp();
  }
}

/**
 * Handles toggle view button click event
 * Switches between 2D compass view and AR camera overlay
 * @param orchestrator - The orchestrator agent instance
 * @param toggleBtn - The toggle button element to update
 * @param switchCameraBtn - The switch camera button to show/hide
 */
export async function handleToggleView(
  orchestrator: OrchestratorAgent,
  toggleBtn: HTMLButtonElement,
  switchCameraBtn: HTMLButtonElement
): Promise<void> {
  toggleBtn.disabled = true;
  toggleBtn.textContent = 'Switching...';
  const mode = await orchestrator.toggleRenderMode();
  toggleBtn.textContent = `Switch to ${mode === '2D' ? 'AR' : '2D'}`;
  toggleBtn.disabled = false;
  
  switchCameraBtn.style.display = mode === 'AR' ? 'inline-block' : 'none';
}

/**
 * Handles switch camera button click event
 * Switches between front and rear cameras in AR mode
 * @param orchestrator - The orchestrator agent instance
 * @param switchCameraBtn - The switch camera button element to update
 */
export async function handleSwitchCamera(
  orchestrator: OrchestratorAgent,
  switchCameraBtn: HTMLButtonElement
): Promise<void> {
  switchCameraBtn.disabled = true;
  switchCameraBtn.textContent = '📷 Switching...';
  
  const success = await orchestrator.switchCamera();
  
  if (success) {
    showSuccessMessage('Camera switched successfully!');
  } else {
    showSuccessMessage('Camera switch failed - try again');
  }
  
  switchCameraBtn.textContent = '📷 Switch Camera';
  switchCameraBtn.disabled = false;
}

/**
 * Handles force refresh button click event
 * Clears all caches and reloads the application
 * @param refreshBtn - The refresh button element to update
 * @param clearCachesFn - Function that clears application caches
 */
export async function handleRefreshButton(
  refreshBtn: HTMLButtonElement,
  clearCachesFn: () => Promise<void>
): Promise<void> {
  refreshBtn.disabled = true;
  refreshBtn.textContent = '🔄 Clearing...';
  
  try {
    await clearCachesFn();
    showSuccessMessage('All caches cleared! Refreshing...');
    
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (error) {
    console.error('Failed to clear caches:', error);
    refreshBtn.textContent = '🔄 Force Refresh';
    refreshBtn.disabled = false;
  }
}

/**
 * Sets up time navigation controls
 * Configures event listeners for time travel features (jump to sunrise/sunset, pick time)
 * @param orchestrator - The orchestrator agent instance
 * @param ephemeris - The ephemeris agent for celestial calculations
 */
export function setupTimeNavigation(
  orchestrator: OrchestratorAgent,
  ephemeris: any
): void {
  const timeNavBtn = document.getElementById('timeNavBtn') as HTMLButtonElement;
  const timeControls = document.getElementById('timeControls') as HTMLDivElement;
  const closeTimeBtn = document.getElementById('closeTimeBtn') as HTMLButtonElement;
  const dateTimePicker = document.getElementById('dateTimePicker') as HTMLInputElement;
  const nextSunriseBtn = document.getElementById('nextSunriseBtn') as HTMLButtonElement;
  const nextSunsetBtn = document.getElementById('nextSunsetBtn') as HTMLButtonElement;
  const nowBtn = document.getElementById('nowBtn') as HTMLButtonElement;
  const moonElement = document.getElementById('moonText') as HTMLSpanElement;

  if (!timeNavBtn || !timeControls || !closeTimeBtn || !dateTimePicker || 
      !nextSunriseBtn || !nextSunsetBtn || !nowBtn || !moonElement) {
    console.warn('Time navigation elements not found');
    return;
  }

  // Toggle time navigation panel
  timeNavBtn.addEventListener('click', () => {
    const isVisible = timeControls.style.display !== 'none';
    timeControls.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
      const now = new Date();
      const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      dateTimePicker.value = localDateTime;
    }
  });

  // Close time navigation panel
  closeTimeBtn.addEventListener('click', () => {
    timeControls.style.display = 'none';
  });

  // Date/time picker change
  dateTimePicker.addEventListener('change', () => {
    const selectedTime = new Date(dateTimePicker.value).getTime();
    if (!isNaN(selectedTime)) {
      orchestrator.setTime(selectedTime);
      updateTimeInfo(orchestrator, ephemeris, selectedTime);
    }
  });

  // Next sunrise button
  nextSunriseBtn.addEventListener('click', () => {
    const result = orchestrator.jumpToNextSunrise();
    if (result) {
      updateTimeInfo(orchestrator, ephemeris, result.time);
      showSuccessMessage(`Next sunrise: ${formatDateTime(result.time)} at ${Math.round(result.azimuth)}° azimuth`);
      
      const date = new Date(result.time);
      const localDateTime = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      dateTimePicker.value = localDateTime;
    } else {
      showSuccessMessage('Could not find next sunrise');
    }
  });

  // Next sunset button
  nextSunsetBtn.addEventListener('click', () => {
    const result = orchestrator.jumpToNextSunset();
    if (result) {
      updateTimeInfo(orchestrator, ephemeris, result.time);
      showSuccessMessage(`Next sunset: ${formatDateTime(result.time)} at ${Math.round(result.azimuth)}° azimuth`);
      
      const date = new Date(result.time);
      const localDateTime = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      dateTimePicker.value = localDateTime;
    } else {
      showSuccessMessage('Could not find next sunset');
    }
  });

  // Return to now button
  nowBtn.addEventListener('click', () => {
    orchestrator.returnToNow();
    updateTimeInfo(orchestrator, ephemeris, Date.now());
    showSuccessMessage('Returned to current time');
    
    const now = new Date();
    const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    dateTimePicker.value = localDateTime;
  });

  // Update moon display every second when time controls are visible
  const updateMoonDisplay = () => {
    if (timeControls.style.display !== 'none') {
      const location = orchestrator.getCurrentLocation();
      if (location) {
        const timestamp = orchestrator.getCurrentTimestamp();
        updateMoonInfo(ephemeris, location, timestamp);
      }
    }
  };
  
  setInterval(updateMoonDisplay, 1000);
}

/**
 * Updates time-related information in the UI
 */
function updateTimeInfo(
  orchestrator: OrchestratorAgent,
  ephemeris: any,
  timestamp: number
): void {
  const location = orchestrator.getCurrentLocation();
  if (location) {
    updateMoonInfo(ephemeris, location, timestamp);
  }
}
