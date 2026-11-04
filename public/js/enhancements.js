// Progressive enhancements, also applied after a protected entry is unlocked.
(() => {
  function enhance() {
    document.querySelectorAll('.e-content img:not(a img)').forEach(img => {
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-haspopup', 'dialog');
      img.setAttribute('aria-label', img.alt ? `Enlarge image: ${img.alt}` : 'Enlarge image');
    });
    if (document.documentElement.hasAttribute('data-newtab')) {
      document.querySelectorAll('a[href^="http"]').forEach(a => {
        if (a.hostname !== location.hostname) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      });
    }
    document.querySelectorAll('.e-content pre:not([data-copy-ready])').forEach(pre => {
      pre.dataset.copyReady = '';
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'copy-btn'; button.textContent = 'Copy';
      button.setAttribute('aria-label', 'Copy code');
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText((pre.querySelector('code') || pre).textContent);
          button.textContent = 'Copied';
        } catch { button.textContent = 'Could not copy'; }
        setTimeout(() => { button.textContent = 'Copy'; }, 1800);
      });
      pre.appendChild(button);
    });
  }
  function zoom(img) {
    if (document.querySelector('.zoom-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'zoom-dialog'; dialog.setAttribute('aria-label', 'Enlarged image');
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'zoom-close'; close.textContent = 'Close';
    close.setAttribute('aria-label', 'Close enlarged image');
    const large = document.createElement('img');
    large.src = img.currentSrc || img.src; large.alt = img.alt;
    dialog.append(close, large); document.body.append(dialog);
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.addEventListener('close', () => {
      document.documentElement.style.overflow = previousOverflow;
      dialog.remove(); img.focus({preventScroll: true});
    }, {once: true});
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.showModal(); close.focus();
  }
  document.addEventListener('click', event => {
    const img = event.target.closest?.('.e-content img');
    if (img && !img.closest('a')) zoom(img);
  });
  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const img = event.target.closest?.('.e-content img');
    if (img && !img.closest('a')) { event.preventDefault(); zoom(img); }
  });
  document.addEventListener('site:content', enhance);
  enhance();
})();
