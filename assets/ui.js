/*
 * Small page helpers for all three sites. Keep this file identical in timeoff, schedule and portal.
 * It covers building elements, dates ('yyyy-MM-dd' days, 'yyyy-MM' months) and status messages.
 * Each page takes what it needs: var $ = UI.$, el = UI.el, …
 */
(function () {
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* ── the page ── */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function busy(on) { document.body.classList.toggle('busy', !!on); }
  function button(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  /** A button that needs a second tap ("Tap again to …") before fn runs. */
  function confirmButton(cls, text, armedText, fn) {
    var armed = false, b = button(cls, text, function () {
      if (!armed) { armed = true; b.textContent = armedText || 'Tap again to confirm'; b.classList.add('armed'); return; }
      fn();
    });
    return b;
  }
  /** Fills a <select> with [value, label] pairs and selects value. */
  function fillSelect(sel, options, value) {
    clear(sel);
    options.forEach(function (o) { var opt = el('option', null, o[1]); opt.value = o[0]; if (o[0] === value) opt.selected = true; sel.appendChild(opt); });
  }
  /** A message box in box: kind 'ok' | 'error' | '' (clears it), a bold title and a list of lines. */
  function showStatus(box, kind, title, lines, scroll) {
    clear(box);
    if (!box || !kind) return;
    var b = el('div', 'box ' + kind);
    if (title) b.appendChild(el('b', null, title));
    if (lines && lines.length) { var ul = el('ul'); lines.forEach(function (l) { ul.appendChild(el('li', null, l)); }); b.appendChild(ul); }
    box.appendChild(b);
    if (scroll && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  /** A "Recent changes" list: [{ at, by, what }], newest first. */
  function fillLog(ul, log, emptyText) {
    clear(ul);
    (log || []).forEach(function (l) { var li = el('li'); li.appendChild(document.createTextNode(l.what)); li.appendChild(el('span', 'when', l.at + ' · ' + l.by)); ul.appendChild(li); });
    if (!log || !log.length) ul.appendChild(el('li', 'empty', emptyText || 'No changes yet.'));
  }
  /** The Used / Planned / Left of N boxes for a vacation tally. */
  function tallyStats(t) {
    var stats = el('div', 'stats');
    [['used', t.used, 'Used'], ['planned', t.planned, 'Planned'], ['remaining', t.remaining, 'Left of ' + t.limit]].forEach(function (s) {
      var d = el('div', 'stat ' + s[0]); d.appendChild(el('b', null, String(s[1]))); d.appendChild(el('span', null, s[2])); stats.appendChild(d);
    });
    return stats;
  }

  /* ── words ── */
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function initials(name) { return String(name).split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).join('').slice(0, 3).toUpperCase(); }
  /** Full names → the shortest unambiguous label: first names, or the full name when two people share a first name. */
  function shortNames(names) {
    var first = names.map(function (n) { return n.split(' ')[0]; }), out = {};
    names.forEach(function (n, i) { out[n] = first.filter(function (f) { return f === first[i]; }).length > 1 ? n : first[i]; });
    return out;
  }

  /* ── dates ── */
  function ymd(k) { return k.split('-').map(Number); }
  function utc(k) { var p = ymd(k); return new Date(Date.UTC(p[0], p[1] - 1, p[2] || 1)); }
  function weekday(k) { return utc(k).getUTCDay(); }
  function addDays(k, n) { var p = ymd(k); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
  function addMonths(m, n) { var p = ymd(m); return new Date(Date.UTC(p[0], p[1] - 1 + n, 1)).toISOString().slice(0, 7); }
  function dayLabel(k) { var p = ymd(k); return DOW[weekday(k)] + ' ' + p[1] + '/' + p[2]; }
  function spanLabel(a, b) { return !b || a === b ? dayLabel(a) : dayLabel(a) + ' – ' + dayLabel(b); }
  function monthLabel(m) { var p = ymd(m); return MONTHS[p[1] - 1] + ' ' + p[0]; }
  /** Every day from a through b (b defaults to a; nothing if b is before a), at most max days. (Dates come from the
   *  server, which knows the fellowship's time zone, so there is deliberately no "today" here.) */
  function daysFrom(a, b, max) {
    var days = [];
    b = b || a;
    if (!a || b < a) return days;
    for (var k = a; k <= b && days.length < (max || 366); k = addDays(k, 1)) days.push(k);
    return days;
  }

  window.UI = {
    DOW: DOW,
    $: $, el: el, clear: clear, busy: busy, button: button, confirmButton: confirmButton, fillSelect: fillSelect,
    showStatus: showStatus, fillLog: fillLog, tallyStats: tallyStats,
    plural: plural, initials: initials, shortNames: shortNames,
    weekday: weekday, addDays: addDays, addMonths: addMonths, dayLabel: dayLabel, spanLabel: spanLabel, monthLabel: monthLabel,
    daysFrom: daysFrom,
  };
})();
