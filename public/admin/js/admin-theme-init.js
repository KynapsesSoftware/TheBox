(function applyStoredAdminTheme() {
  const stored = localStorage.getItem('thebox-admin-theme');
  const theme = stored === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-admin-theme', theme);
})();
