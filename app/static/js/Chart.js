(function () {
  if (window.Chart) return;
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
  script.async = true;
  document.head.appendChild(script);
})();
