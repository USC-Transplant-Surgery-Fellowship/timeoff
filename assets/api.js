/*
 * Shared by all three sites (time off, call schedule, portal; keep the copies identical): settings, "Sign in with
 * Google", one sign-in for all the sites, and calls to the server (Google Apps Script).
 *
 * SETTINGS — change these if the Apps Script deployment, the Google sign-in client or the portal's address changes:
 *   API_URL:   the Apps Script web app URL (Deploy → Manage deployments → Web app URL, ends in /exec)
 *   CLIENT_ID: the OAuth "Web application" client ID from Google Cloud (must match TO_API.CLIENT_ID in api.gs)
 *   HUB_URL:   the portal's session.html, which remembers the sign-in for all the sites (see below)
 * A page can use other values (e.g. for testing) by setting window.SITE_API_URL / window.SITE_HUB_URL before this file loads.
 *
 * One sign-in for all the sites: after someone signs in on any site, the token is kept by the portal's session.html
 * (opened invisibly in each page), so the other sites use it too instead of asking again. Signing out on one site
 * signs out of all of them. If session.html can't be reached (or on a page opened from a file), each site keeps its
 * own sign-in for the browser tab, as before.
 *
 * Each page calls TimeOffApi.start({ app, need, onReady, mainUrl?, adminUrl? }) and then TimeOffApi.run(fn, args, onOk, onFail).
 *   app:  'timeoff' | 'schedule' | 'portal' — whose roles count (set in the portal).
 *   need: 'viewer' (anyone with a role in the app) | 'admin'.
 *   mainUrl / adminUrl: this site's other page, linked in the header for people who can use it.
 * The page needs these elements: #who (in the header), #auth (sign-in / messages), #app (the page itself, hidden at first).
 */
