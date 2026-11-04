// Small enhancements: image zoom, external links in new tab (per Pika setting).
(function () {
  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('.e-content img');
    if (!img || img.closest('a')) return;
    var o = document.createElement('div');
    o.className = 'zoom-overlay';
    var big = document.createElement('img');
    big.src = img.currentSrc || img.src;
    big.alt = img.alt || '';
    o.appendChild(big);
    o.addEventListener('click', function () { o.remove(); });
    document.addEventListener('keydown', function esc(ev) {
      if (ev.key === 'Escape') { o.remove(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(o);
  });
  if (document.documentElement.hasAttribute('data-newtab')) {
    document.querySelectorAll('a[href^="http"]').forEach(function (a) {
      if (a.hostname !== location.hostname) { a.target = '_blank'; a.rel = 'noopener'; }
    });
  }
})();

// Code blocks: copy button.
(function () {
  document.querySelectorAll('.e-content pre').forEach(function (pre) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'copy-btn'; b.textContent = 'Copy';
    b.addEventListener('click', function () {
      var code = pre.querySelector('code');
      navigator.clipboard.writeText((code || pre).innerText).then(function () {
        b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500);
      });
    });
    pre.appendChild(b);
  });
})();
