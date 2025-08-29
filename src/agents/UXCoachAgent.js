const UXCoachAgent = {
  overlay: null,

  /**
   * Shows a message overlay.
   * @param {string} message - The HTML message to display.
   */
  showPermissionRequest: function(message) {
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.style.position = 'fixed';
      this.overlay.style.top = '0';
      this.overlay.style.left = '0';
      this.overlay.style.width = '100%';
      this.overlay.style.height = '100%';
      this.overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      this.overlay.style.color = 'white';
      this.overlay.style.display = 'flex';
      this.overlay.style.justifyContent = 'center';
      this.overlay.style.alignItems = 'center';
      this.overlay.style.textAlign = 'center';
      this.overlay.style.zIndex = '1000';
      this.overlay.style.padding = '20px';
      document.body.appendChild(this.overlay);
    }
    this.overlay.innerHTML = message;
    this.overlay.style.display = 'flex';
  },

  /**
   * Hides the message overlay.
   */
  hide: function() {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
  }
};

export { UXCoachAgent };