(function () {
  var CONFIG = {
    API_URL: window.SITE_API_URL || 'https://script.google.com/macros/s/AKfycbzyKKmoG8PJAqDHuNzXEINMw3gUfY-ctND7aSqzrDCV0l6P8C_SYY6VmU3IzIcYFb76/exec',
    CLIENT_ID: '72967386715-cgntqve43vc2ptpkhprgalf714vtke38.apps.googleusercontent.com',
    HUB_URL: window.SITE_HUB_URL != null ? window.SITE_HUB_URL : 'https://portal.usctransplant.life/session.html',
  };
  var TOKEN_KEY = 'timeoff.idToken';
  var opts = null, gisReady = false;

  /* ── the sign-in token (Google's tokens last an hour) ── */
  function tokenPayload(t) {
    try {
      var p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      return JSON.parse(decodeURIComponent(escape(atob(p))));
    } catch (e) { return null; }
  }
  function fresh(t) { var p = t && tokenPayload(t); return !!(p && p.exp * 1000 > Date.now() + 60000); }
  function localToken() {
    var t = '';
    try { t = sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { t = window.__timeOffToken || ''; }
    return fresh(t) ? t : '';
  }
  function setLocalToken(t) {
    window.__timeOffToken = t;
    try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* private mode */ }
  }
  /** Remembers (or forgets, t = '') the sign-in here and for the other sites. */
  function setToken(t) { setLocalToken(t); hubAsk(t ? 'set' : 'clear', t); }
  /** The current sign-in: the shared one if the hub answers, else this tab's own. → Promise of a token or ''. */
  function getToken() {
    return hubAsk('get').then(function (m) {
      if (m && typeof m.token === 'string') { setLocalToken(fresh(m.token) ? m.token : ''); return localToken(); }
      return localToken();
    });
  }

  /* ── the shared sign-in (session.html on the portal, in a hidden frame) ── */
  var hub = { ready: null, frame: null, origin: '', waiting: {}, seq: 0 };
  function hubReady() {
    if (hub.ready) return hub.ready;
    hub.ready = new Promise(function (resolve) {
      try { hub.origin = new URL(CONFIG.HUB_URL).origin; } catch (e) { hub.origin = ''; }
      if (!hub.origin || location.protocol !== 'https:') { resolve(false); return; }
      var f = document.createElement('iframe');
      f.src = CONFIG.HUB_URL; f.title = 'Sign-in for the fellowship sites'; f.hidden = true; f.tabIndex = -1; f.setAttribute('aria-hidden', 'true');
      var timer = setTimeout(function () { resolve(false); }, 2500);
      window.addEventListener('message', function (e) {
        if (e.origin !== hub.origin || e.source !== f.contentWindow || !e.data) return;
        if (e.data.type === 'hub-ready') { clearTimeout(timer); resolve(true); return; }
        var done = hub.waiting[e.data.id];
        if (done) { delete hub.waiting[e.data.id]; done(e.data); }
      });
      hub.frame = f;
      (document.body || document.documentElement).appendChild(f);
    });
    return hub.ready;
  }
  /** Asks the hub (type 'get' | 'set' | 'clear') → Promise of its answer, or null if it isn't there. */
  function hubAsk(type, token) {
    return hubReady().then(function (ok) {
      if (!ok) return null;
      return new Promise(function (resolve) {
        var id = 'm' + (++hub.seq);
        hub.waiting[id] = resolve;
        setTimeout(function () { if (hub.waiting[id]) { delete hub.waiting[id]; resolve(null); } }, 3000);
        hub.frame.contentWindow.postMessage({ type: type, id: id, token: token || '' }, hub.origin);
      });
    });
  }

  /* ── small DOM helpers ── */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function card(title, lines) {
    var box = $('auth'); clear(box); box.hidden = false;
    var c = el('section', 'card auth-card');
    if (title) c.appendChild(el('h2', null, title));
    (lines || []).forEach(function (l) { c.appendChild(typeof l === 'string' ? el('p', null, l) : l); });
    box.appendChild(c);
    return c;
  }
  function showApp(show) { $('app').hidden = !show; if (show) { clear($('auth')); $('auth').hidden = true; } }
  function link(text, href) { var a = el('a', 'toplink', text); a.href = href; return a; }
  function linkButton(text, fn) { var b = el('button', 'linkbtn', text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  /* ── Google sign-in ── */
  function whenGis(fn) {
    if (window.google && google.accounts && google.accounts.id) { if (!gisReady) { gisReady = true; initGis(); } fn(); return; }
    setTimeout(function () { whenGis(fn); }, 100);
  }
  function initGis() {
    google.accounts.id.initialize({
      client_id: CONFIG.CLIENT_ID,
      callback: function (resp) { setToken(resp.credential); checkWho(); },
      auto_select: true,               // returning people are signed in again without a click
      cancel_on_tap_outside: false,
      use_fedcm_for_prompt: true,
    });
  }
  function showSignIn(message) {
    showApp(false);
    $('who').textContent = '';
    var btn = el('div', 'gsi-button');
    card('Sign in', [message || 'Sign in with the Google account on the fellowship’s member list.', btn,
      el('p', 'hint small', 'One sign-in works for the time-off site, the call schedule and the portal.')]);
    whenGis(function () {
      google.accounts.id.renderButton(btn, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' });
      google.accounts.id.prompt();
    });
  }
  function signOut() {
    setToken('');
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    showSignIn('You are signed out of the fellowship sites.');
  }

  /* After sign-in: ask the server who this is and what they may do in this app. */
  function checkWho() {
    card('', [el('div', 'loading', 'Checking your access…')]);
    call('apiWhoAmI', [opts.app]).then(function (who) {
      var allowed = opts.need === 'admin' ? who.isAdmin : who.canView;
      if (!allowed) {
        var lines = [opts.need === 'admin' && who.canView ? who.email + ' is not an admin here.' : who.message];
        if (opts.need === 'admin' && who.canView && opts.mainUrl) lines.push(link('Open the main page', opts.mainUrl));
        lines.push(linkButton('Sign in with a different account', signOut));
        card(opts.need === 'admin' ? 'You can’t use the admin page' : 'You can’t use this site', lines);
        return;
      }
      renderHeader(who);
      showApp(true);
      opts.onReady(who);
    }, function (err) {
      if (err.code === 'auth') return; // call() already showed the sign-in card
      card('Something went wrong', [err.message, linkButton('Try again', checkWho)]);
    });
  }

  /* "Signed in as …", then links: this site's other page, the other sites (their admin pages from an admin page), Sign out. */
  function renderHeader(who) {
    var w = $('who'); clear(w);
    w.appendChild(el('span', 'who-name', 'Signed in as ' + (who.name || who.email)));
    var actions = el('span', 'who-actions');
    if (opts.need === 'admin' && opts.mainUrl) actions.appendChild(link('Main view', opts.mainUrl));
    if (opts.need !== 'admin' && who.isAdmin && opts.adminUrl) actions.appendChild(link('Admin view', opts.adminUrl));
    (who.apps || []).forEach(function (a) {
      if (a.key === opts.app) return;
      var admin = opts.need === 'admin' && a.adminUrl;
      actions.appendChild(link(admin ? a.label + ' admin' : a.label, admin ? a.adminUrl : a.url));
    });
    actions.appendChild(linkButton('Sign out', signOut));
    w.appendChild(actions);
  }

  /* ── calling the server ── */
  function authError(message) {
    showSignIn(message);
    return Object.assign(new Error(message), { code: 'auth' });
  }
  function call(fn, args) {
    var local = localToken();
    return (local ? Promise.resolve(local) : getToken()).then(function (token) {
      if (!token) throw authError('Your sign-in has expired. Please sign in again.');
      return fetch(CONFIG.API_URL, {
        method: 'POST',
        // text/plain keeps this a "simple" request, which Apps Script accepts from another site.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ fn: fn, args: args || [], idToken: token }),
      }).then(function (r) {
        if (!r.ok) throw new Error('The server answered with an error (' + r.status + '). Please try again.');
        return r.json();
      }, function () {
        throw new Error('Could not reach the server. Check your internet connection and try again.');
      }).then(function (res) {
        if (res.ok) return res.result;
        if (res.code === 'auth') { setToken(''); throw authError(res.error); }
        throw Object.assign(new Error(res.error || 'Something went wrong.'), { code: res.code });
      });
    });
  }

  window.TimeOffApi = {
    config: CONFIG,
    /** opts: { app: 'timeoff' | 'schedule' | 'portal', need: 'viewer' | 'admin', onReady(who), mainUrl?, adminUrl? } */
    start: function (o) {
      opts = o;
      card('', [el('div', 'loading', 'Signing in…')]);
      getToken().then(function (t) { if (t) checkWho(); else showSignIn(); });
    },
    /** Like google.script.run: run(fn, args, onOk, onFail). */
    run: function (fn, args, onOk, onFail) { call(fn, args).then(onOk, onFail); },
    signOut: signOut,
  };
})();
