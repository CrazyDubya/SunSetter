/**
 * Permission Manager Module
 * Handles camera permission requests and related UI flows
 */

/**
 * Checks if the current device is an iOS device
 */
export function isIOSDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * Shows detailed camera setup instructions for iOS users
 */
export function showIOSCameraInstructions(): void {
  const instructions = document.createElement('div');
  instructions.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center;">
      <div style="background: white; padding: 20px; border-radius: 10px; max-width: 90%; text-align: center; color: black;">
        <h3>📱 iOS Camera Setup</h3>
        <p><strong>When prompted:</strong></p>
        <p>1. Tap <strong>"Allow"</strong> when Safari asks for camera permission</p>
        <p>2. If no prompt appears, tap the address bar and look for the camera icon</p>
        <p>3. Or go to Settings > Safari > Camera > Allow</p>
        <button onclick="this.parentElement.parentElement.remove()" style="padding: 10px 20px; font-size: 16px; background: #007AFF; color: white; border: none; border-radius: 5px; margin-top: 10px;">Got it!</button>
      </div>
    </div>
  `;
  document.body.appendChild(instructions);
}

/**
 * Shows help dialog for camera access issues
 */
export function showCameraHelp(): void {
  const help = document.createElement('div');
  const isIOS = isIOSDevice();
  help.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center;">
      <div style="background: white; padding: 20px; border-radius: 10px; max-width: 90%; text-align: left; color: black;">
        <h3>📷 Camera Access Help</h3>
        ${isIOS ? `
          <p><strong>For iOS Safari:</strong></p>
          <p>• Tap the address bar, look for camera icon 📷</p>
          <p>• Or: Settings > Safari > Camera > Allow</p>
          <p>• Or: Settings > Privacy & Security > Camera > Safari</p>
        ` : `
          <p><strong>For Chrome/Android:</strong></p>
          <p>• Tap the lock/info icon in address bar</p>
          <p>• Enable camera permission</p>
          <p>• Reload the page</p>
        `}
        <p><strong>Still not working?</strong></p>
        <p>• Try refreshing the page</p>
        <p>• Make sure you're using HTTPS</p>
        <p>• Check your device camera settings</p>
        <button onclick="this.parentElement.parentElement.remove()" style="padding: 10px 20px; font-size: 16px; background: #007AFF; color: white; border: none; border-radius: 5px; margin-top: 15px;">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(help);
}

/**
 * Requests camera permission with appropriate UI based on platform
 * @param requestPermissionFn - Function that requests camera permission
 * @returns Promise that resolves to true if permission granted, false otherwise
 */
export async function requestCameraWithUI(
  requestPermissionFn: () => Promise<boolean>
): Promise<boolean> {
  try {
    if (isIOSDevice()) {
      showIOSCameraInstructions();
    }
    
    const hasPermission = await requestPermissionFn();
    return hasPermission;
  } catch (error) {
    console.error('Camera permission request failed:', error);
    return false;
  }
}
