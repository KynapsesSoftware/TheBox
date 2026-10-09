window.TheBoxAdmin = {
  tools: [
    { href: '/admin/', label: 'Overview', pathMatch: /\/admin\/?$/ },
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
});
