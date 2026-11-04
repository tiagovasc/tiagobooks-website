const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(body)=>`<svg viewBox="0 0 20 20" aria-hidden="true">${body}</svg>`;
export function renderSiteHeader(site){
  // 4 Nov 2026: GitHub points to this website's repository (was the old book-library repo).
  // 4 Nov 2026: plain-name brand (no mark), quiet icon actions, GitHub moved here from the library toolbar.
  const github='<svg viewBox="0 0 16 16" aria-hidden="true" class="fill-icon"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';
  return `<div class="shell-backdrop" aria-hidden="true"></div><header class="site-shell" id="siteShell"><div class="shell-top"><a class="shell-brand" href="/">${esc(site.author||'Tiago Faleiro')}</a><div class="shell-actions"><a class="shell-action" href="/search" aria-label="Search the website" title="Search">${icon('<circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/>')}</a><a class="shell-action" id="githubLink" href="https://github.com/tiagovasc/tiagobooks-website" target="_blank" rel="noopener noreferrer" aria-label="View the source on GitHub (opens in a new tab)" title="GitHub">${github}</a><button class="shell-action" id="appearanceBtn" type="button" aria-label="Switch appearance" title="Switch appearance">${icon('<circle cx="10" cy="10" r="4"/><path d="M10 1v2m0 14v2M1 10h2m14 0h2M3.6 3.6L5 5m10 10 1.4 1.4M3.6 16.4L5 15m10-10 1.4-1.4"/>').replace('<svg ', '<svg class="theme-sun" ')}${icon('<path d="M17 12.5A7.5 7.5 0 0 1 7.5 3a7.5 7.5 0 1 0 9.5 9.5Z"/>').replace('<svg ', '<svg class="theme-moon" ')}</button><a class="shell-action" id="editAccess" hidden href="/editor" aria-label="Edit writing" title="Edit writing">${icon('<path d="M13.5 3.5l3 3L7 16H4v-3z"/>')}</a><a class="shell-action" id="adminAccess" href="/login" aria-label="Admin login" title="Admin login">${icon('<path d="M11 3h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-5M3 10h10M9 6l4 4-4 4"/>')}</a></div></div><nav class="unified-nav" aria-label="Main">${site.nav.filter(n=>!n.href.startsWith('/tag/')).map(n=>`<a href="${esc(n.href)}">${esc(n.label)}</a>`).join('')}</nav></header>`;
}

// Resolve owner controls before sending HTML, never after an asynchronous session fetch.
export function personalizeSiteHeader(html, canEdit){
  if(!canEdit)return html;
  return html.replace(/(<a\b[^>]*\bid="editAccess") hidden(?:="")?(?=[\s>])/, '$1')
    .replace(/(<a\b[^>]*\bid="adminAccess")([^>]*>)/, (_,start,attrs)=>start+attrs
      .replace('href="/login"','href="/logout"').replaceAll('Admin login','Sign out of admin'));
}
