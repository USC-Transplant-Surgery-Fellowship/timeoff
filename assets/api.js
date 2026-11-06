/*
 * Sign-in and server calls for all three sites. Keep this file identical in timeoff, schedule and portal.
 *
 * SETTINGS. Update these when the deployment, the sign-in client or the portal address changes.
 *   API_URL     Apps Script web-app URL (Deploy → Manage deployments → Web app URL, ending in /exec).
 *   CLIENT_ID   Google Cloud OAuth "Web application" client ID. Must match TO_API.CLIENT_ID in api.gs.
 *   HUB_URL     The portal's session.html, which keeps one sign-in for all three sites.
 *   SIGNUP_URL  The portal's sign-up page, for people not on the member list.
 * For testing, set window.SITE_API_URL, SITE_HUB_URL or SITE_SIGNUP_URL before this file loads.
 *
 * SIGNING IN
 *   - People sign in with Google, or with a 6-digit code emailed to any address.
 *   - A code sign-in lasts days. A Google sign-in lasts an hour.
 *   - The portal's member list decides what each person may do.
 *   - Non-members see a sign-up link, or a note that their sign-up awaits approval.
 *
 * ONE SIGN-IN FOR ALL SITES
 *   - Each page opens the portal's session.html in a hidden frame. It stores the token for all three sites.
 *   - Signing out on one site signs out of all three.
 *   - Without session.html (a file preview, or a network problem), each tab keeps its own sign-in.
 *
 * ACADEMIC YEARS
 *   - Each page shows one August–July year: the one the server returns in who.year.
 *   - From May 1 to July 31, two years are open. The header shows a switch between them.
 *   - Choosing a year reloads the page on it. The tab remembers the choice.
 *   - A link can request a year with ?year=2027. The schedule emails do this.
 *   - Every server call names the page's year. The server answers only for that year.
 *
 * USE
 *   TimeOffApi.start({ app, need, onReady, mainUrl?, adminUrl?, years?, signInMessage? }), then
 *   TimeOffApi.run(fn, args, onOk, onFail).
 *     app            'timeoff' | 'schedule' | 'portal': whose roles count.
 *     need           'viewer' (any role in the app) | 'admin' | 'any' (anyone signed in, as on the sign-up page).
 *     mainUrl        This site's other page. The header links to it for people who may use it.
 *     adminUrl       Same, for the admin page.
 *     years          false for pages without a year (the portal). They show no switch.
 *     signInMessage  Replaces the sign-in card's usual text.
 *   TimeOffApi.googleButton(box, onCredential) draws a Google button. The chosen account's token goes to the page.
 *   TimeOffApi.signInWith(token) switches the page to another sign-in.
 *   TimeOffApi.signOut() and TimeOffApi.callPublic(fn, args) are also available.
 *   Each page needs #who (header), #auth (sign-in and messages) and #app (the page, hidden at first).
 */
