// Decrypts password-protected entries (AES-GCM, PBKDF2-SHA256) produced by src/lib/protect.ts.
(function () {
  var box = document.getElementById('locked');
  if (!box) return;
  var payload = JSON.parse(box.getAttribute('data-payload'));
  var form = box.querySelector('form');
  var input = box.querySelector('input[type=password]');
  var msg = box.querySelector('.locked-msg');
  var from64 = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
  var storeKey = 'unlock:' + location.pathname;

  async function tryUnlock(pw) {
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    var key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: from64(payload.salt), iterations: payload.iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: from64(payload.iv) }, key, from64(payload.data));
    var html = new TextDecoder().decode(plain);
    document.getElementById('unlocked').innerHTML = html;
    document.dispatchEvent(new Event('site:content'));
    box.hidden = true;
    try { sessionStorage.setItem(storeKey, pw); } catch (e) {}
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.textContent = '';
    tryUnlock(input.value).catch(function () { msg.textContent = 'Incorrect password.'; });
  });

  try {
    var saved = sessionStorage.getItem(storeKey);
    if (saved) tryUnlock(saved).catch(function () {});
  } catch (e) {}
})();
