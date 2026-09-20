(() => {
  const media = matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try {
    const value = JSON.parse(localStorage.getItem('champions:theme'));
    if (['system', 'light', 'dark'].includes(value)) preference = value;
  } catch {}
  function apply() {
    const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#10191e' : '#f5f8f8');
  }
  apply();
  media.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    const control = document.getElementById('theme');
    control.value = preference;
    control.addEventListener('change', () => {
      preference = control.value;
      try {
        localStorage.setItem('champions:theme', JSON.stringify(preference));
      } catch {}
      apply();
    });
  });
})();
