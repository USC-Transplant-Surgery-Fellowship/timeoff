/*
 * Shared by the time-off page (index.html) and its admin page (admin/index.html): the parts both draw the same way.
 * Each page keeps what is different about it (what can be tapped, the admin's extra controls) and passes it in.
 *   TimeOffPage.caller(state, showStatus, renderSelection)  → call(fn, args, onOk): one request at a time
 *   TimeOffPage.offList(ul, view, opts)      the "Already off" list; opts.you: mark the signed-in fellow's own;
 *                                            opts.extra(period): an element to add to each (the admin's controls)
 *   TimeOffPage.weekendOptions(box, options, selected, onPick)
 *   TimeOffPage.calendar(box, grid, cell)    the month grid; cell(c) → { action, selected, removing } for each day
 *   TimeOffPage.custom                       the conference/other form: its days, how many count, the date limits
 */
(function () {
  var el = UI.el, clear = UI.clear, dayLabel = UI.dayLabel, addDays = UI.addDays, $ = UI.$;

  /** One request at a time: a second tap or Enter while waiting is ignored. */
  function caller(state, showStatus, renderSelection) {
    return function call(fn, args, onOk) {
      if (state.busy) return;
      state.busy = true;
      UI.busy(true);
      var done = function () { state.busy = false; state.confirming = false; UI.busy(false); };
      TimeOffApi.run(fn, args, function (res) { done(); onOk(res); if (state.view) renderSelection(); }, function (err) {
        done();
        if (err && err.code === 'auth') return; // the sign-in card is already showing
        var lines = [err && err.message ? err.message : String(err)];
        if (!state.view) lines.push('Reload the page to try again.');
        showStatus('error', 'Something went wrong', lines);
        if (state.view) renderSelection();
      });
    };
  }

  /** "Already off in <month>": who, their service and reason, the dates and the cross-cover. */
  function offList(ul, view, opts) {
    opts = opts || {};
    clear(ul);
    if (!view.offPeriods.length) { ul.appendChild(el('li', 'empty', 'No one is off this month yet.')); return; }
    view.offPeriods.forEach(function (p) {
      var li = el('li');
      li.appendChild(el('b', null, p.name));
      li.appendChild(document.createTextNode(' (' + p.service + ') — ' + p.reason));
      if (p.mine && opts.you) li.appendChild(el('span', 'you', 'You'));
      li.appendChild(el('span', 'when', p.label));
      var cover = el('span', 'cover');
      if (p.crossCover.length) {
        cover.appendChild(document.createTextNode('Cross-cover: '));
        p.crossCover.forEach(function (c, i) {
          if (i) cover.appendChild(document.createTextNode('; '));
          cover.appendChild(el('b', null, c.name));
          cover.appendChild(document.createTextNode(' (' + c.service + (c.partial ? ', ' + c.label : '') + ')'));
        });
      } else {
        cover.classList.add('missing');
        cover.textContent = 'Cross-cover: none on the calendar';
      }
      li.appendChild(cover);
      if (opts.extra) li.appendChild(opts.extra(p));
      ul.appendChild(li);
    });
  }

  /** The weekends that can be picked this month, as radio buttons (those that can't say why). */
  function weekendOptions(box, options, selected, onPick) {
    clear(box);
    if (!options.length) box.appendChild(el('p', 'empty', 'No weekends left to choose this month.'));
    options.forEach(function (o) {
      var b = el('button', 'option');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', selected === o.startKey ? 'true' : 'false');
      b.disabled = !o.available;
      b.appendChild(el('span', 'dot'));
      var text = el('span');
      text.appendChild(el('b', null, o.label));
      text.appendChild(el('small', null, o.available ? 'Cross-cover: ' + (o.crossCover.join(', ') || 'none needed') : o.reason));
      b.appendChild(text);
      b.addEventListener('click', function () { onPick(selected === o.startKey ? '' : o.startKey); });
      box.appendChild(b);
    });
  }

  /**
   * The month grid (Sunday–Saturday). cell(c) → { action: fn or null (tappable when set), muted, selected, removing }.
   * Each day shows the initials of who is off.
   */
  function calendar(box, grid, cell) {
    clear(box);
    UI.DOW.forEach(function (d) { box.appendChild(el('div', 'dow', d)); });
    grid.forEach(function (c) {
      var how = cell(c) || {};
      var d = el(how.action ? 'button' : 'div', 'cell');
      if (how.action) { d.type = 'button'; d.classList.add('ok'); d.addEventListener('click', how.action); d.setAttribute('aria-pressed', how.selected ? 'true' : 'false'); }
      else if (how.muted && c.inMonth) d.classList.add('muted');
      if (!c.inMonth) d.classList.add('out');
      if (c.past && c.inMonth) d.classList.add('past');
      var dow = UI.weekday(c.key);
      if (dow === 0 || dow === 6) d.classList.add('weekendday');
      if (c.off.some(function (o) { return o.mine; })) d.classList.add('mine');
      if (how.selected) d.classList.add('sel');
      if (how.removing) d.classList.add('sel', 'removing');
      d.appendChild(el('span', 'num', String(c.day)));
      c.off.forEach(function (o) {
        var tag = el('span', 'tag', UI.initials(o.name));
        tag.title = o.name + (o.reason ? ' – ' + o.reason : '');
        d.appendChild(tag);
      });
      d.setAttribute('aria-label', dayLabel(c.key) + (c.off.length ? ', off: ' + c.off.map(function (o) { return o.name; }).join(', ') : ''));
      box.appendChild(d);
    });
  }

  /* ── the conference / other form (#customLabel, #customStart, #customEnd) ── */
  var custom = {
    /** The chosen first and last day, as typed (the server checks them). */
    first: function () { return $('customStart').value; },
    last: function () { return $('customEnd').value || $('customStart').value; },
    /** The chosen days, for showing on the calendar. */
    days: function (view) { return UI.daysFrom(custom.first(), custom.last(), (view.rules.customMaxDays || 31) + 1); },
    /** How many of these days count toward the vacation days (the counted days of the week, from the rules). */
    counted: function (view, days) {
      var dows = view.rules.countedDaysOfWeek;
      return days.filter(function (k) { return dows.indexOf(UI.weekday(k)) !== -1; }).length;
    },
    /** Empties the form (a new month starts fresh, so old dates can't be sent for the wrong month). */
    reset: function () { $('customLabel').value = ''; $('customStart').value = ''; $('customEnd').value = ''; },
    /**
     * The date limits: the first day in the month shown; the last day from the first through CUSTOM_MAX_DAYS later,
     * and never past the end of the academic year (July 31). A last day before the first moves up to it.
     */
    limit: function (view) {
      var start = $('customStart'), end = $('customEnd');
      var monthDays = view.grid.filter(function (c) { return c.inMonth; });
      start.min = monthDays[0].key;
      start.max = monthDays[monthDays.length - 1].key;
      var from = start.value || start.min;
      var maxEnd = addDays(from, (view.rules.customMaxDays || 31) - 1);
      end.min = from;
      var yearEnd = view.range ? view.range.lastDay : maxEnd;
      end.max = maxEnd < yearEnd ? maxEnd : yearEnd;
      if (start.value && (!end.value || end.value < start.value)) end.value = start.value;
      if (end.value && end.value > end.max) end.value = end.max;
    },
  };

  window.TimeOffPage = { caller: caller, offList: offList, weekendOptions: weekendOptions, calendar: calendar, custom: custom };
})();
