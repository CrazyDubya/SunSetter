const RendererAgent = {
  container: null,

  init: function(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`RendererAgent: Container with id "${containerId}" not found.`);
    }
    console.log('Renderer Initialized.');
  },

  clear: function() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  },

  /**
   * Draws a simple 2D representation of the sun's path.
   * @param {Array<object>} sunTrack - Array of sun position objects.
   * @param {object} sunTimes - Object with sunrise and sunset times.
   */
  drawSunPath2D: function(sunTrack, sunTimes) {
    if (!this.container) return;
    this.clear();

    const pathBar = document.createElement('div');
    pathBar.style.width = '100%';
    pathBar.style.height = '50px';
    pathBar.style.backgroundColor = '#222';
    pathBar.style.position = 'relative';
    pathBar.style.border = '1px solid #555';
    pathBar.style.borderRadius = '5px';

    // Add sunrise/sunset markers
    const addMarker = (time, label, color) => {
        const totalMinutes = 24 * 60;
        const eventMinutes = time.getHours() * 60 + time.getMinutes();
        const leftPercent = (eventMinutes / totalMinutes) * 100;

        const marker = document.createElement('div');
        marker.style.position = 'absolute';
        marker.style.left = `${leftPercent}%`;
        marker.style.top = '0';
        marker.style.bottom = '0';
        marker.style.width = '2px';
        marker.style.backgroundColor = color;
        marker.title = `${label}: ${time.toLocaleTimeString()}`;
        pathBar.appendChild(marker);
    };

    addMarker(sunTimes.sunrise, 'Sunrise', 'yellow');
    addMarker(sunTimes.sunset, 'Sunset', 'orange');

    // Add current time marker
    addMarker(new Date(), 'Now', 'red');

    this.container.appendChild(pathBar);
  }
};

export { RendererAgent };
