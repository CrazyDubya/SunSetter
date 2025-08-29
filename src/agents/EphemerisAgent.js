const EphemerisAgent = {
  /**
   * Computes the sun's track for a given location and date.
   * @param {number} lat - Latitude.
   * @param {number} lon - Longitude.
   * @param {Date} date - The date for the calculation.
   * @returns {Array<{azimuth: number, altitude: number}>} An array of sun positions.
   */
  computeTrack: function(lat, lon, date = new Date()) {
    const track = [];
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    for (let i = 0; i <= 24 * 4; i++) { // Calculate for every 15 minutes
      const time = new Date(startOfDay.getTime() + i * 15 * 60 * 1000);
      const pos = window.SunCalc.getPosition(time, lat, lon);
      track.push({
        azimuth: pos.azimuth * 180 / Math.PI + 180, // Convert to degrees, 0 = North
        altitude: pos.altitude * 180 / Math.PI,   // Convert to degrees
        time: time
      });
    }
    return track;
  },

  /**
   * Computes sunrise and sunset times.
   * @param {number} lat - Latitude.
   * @param {number} lon - Longitude.
   * @param {Date} date - The date for the calculation.
   * @returns {object} An object with sunrise and sunset times.
   */
  getSunTimes: function(lat, lon, date = new Date()) {
    return window.SunCalc.getTimes(date, lat, lon);
  }
};

export { EphemerisAgent };
