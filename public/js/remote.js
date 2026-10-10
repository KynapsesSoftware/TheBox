window.TheBox = window.TheBox || {};

TheBox.remoteEnabled = TheBox.remoteEnabled !== false;

TheBox.remote = {
  currentPage: null,
  handlers: {},
  pageBuffer: '',
  pageBufferTimer: null,
  pageNavigateTimer: null,
  pageBufferTimeoutMs: 4000,
  pageNavigateDelayMs: 2000,
  isPagePending: false,
  focusList: null,
  osdElement: null,

  pages: {
    100: '/',
    200: '/guide.html',
    300: '/watch.html',
    400: '/remote-test.html',
  },

  keys: {
    home: ['Home', 'GoHome', 'XF86Home'],
    back: ['Backspace', 'Escape', 'BrowserBack', 'Back'],
    enter: ['Enter'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    pageUp: ['PageUp'],
    pageDown: ['PageDown'],
    playPause: ['MediaPlayPause', ' ', 'Pause', 'Play'],
    stop: ['MediaStop'],
    rewind: ['MediaRewind'],
    forward: ['MediaFastForward'],
    red: ['F1', 'ColorF0Red', 'Red'],
    green: ['F2', 'ColorF0Green', 'Green'],
    yellow: ['F3', 'ColorF0Yellow', 'Yellow'],
    blue: ['F4', 'ColorF0Blue', 'Blue'],
    volumeUp: ['AudioVolumeUp', 'VolumeUp'],
    volumeDown: ['AudioVolumeDown', 'VolumeDown'],
    volumeMute: ['AudioVolumeMute', 'VolumeMute'],
    fullscreen: ['MediaFullscreen', 'F11', 'KeyF'],
    contextMenu: ['ContextMenu'],
  },

  register(name, handler) {
    this.handlers[name] = handler;
  },

  mountPage(name) {
    this.currentPage = name;
    this.clearPageBuffer();
    this.handlers[name]?.onMount?.();
  },

  detectPage() {
    const path = window.location.pathname;
    if (path.endsWith('/guide.html')) {
      return 'guide';
    }
    if (path.endsWith('/watch.html')) {
      return 'watch';
    }
    if (path.endsWith('/remote-test.html')) {
      return 'remote-test';
    }
    return 'index';
  },

  matchAction(event) {
    const { code, key } = event;

    if (event.keyCode === 93) {
      return 'contextMenu';
    }

    for (const [action, codes] of Object.entries(this.keys)) {
      if (codes.includes(code) || codes.includes(key)) {
        return action;
      }
    }

    if (/^Digit[0-9]$/.test(code)) {
      return { type: 'digit', value: code.replace('Digit', '') };
    }

    if (/^[0-9]$/.test(key)) {
      return { type: 'digit', value: key };
    }

    return null;
  },

  navigate(url) {
    if (url.includes('/watch.html') && !url.includes('channel=')) {
      const lastChannel = sessionStorage.getItem('thebox:lastChannel');
      if (lastChannel) {
        window.location.href = `/watch.html?channel=${encodeURIComponent(lastChannel)}`;
        return;
      }
    }

    window.location.href = url;
  },

  defaultPageNumber() {
    const page = Number(TheBox.publicSettings?.defaultPage);
    return this.pages[page] ? page : 100;
  },

  goHome() {
    this.navigate(this.pages[this.defaultPageNumber()]);
  },

  goBack() {
    const referrer = document.referrer;
    if (referrer && new URL(referrer).origin === window.location.origin) {
      window.history.back();
      return;
    }

    this.goHome();
  },

  goToPageNumber(pageNumber) {
    const route = this.pages[pageNumber];
    if (route) {
      this.navigate(route);
      return true;
    }
    return false;
  },

  clearPageBuffer() {
    this.pageBuffer = '';
    this.isPagePending = false;

    if (this.pageBufferTimer) {
      clearTimeout(this.pageBufferTimer);
      this.pageBufferTimer = null;
    }

    if (this.pageNavigateTimer) {
      clearTimeout(this.pageNavigateTimer);
      this.pageNavigateTimer = null;
    }

    this.updatePageOsd();
  },

  ensureOsdElement() {
    if (!this.osdElement) {
      this.osdElement = document.createElement('div');
      this.osdElement.className = 'remote-page-osd';
      this.osdElement.setAttribute('aria-live', 'polite');
      const shell = document.querySelector('.page-shell');
      (shell || document.body).appendChild(this.osdElement);
    }

    return this.osdElement;
  },

  updatePageOsd() {
    if (TheBox.remotePageOsdEnabled === false) {
      return;
    }

    const osd = this.ensureOsdElement();

    if (!this.pageBuffer) {
      osd.classList.remove('is-visible');
      osd.setAttribute('aria-hidden', 'true');
      osd.textContent = '';
      return;
    }

    osd.textContent = this.pageBuffer.length >= 3
      ? this.pageBuffer.slice(0, 3)
      : this.pageBuffer.padEnd(3, '—');
    osd.classList.add('is-visible');
    osd.setAttribute('aria-hidden', 'false');
  },

  queuePageDigit(digit) {
    if (this.isPagePending) {
      return;
    }

    this.pageBuffer += digit;
    this.updatePageOsd();

    if (this.pageBufferTimer) {
      clearTimeout(this.pageBufferTimer);
      this.pageBufferTimer = null;
    }

    if (this.pageBuffer.length >= 3) {
      const pageNumber = Number.parseInt(this.pageBuffer.slice(0, 3), 10);
      this.pageBuffer = this.pageBuffer.slice(0, 3);
      this.isPagePending = true;
      this.updatePageOsd();

      this.pageNavigateTimer = setTimeout(() => {
        this.clearPageBuffer();
        this.goToPageNumber(pageNumber);
      }, this.pageNavigateDelayMs);
      return;
    }

    this.pageBufferTimer = setTimeout(() => {
      this.clearPageBuffer();
    }, this.pageBufferTimeoutMs);
  },

  createFocusList(container, selector) {
    if (!container) {
      return null;
    }

    return {
      container,
      selector,
      index: 0,
      get items() {
        return [...container.querySelectorAll(selector)];
      },
      focus(index) {
        const items = this.items;
        if (!items.length) {
          return;
        }

        let nextIndex = index;
        if (nextIndex < 0) {
          nextIndex = items.length - 1;
        }
        if (nextIndex >= items.length) {
          nextIndex = 0;
        }

        items.forEach((item) => item.classList.remove('remote-focus'));
        const target = items[nextIndex];
        target.classList.add('remote-focus');
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        this.index = nextIndex;
      },
      move(delta) {
        this.focus(this.index + delta);
      },
      activate() {
        const items = this.items;
        const target = items[this.index];
        if (!target) {
          return;
        }

        if (target.href) {
          const channelMatch = target.href.match(/channel=([^&]+)/);
          if (channelMatch) {
            sessionStorage.setItem('thebox:lastChannel', decodeURIComponent(channelMatch[1]));
          }
        }

        target.click();
      },
    };
  },

  handleGlobalAction(action) {
    switch (action) {
      case 'home':
        this.goHome();
        return true;
      case 'back':
        this.goBack();
        return true;
      case 'red':
        return this.goToPageNumber(100);
      case 'green':
        return this.goToPageNumber(200);
      case 'yellow':
        return this.goToPageNumber(300);
      case 'blue':
        return this.goToPageNumber(400);
      default:
        return false;
    }
  },

  onKeyDown(event) {
    if (!TheBox.remoteEnabled) {
      return;
    }

    if (event.target.matches('input, textarea, select, [contenteditable="true"]')) {
      return;
    }

    const action = this.matchAction(event);
    const pageHandler = this.handlers[this.currentPage];

    if (pageHandler?.onKeyDown?.(event, action)) {
      event.preventDefault();
      return;
    }

    if (action?.type === 'digit') {
      event.preventDefault();
      this.queuePageDigit(action.value);
      return;
    }

    if (action && this.handleGlobalAction(action)) {
      event.preventDefault();
      return;
    }

    if (pageHandler?.onAction?.(action, event)) {
      event.preventDefault();
    }
  },

  init() {
    if (!TheBox.remoteEnabled) {
      return;
    }

    document.addEventListener('keydown', (event) => this.onKeyDown(event), true);
    this.currentPage = this.detectPage();
  },
};

function initRemote() {
  TheBox.remote.init();
  const page = TheBox.remote.detectPage();
  TheBox.remote.mountPage(page);
}

if (TheBox.ready?.then) {
  TheBox.ready.then(() => initRemote()).catch(() => initRemote());
} else {
  initRemote();
}
