const SensorAgent = {
  /**
   * Gets the user's current location using the browser's Geolocation API.
   * @returns {Promise<GeolocationPosition>} A promise that resolves with the position object or rejects with an error.
   */
  getLocation: function() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject);
    });
  },

  /**
   * STUB: Gets the device's orientation.
   * @returns {Promise<object>} A promise that resolves with placeholder orientation data.
   */
  getOrientation: function() {
    console.warn('STUB: SensorAgent.getOrientation() called.');
    return Promise.resolve({
      alpha: 0, // Z axis rotation (compass heading)
      beta: 90, // X axis rotation (front-to-back tilt)
      gamma: 0  // Y axis rotation (side-to-side tilt)
    });
  },

  /**
   * STUB: Gets the device's heading.
   * @returns {Promise<number>} A promise that resolves with a placeholder heading.
   */
  getHeading: function() {
    console.warn('STUB: SensorAgent.getHeading() called.');
    return Promise.resolve(0); // North
  }
};

export { SensorAgent };
