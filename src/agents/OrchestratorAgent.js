import { EphemerisAgent } from './EphemerisAgent.js';
import { SensorAgent } from './SensorAgent.js';
import { UXCoachAgent } from './UXCoachAgent.js';
import { RendererAgent } from './RendererAgent.js';

const OrchestratorAgent = {
  state: 'IDLE', // IDLE, REQUESTING, FAILED, SUCCESS

  init: function() {
    const getLocationBtn = document.getElementById('getLocationBtn');
    getLocationBtn.addEventListener('click', () => this.start());
    RendererAgent.init('2d-view-container');
    console.log('Orchestrator Initialized.');
  },

  setState: function(newState) {
    this.state = newState;
    console.log(`State changed to: ${this.state}`);
  },

  start: async function() {
    if (this.state === 'REQUESTING') return;

    this.setState('REQUESTING');
    UXCoachAgent.showPermissionRequest('Requesting location permission to calculate sun data...');

    try {
      const position = await SensorAgent.getLocation();
      const { latitude, longitude } = position.coords;
      UXCoachAgent.showPermissionRequest('Location acquired. Calculating sun data...');

      const sunTrack = EphemerisAgent.computeTrack(latitude, longitude);
      const sunTimes = EphemerisAgent.getSunTimes(latitude, longitude);

      UXCoachAgent.hide();
      RendererAgent.drawSunPath2D(sunTrack, sunTimes);
      this.setState('SUCCESS');

    } catch (error) {
      console.error('Orchestrator failed:', error);
      UXCoachAgent.showPermissionRequest(`Error: ${error.message}<br><br>Please grant location permission and try again.`);
      this.setState('FAILED');
    }
  }
};

export { OrchestratorAgent };
