/*
 * Time-off site: settings, "Sign in with Google", and calls to the server (Google Apps Script).
 *
 * SETTINGS — change these if the Apps Script deployment or the Google sign-in client ever changes:
 *   API_URL:   the Apps Script web app URL (Deploy → Manage deployments → Web app URL, ends in /exec)
 *   CLIENT_ID: the OAuth "Web application" client ID from Google Cloud (must match TO_API.CLIENT_ID in timeOffApi.gs)
 *
 * Each page calls TimeOffApi.start({ need: 'fellow' | 'admin', onReady }) and then TimeOffApi.run(fn, args, onOk, onFail).
 * The page needs these elements: #who (in the header), #auth (sign-in / messages), #app (the page itself, hidden at first).
 */
(function () {
  var CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbzyKKmoG8PJAqDHuNzXEINMw3gUfY-ctND7aSqzrDCV0l6P8C_SYY6VmU3IzIcYFb76/exec',
    CLIENT_ID: '72967386715-cgntqve43vc2ptpkhprgalf714vtke38.apps.googleusercontent.com',
  };
  var TOKEN_KEY = 'timeoff.idToken';
  var opts = null, gisReady = false;

  /* ── the sign-in token (kept for this browser tab only; Google's tokens last an hour) ── */
  function tokenPayload(t) {
    try {
      var p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      return JSON.parse(decodeURIComponent(escape(atob(p))));
    } catch (e) { return null; }
  }
  function fresh(t) { var p = t && tokenPayload(t); return !!(p && p.exp * 1000 > Date.now() + 60000); }
  function getToken() {
    var t = '';
    try { t = sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { t = window.__timeOffToken || ''; }
    return fresh(t) ? t : '';
  }
  function setToken(t) {
    window.__timeOffToken = t;
    try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* private mode */ }
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
    card('Sign in', [message || 'Sign in with the Google account on the fellowship list.', btn,
      el('p', 'hint small', 'You can choose any of the Google accounts in this browser.')]);
    whenGis(function () {
      google.accounts.id.renderButton(btn, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' });
      google.accounts.id.prompt();
    });
  }
  function signOut() {
    setToken('');
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    showSignIn('You are signed out.');
  }
  function linkButton(text, fn) { var b = el('button', 'linkbtn', text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  /* After sign-in: ask the server who this is and whether they may use this page. */
  function checkWho() {
    card('', [el('div', 'loading', 'Checking your access…')]);
    call('apiWhoAmI', []).then(function (who) {
      var allowed = opts.need === 'admin' ? who.isAdmin : who.isFellow;
      if (!allowed && opts.need === 'fellow' && who.isAdmin && opts.adminUrl) { location.href = opts.adminUrl; return; }
      if (!allowed) {
        card(opts.need === 'admin' ? 'You can’t use the admin page' : 'You can’t use this site', [
          opts.need === 'admin' ? who.email + ' is not an admin for this site.' : who.message,
          linkButton('Sign in with a different account', signOut)]);
        return;
      }
      // "Signed in as …", then the pager's buttons: the other view (for people who are both fellow and admin) and Sign out.
      var w = $('who'); clear(w);
      w.appendChild(el('span', 'who-name', 'Signed in as ' + (opts.need === 'admin' ? who.email : who.name)));
      var actions = el('span', 'who-actions');
      if (opts.need === 'fellow' && who.isAdmin && opts.adminUrl) { var a = el('a', 'toplink', 'Admin view'); a.href = opts.adminUrl; actions.appendChild(a); }
      if (opts.need === 'admin' && who.isFellow && opts.fellowUrl) { var f = el('a', 'toplink', 'Fellow view'); f.href = opts.fellowUrl; actions.appendChild(f); }
      actions.appendChild(linkButton('Sign out', signOut));
      w.appendChild(actions);
      showApp(true);
      opts.onReady(who);
    }, function (err) {
      if (err.code === 'auth') return; // call() already showed the sign-in card
      card('Something went wrong', [err.message, linkButton('Try again', checkWho)]);
    });
  }

  /* ── calling the server ── */
  function call(fn, args) {
    var token = getToken();
    if (!token) { showSignIn('Your sign-in has expired. Please sign in again.'); return Promise.reject(Object.assign(new Error('Please sign in.'), { code: 'auth' })); }
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
      var e = new Error(res.error || 'Something went wrong.');
      e.code = res.code;
      if (res.code === 'auth') { setToken(''); showSignIn(res.error); }
      throw e;
    });
  }

  window.TimeOffApi = {
    config: CONFIG,
    /** opts: { need: 'fellow' | 'admin', onReady(who), adminUrl?, fellowUrl? } */
    start: function (o) {
      opts = o;
      if (getToken()) checkWho(); else showSignIn();
    },
    /** Like google.script.run: run(fn, args, onOk, onFail). */
    run: function (fn, args, onOk, onFail) { call(fn, args).then(onOk, onFail); },
    signOut: signOut,
  };
})();