(function () {
  var CONFIG = {
    API_URL: window.SITE_API_URL || 'https://script.google.com/macros/s/AKfycbzyKKmoG8PJAqDHuNzXEINMw3gUfY-ctND7aSqzrDCV0l6P8C_SYY6VmU3IzIcYFb76/exec',
    CLIENT_ID: '72967386715-cgntqve43vc2ptpkhprgalf714vtke38.apps.googleusercontent.com',
    HUB_URL: window.SITE_HUB_URL != null ? window.SITE_HUB_URL : 'https://portal.usctransplant.life/session.html',
    SIGNUP_URL: window.SITE_SIGNUP_URL || 'https://portal.usctransplant.life/signup.html',
  };
  var EMAIL_KEY = 'fellowship.lastEmail'; // pre-fills the code form next time
  var TOKEN_KEY = 'timeoff.idToken';
  var YEAR_KEY = 'fellowship.year';       // the academic year chosen in this tab
  var opts = null, gisReady = false;
  var onGoogle = null; // set by googleButton: where the next Google sign-in goes instead of signing in

  /* ── the academic year this page is on ── */
  function storedYear() { try { return sessionStorage.getItem(YEAR_KEY) || ''; } catch (e) { return window.__fellowshipYear || ''; } }
  function storeYear(y) { window.__fellowshipYear = String(y || ''); try { if (y) sessionStorage.setItem(YEAR_KEY, String(y)); else sessionStorage.removeItem(YEAR_KEY); } catch (e) { /* private mode */ } }
  (function yearFromLink() {
    var q = null;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (!/^\d{4}$/.test(q.get('year') || '')) return;
    storeYear(q.get('year'));
    q.delete('year');
    try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : '') + location.hash); } catch (e) { /* file preview */ }
  })();
  function pageYear() { return opts && opts.years === false ? '' : storedYear(); }
  /** Switches the page to another year: remembered for this tab, then the page starts again on it. */
  function switchYear(y) { storeYear(y); location.href = location.pathname; }

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
  /**
   * The current sign-in → Promise of a token or ''. Prefers the hub's shared token, so a sign-out elsewhere
   * reaches this tab. Falls back to this tab's own token.
   */
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
    (lines || []).forEach(function (l) { if (l) c.appendChild(typeof l === 'string' ? el('p', null, l) : l); });
    box.appendChild(c);
    return c;
  }
  function showApp(show) { $('app').hidden = !show; if (show) { clear($('auth')); $('auth').hidden = true; } }
  function link(text, href) { var a = el('a', 'toplink', text); a.href = href; return a; }
  function linkButton(text, fn) { var b = el('button', 'linkbtn', text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  /* ── Google sign-in ── */
  /* Waits up to 20 seconds for Google's sign-in script. Blockers can stop it; the emailed code still works. */
  function whenGis(fn, tries) {
    if (window.google && google.accounts && google.accounts.id) { if (!gisReady) { gisReady = true; initGis(); } fn(); return; }
    if ((tries || 0) > 200) return;
    setTimeout(function () { whenGis(fn, (tries || 0) + 1); }, 100);
  }
  function initGis() {
    google.accounts.id.initialize({
      client_id: CONFIG.CLIENT_ID,
      callback: function (resp) {
        if (onGoogle) { onGoogle(resp.credential); return; }
        setToken(resp.credential); checkWho();
      },
      auto_select: true,               // signs returning people in again without a click
      cancel_on_tap_outside: false,
      use_fedcm_for_prompt: true,
    });
  }
  function showSignIn(message) {
    showApp(false);
    onGoogle = null;
    $('who').textContent = '';
    var btn = el('div', 'gsi-button');
    var signupPage = opts && opts.need === 'any';
    card('Sign in', [message || (opts && opts.signInMessage) || (signupPage ? 'Sign in with Google, or with a code we email you.' : null), btn,
      el('div', 'or', 'or'), codeForm(),
      signupLine()]);
    whenGis(function () {
      google.accounts.id.renderButton(btn, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' });
      google.accounts.id.prompt();
    });
  }
  function signupLine() {
    var p = el('p', 'small signup-line', 'New here? ');
    if (opts && opts.need === 'any') return null; // already on the sign-up page
    p.appendChild(link('Sign up', CONFIG.SIGNUP_URL));
    return p;
  }

  /* "Email me a code": any email address works; the code proves it's theirs. */
  function codeForm() {
    var box = el('div', 'code-form'), last = '';
    try { last = localStorage.getItem(EMAIL_KEY) || ''; } catch (e) { last = ''; }
    var email = el('input'); email.type = 'email'; email.id = 'codeEmail'; email.autocomplete = 'email'; email.placeholder = 'name@example.com'; email.value = last;
    email.setAttribute('aria-label', 'Email address for a sign-in code');
    var send = el('button', 'secondary', 'Email me a code'); send.type = 'button';
    var step2 = el('div', 'code-step'); step2.hidden = true;
    var sentNote = el('p', 'hint small');
    var codeLabel = el('label', 'label', '6-digit code'); codeLabel.htmlFor = 'codeValue';
    var code = el('input'); code.id = 'codeValue'; code.type = 'text'; code.inputMode = 'numeric'; code.autocomplete = 'one-time-code'; code.maxLength = 7; code.placeholder = '123456';
    var go = el('button', 'primary small', 'Sign in'); go.type = 'button';
    var again = linkButton('Use a different email or send a new code', function () { step2.hidden = true; status(''); email.focus(); });
    var msg = el('div', 'status');
    function status(kind, text) { clear(msg); if (kind) { var b = el('div', 'box ' + kind); b.textContent = text; msg.appendChild(b); } }
    function busy(b, on) { b.disabled = on; }
    send.addEventListener('click', function () {
      var e = email.value.trim();
      if (!e) { status('error', 'Enter your email address.'); return; }
      busy(send, true); status('');
      callPublic('apiAuthSendCode', [e]).then(function (r) {
        busy(send, false);
        if (!r.ok) { status('error', r.errors.join(' ')); return; }
        try { localStorage.setItem(EMAIL_KEY, e); } catch (x) { /* private mode */ }
        sentNote.textContent = r.message; step2.hidden = false; code.value = ''; code.focus();
      }, function (err) { busy(send, false); status('error', err.message); });
    });
    function check() {
      var e = email.value.trim(), c = code.value.replace(/\D/g, '');
      if (c.length !== 6) { status('error', 'Enter the 6 digits from the email.'); return; }
      busy(go, true); status('');
      callPublic('apiAuthCheckCode', [e, c]).then(function (r) {
        busy(go, false);
        if (!r.ok) { status('error', r.errors.join(' ')); return; }
        setToken(r.token); checkWho();
      }, function (err) { busy(go, false); status('error', err.message); });
    }
    go.addEventListener('click', check);
    code.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') check(); });
    email.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') send.click(); });
    step2.appendChild(sentNote); step2.appendChild(codeLabel); step2.appendChild(code); step2.appendChild(go); step2.appendChild(again);
    [email, send, step2, msg].forEach(function (x) { box.appendChild(x); });
    return box;
  }
  function signOut() {
    // Cancels an emailed-code sign-in on the server too, so a copy of it elsewhere stops working. Never waits for it.
    var t = localToken();
    if (t) post(Object.assign({ fn: 'apiSignOut', args: [], idToken: t }, from())).then(null, function () { /* signed out here anyway */ });
    setToken('');
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    showSignIn('You are signed out of the fellowship sites.');
  }

  /* After sign-in: ask the server who this is and what they may do in this app. */
  function checkWho() {
    card('', [el('div', 'loading', 'Checking your access…')]);
    call('apiWhoAmI', [opts.app]).then(function (who) {
      var allowed = opts.need === 'any' || (opts.need === 'admin' ? who.isAdmin : who.canView);
      if (!allowed && who.status === 'pending') {
        card('Waiting for approval', [who.message, linkButton('Sign in with a different account', signOut)]);
        return;
      }
      if (!allowed && who.status === 'unknown') {
        card('You’re not on the member list yet', [who.message, link('Sign up', CONFIG.SIGNUP_URL), el('br'),
          linkButton('Sign in with a different account', signOut)]);
        return;
      }
      if (!allowed) {
        var lines = [opts.need === 'admin' && who.canView ? who.email + ' is not an admin here.' : who.message];
        if (opts.need === 'admin' && who.canView && opts.mainUrl) lines.push(link('Open the main page', opts.mainUrl));
        lines.push(linkButton('Sign in with a different account', signOut));
        card(opts.need === 'admin' ? 'You can’t use the admin page' : 'You can’t use this site', lines);
        return;
      }
      renderHeader(who);
      if (pageYear() && String(who.year) !== pageYear()) storeYear(who.year); // that year isn't open any more
      showRange(who);
      showApp(true);
      opts.onReady(who);
    }, function (err) {
      if (err.code === 'auth') return; // call() already showed the sign-in card
      card('Something went wrong', [err.message, linkButton('Try again', checkWho)]);
    });
  }

  /*
   * The year's dates ("Aug 2026 – Jul 2027"), shown once in the header's display on every page. When two years are
   * open (May–July), a switch between them instead.
   */
  function showRange(who) {
    var lcd = document.querySelector('.lcd');
    if (!lcd || !who.range) return;
    var r = lcd.querySelector('.lcd-range');
    if (!r) { r = el('div', 'lcd-range'); lcd.appendChild(r); }
    clear(r);
    var years = who.years || [];
    if (opts.years === false || years.length < 2) { r.textContent = who.range; return; }
    r.classList.add('lcd-years');
    r.setAttribute('role', 'group');
    r.setAttribute('aria-label', 'Academic year');
    years.forEach(function (y) {
      var b = el('button', 'lcd-year', y.name);
      b.type = 'button';
      b.title = y.short;
      b.setAttribute('aria-pressed', y.year === who.year ? 'true' : 'false');
      b.addEventListener('click', function () { if (y.year !== who.year) switchYear(y.year); });
      r.appendChild(b);
    });
  }

  /* The header: "Signed in as …", this site's other page, the other sites, and Sign out. Admin pages link to admin pages. */
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
  function post(body) {
    return fetch(CONFIG.API_URL, {
      method: 'POST',
      // text/plain keeps this a "simple" request, which Apps Script accepts from another site.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) throw new Error('The server answered with an error (' + r.status + '). Please try again.');
      return r.json();
    }, function () {
      throw new Error('Could not reach the server. Check your internet connection and try again.');
    });
  }
  /** Which site and page is calling (for the activity record super admins see in the portal). */
  function from() { return { app: opts ? opts.app : '', admin: !!(opts && opts.need === 'admin') }; }
  /** The calls that work before signing in (asking for and checking an emailed code, reading an invitation). */
  function callPublic(fn, args) {
    return post(Object.assign({ fn: fn, args: args || [] }, from())).then(function (res) {
      if (res.ok) return res.result;
      throw Object.assign(new Error(res.error || 'Something went wrong.'), { code: res.code });
    });
  }
  function authError(message) {
    showSignIn(message);
    return Object.assign(new Error(message), { code: 'auth' });
  }
  function call(fn, args) {
    return getToken().then(function (token) {
      if (!token) throw authError('You’re signed out, or your sign-in has expired. Please sign in again.');
      return post(Object.assign({ fn: fn, args: args || [], idToken: token, year: pageYear() }, from())).then(function (res) {
        if (res.ok) return res.result;
        if (res.code === 'auth') { setToken(''); throw authError(res.error); }
        throw Object.assign(new Error(res.error || 'Something went wrong.'), { code: res.code });
      });
    });
  }

  /** A "Sign in with Google" button whose choice goes to onCredential(token) rather than signing in with it. */
  function googleButton(box, onCredential) {
    clear(box);
    whenGis(function () {
      onGoogle = onCredential;
      google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill' });
    });
  }

  window.TimeOffApi = {
    googleButton: googleButton,
    /** Switches to another sign-in, such as the Google account the person made primary. Then restarts the page. */
    signInWith: function (token) { onGoogle = null; setToken(token); checkWho(); },
    signOut: function () { signOut(); },
    /** The calls that work without signing in (e.g. the welcome page reading its invitation) → Promise. */
    callPublic: callPublic,
    /** opts: { app: 'timeoff' | 'schedule' | 'portal', need: 'viewer' | 'admin' | 'any', onReady(who), mainUrl?, adminUrl?, years?, signInMessage? } */
    start: function (o) {
      opts = o;
      card('', [el('div', 'loading', 'Signing in…')]);
      getToken().then(function (t) { if (t) checkWho(); else showSignIn(); });
    },
    /** Like google.script.run: run(fn, args, onOk, onFail). */
    run: function (fn, args, onOk, onFail) { call(fn, args).then(onOk, onFail); },
  };
})();
