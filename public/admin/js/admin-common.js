window.TheBoxAdmin = {
  themeStorageKey: 'thebox-admin-theme',

  tools: [
    { href: '/admin/', label: 'Overview', pathMatch: /\/admin\/?$/ },
    {
      href: '/admin/settings.html',
      label: 'Settings',
      pathMatch: /settings\.html$/,
    },
    {
      href: '/admin/channels.html',
      label: 'Channels',
      pathMatch: /channels\.html$/,
    },
    {
      href: '/admin/schedule-inspector.html',
      label: 'Schedule inspector',
      pathMatch: /schedule-inspector\.html$/,
    },
    {
      href: '/admin/transcode-cache.html',
      label: 'Transcode cache',
      pathMatch: /transcode-cache\.html$/,
    },
  ],

  getTheme() {
    return document.documentElement.getAttribute('data-admin-theme') === 'light'
      ? 'light'
      : 'dark';
  },

  setTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-admin-theme', next);
    localStorage.setItem(this.themeStorageKey, next);
    this.updateThemeToggleLabel();
  },

  toggleTheme() {
    this.setTheme(this.getTheme() === 'light' ? 'dark' : 'light');
  },

  createThemeIcon(kind) {
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'admin-theme-toggle__svg');
    svg.setAttribute('aria-hidden', 'true');

    if (kind === 'moon') {
      const path = document.createElementNS(svgNs, 'path');
      path.setAttribute(
        'd',
        'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
      );
      svg.appendChild(path);
      return svg;
    }

    const circle = document.createElementNS(svgNs, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '4');

    const rays = document.createElementNS(svgNs, 'path');
    rays.setAttribute(
      'd',
      'M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m18 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41',
    );

    svg.appendChild(circle);
    svg.appendChild(rays);
    return svg;
  },

  updateThemeToggleLabel() {
    const button = document.getElementById('admin-theme-toggle');
    if (!button) {
      return;
    }

    const isLight = this.getTheme() === 'light';
    button.replaceChildren(this.createThemeIcon(isLight ? 'moon' : 'sun'));
    button.setAttribute('aria-pressed', isLight ? 'true' : 'false');
    button.setAttribute(
      'title',
      isLight ? 'Switch to dark theme' : 'Switch to light theme',
    );
    button.setAttribute(
      'aria-label',
      isLight ? 'Switch to dark theme' : 'Switch to light theme',
    );
  },

  ensureTopbarActions(topbar) {
    let actions = topbar.querySelector('.admin-topbar-actions');
    if (actions) {
      return actions;
    }

    actions = document.createElement('div');
    actions.className = 'admin-topbar-actions';

    const h1 = topbar.querySelector('h1');
    let node = h1?.nextSibling ?? null;
    while (node) {
      const next = node.nextSibling;
      actions.appendChild(node);
      node = next;
    }

    topbar.appendChild(actions);
    return actions;
  },

  mountThemeToggle() {
    const topbar = document.querySelector('.admin-topbar');
    if (!topbar || document.getElementById('admin-theme-toggle')) {
      return;
    }

    const actions = this.ensureTopbarActions(topbar);

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'admin-theme-toggle';
    button.className = 'admin-btn admin-btn-secondary admin-theme-toggle';
    button.addEventListener('click', () => {
      this.toggleTheme();
    });

    actions.appendChild(button);
    this.updateThemeToggleLabel();
  },

  mountNav() {
    const nav = document.getElementById('admin-nav');
    if (!nav) {
      return;
    }

    const path = window.location.pathname;
    nav.innerHTML = '';

    this.tools.forEach((tool) => {
      const link = document.createElement('a');
      link.href = tool.href;
      link.textContent = tool.label;
      if (tool.pathMatch.test(path)) {
        link.classList.add('is-active');
      }
      nav.appendChild(link);
    });
  },
};

document.addEventListener('DOMContentLoaded', () => {
  TheBoxAdmin.mountNav();
  TheBoxAdmin.mountThemeToggle();
});
