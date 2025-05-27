function init() {
  const tooltip = document.getElementById('tooltip');
  const positionTooltip = (event) => {
      const verticalSpacePx = 15;
      const marginPx = 5;
      // Determine x coordinate for the tooltip. Don't let it go out of screen on the left.
      let x = Math.max(event.pageX - (tooltip.offsetWidth / 2), marginPx);
      // Also don't let it go out of screen on the right.
      x -= Math.max(0, x + tooltip.offsetWidth - document.documentElement.clientWidth + marginPx);
      tooltip.style.left = `${x}px`;
      // Determine y coordinate.
      let y = event.pageY - tooltip.offsetHeight - verticalSpacePx;
      // It the tooltip goes out of screen on the top, place it beneath the cursor instead.
      if (y < marginPx) {
        y = event.pageY + verticalSpacePx;
      }
      tooltip.style.top = `${y}px`;
  };
  document.querySelectorAll('[data-tooltip]').forEach(element => {
    element.addEventListener('mouseenter', (event) => {
      const text = event.currentTarget.getAttribute('data-tooltip');
      if (!text) {
        return;
      }
      tooltip.innerText = text;
      tooltip.classList.remove('hidden');
      positionTooltip(event);
    });
    element.addEventListener('mousemove', positionTooltip);
    element.addEventListener('mouseleave', (event) => {
      tooltip.classList.add('hidden');
      // Place in the corner to render the tooltip as wide as necessary next time.
      tooltip.style.top = '0px';
      tooltip.style.left = '0px';
    });
  });
}

export default {
  init,
};
