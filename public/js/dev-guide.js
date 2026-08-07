(function initDevGuide() {
  if (!window.TheBox?.devGuideEnabled) {
    return;
  }

  const shell = document.createElement('div');
  shell.className = 'dev-guide-shell';

  const guide = document.createElement('div');
  guide.className = 'dev-guide';
  guide.setAttribute('aria-hidden', 'true');

  shell.appendChild(guide);
  document.body.prepend(shell);
})();
