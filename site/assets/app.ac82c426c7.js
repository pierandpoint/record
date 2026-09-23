// Pier & Point timeline: recolors every map and count on the page for the chosen month.
// Pages work without JavaScript; they are rendered at today's status.
(function () {
  var dataEl = document.getElementById('pp-record');
  var slider = document.getElementById('pp-slider');
  if (!dataEl || !slider) return;
  var R = JSON.parse(dataEl.textContent);
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Index 0 is the "before <start_year>" cap, MAX is the "<end_year>+" cap; 1..MAX-1 are
  // Jan start_year through Dec end_year in order (sitegen/pages.py's window_index/window_label,
  // docs/briefs/site-ux.md). A record whose relevant date falls outside the window is bucketed
  // onto the cap at build time, so app.js only ever sees indices in this fixed range.
  var START = R.start_year, END = R.end_year, TODAY = R.today_index, MAX = R.max_index;
  function windowIndex(dateStr) {
    var year = +dateStr.slice(0, 4), month = +dateStr.slice(5, 7);
    if (year < START) return 0;
    if (year > END) return MAX;
    return 1 + (year - START) * 12 + (month - 1);
  }
  function windowLabel(m) {
    if (m <= 0) return 'before ' + START;
    if (m >= MAX) return END + '+';
    var offset = m - 1;
    return MON[offset % 12] + ' ' + (START + Math.floor(offset / 12));
  }

  var byId = {};
  R.records.forEach(function (r) { byId[r.id] = r; r.events = []; });
  R.milestones.forEach(function (m) {
    m.i = windowIndex(m.date);
    if (m.status && byId[m.id]) byId[m.id].events.push(m);
  });
  R.records.forEach(function (r) { r.events.sort(function (a, b) { return a.i - b.i; }); });

  function statusAt(r, m) {
    if (m < TODAY) {
      var s = null;
      r.events.forEach(function (e) { if (!e.expected && e.i <= m) s = e.status; });
      return { s: s };
    }
    var st = { s: r.status };
    if (m > TODAY) r.events.forEach(function (e) { if (e.expected && e.i <= m) st = { s: e.status, expected: true }; });
    return st;
  }

  // .rec (not just [data-id]): a zoomable map's parcel-label text also carries a matching
  // data-id (to look up its own shape for the "big enough to show" check), and must not be
  // recolored by the timeline along with the shape it names.
  var shapes = document.querySelectorAll('.pp-map .rec[data-id]');
  var readDate = document.getElementById('pp-date');
  var readPhase = document.getElementById('pp-phase');
  var play = document.getElementById('pp-play');
  var speedBtn = document.getElementById('pp-speed');
  var yearJump = document.getElementById('pp-year-jump');
  var timer = null;
  var SPEEDS = [1, 2, 4, 8];
  var speedIdx = 0;

  // The value of the "jump to a year" <option> that covers index m: one option per calendar
  // year (its January index), so any month within a year snaps to that year's own option.
  function yearOptionFor(m) {
    if (m <= 0) return 0;
    if (m >= MAX) return MAX;
    return 1 + Math.floor((m - 1) / 12) * 12;
  }

  function paint(m) {
    shapes.forEach(function (n) {
      var r = byId[n.getAttribute('data-id')];
      if (!r) return;
      var a = statusAt(r, m);
      n.removeAttribute('stroke-dasharray');
      if (!a.s) {
        n.setAttribute('fill', 'rgba(169,179,174,0.06)'); n.setAttribute('stroke', '#7d8a8e'); n.setAttribute('stroke-dasharray', '2 2'); n.setAttribute('opacity', '1');
      } else {
        var c = R.colors[a.s];
        var outline = n.getAttribute('data-mode') === 'outline';
        n.setAttribute('fill', outline ? 'none' : (r.confidence === 'approximate' ? 'url(#h-' + a.s + ')' : c));
        n.setAttribute('stroke', (outline || r.confidence === 'approximate') ? c : '#0f1618');
        n.setAttribute('opacity', a.expected ? '0.62' : (n.getAttribute('data-dim') || '1'));
        if (a.expected) n.setAttribute('stroke-dasharray', '3 2');
      }
    });
    var counts = {};
    R.records.forEach(function (r) {
      var a = statusAt(r, m), k = a.s || 'nodate';
      counts['all:' + k] = (counts['all:' + k] || 0) + 1;
      counts[r.site + ':' + k] = (counts[r.site + ':' + k] || 0) + 1;
    });
    document.querySelectorAll('[data-count]').forEach(function (el) {
      el.textContent = counts[el.getAttribute('data-count')] || 0;
    });
    document.querySelectorAll('[data-bar]').forEach(function (el) {
      el.style.flexGrow = counts[el.getAttribute('data-bar')] || 0;
    });
    var label = windowLabel(m);
    readDate.textContent = label;
    readPhase.textContent = m < TODAY ? 'Recorded history' : m === TODAY ? 'Today' : 'Expected';
    slider.setAttribute('aria-valuetext', label + ', ' + readPhase.textContent);
    if (yearJump) yearJump.value = String(yearOptionFor(m));
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } play.setAttribute('aria-pressed', 'false'); play.querySelector('span').textContent = 'Play'; }
  function startTimer() {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var step = (reduce ? 12 : 1) * SPEEDS[speedIdx];
    timer = setInterval(function () {
      var n = +slider.value + step;
      if (n > MAX) { slider.value = MAX; paint(MAX); stop(); return; }
      slider.value = n; paint(n);
    }, reduce ? 700 : 140);
  }
  slider.addEventListener('input', function () { stop(); paint(+slider.value); });
  play.addEventListener('click', function () {
    if (timer) { stop(); return; }
    if (+slider.value >= MAX) slider.value = 0;
    play.setAttribute('aria-pressed', 'true'); play.querySelector('span').textContent = 'Pause';
    startTimer();
  });
  if (speedBtn) speedBtn.addEventListener('click', function () {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    speedBtn.textContent = SPEEDS[speedIdx] + '×';
    speedBtn.setAttribute('aria-label', 'Playback speed: ' + SPEEDS[speedIdx] + ' times normal, press to change');
    if (timer) { clearInterval(timer); startTimer(); } // re-pace an already-running play without touching its pressed state
  });
  if (yearJump) yearJump.addEventListener('change', function () { stop(); slider.value = yearJump.value; paint(+yearJump.value); });
  document.querySelectorAll('.timeline').forEach(function (t) { t.hidden = false; });
  paint(+slider.value);
})();

// Pan and zoom (the .pp-zoomable svg; sitegen/pages.py's site_map(zoomable=True) on a site or
// record page's own map, and overview_map(zoomable=True) on /near/'s local map, docs/briefs/
// near-me.md). Manipulates the SVG viewBox directly: no map library, no tiles, no external
// requests (docs/briefs/site-ux.md). Degrades to the fitted view with JS off. Its own IIFE,
// not gated on the timeline's #pp-record/#pp-slider above: a record page and /near/ carry
// neither.
(function () {
  function initZoom() {
    document.querySelectorAll('.pp-zoomable').forEach(function (svg) {
      var frame = svg.closest('.map-frame');
      var controls = frame ? frame.querySelector('.zoom-controls') : null;
      var parts = (svg.getAttribute('viewBox') || '0 0 100 100').split(' ').map(Number);
      var base = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
      var view = { x: base.x, y: base.y, w: base.w, h: base.h };
      // A record page's map (sitegen/pages.py's site_map(outer_box=...)) can zoom out past its
      // own fitted view, all the way to the four-site overview -- data-outer is that wider
      // limit, at the same aspect as the viewBox so the h = w * (base.h/base.w) math below
      // still holds. Absent (every other zoomable map), zoom-out stays bounded to the fitted
      // view itself, unchanged from before.
      var outerParts = (svg.getAttribute('data-outer') || '').split(' ').map(Number);
      var outer = outerParts.length === 4 && outerParts.every(function (n) { return !isNaN(n); })
        ? { x: outerParts[0], y: outerParts[1], w: outerParts[2], h: outerParts[3] } : base;
      // data-max-zoom/data-free-pan (sitegen/pages.py's overview_map(zoomable=True), docs/briefs/
      // near-me.md): the /near/ page's own map spans kilometres and must recentre on a real
      // device position that can sit outside its fitted box entirely, so it opts into a much
      // deeper zoom and no clamp back inside that box. A site or record page's own map sets
      // neither, so its zoom range and edge-clamping behavior are unchanged.
      var MIN_W = base.w / (parseFloat(svg.getAttribute('data-max-zoom')) || 8), MAX_W = outer.w, LABEL_AT = base.w * 0.45;
      var freePan = svg.hasAttribute('data-free-pan');
      // A label's font-size and halo are set in the same user-unit space as the map itself
      // (sitegen/pages.py), so left alone they'd grow with the shapes as the view zooms in.
      // Counter-scale both by view.w / base.w on every zoom step to hold their on-screen size
      // roughly constant instead.
      var labels = Array.prototype.map.call(svg.querySelectorAll('.parcel-label'), function (label) {
        return { el: label, fontSize: parseFloat(label.getAttribute('font-size')) || 9,
                 strokeWidth: parseFloat(label.getAttribute('stroke-width')) || 3 };
      });
      // Site-name pins (sitegen/pages.py's site_labels): unlike parcel labels above, always
      // visible, no size-on-screen threshold -- just counter-scaled the same way, so "which
      // cluster is this" stays legible at any zoom instead of shrinking to nothing on the way
      // out to the four-site overview or ballooning at the default fitted-in view.
      var sitePins = Array.prototype.map.call(svg.querySelectorAll('.site-pin-label'), function (label) {
        return { el: label, fontSize: parseFloat(label.getAttribute('font-size')) || 9,
                 strokeWidth: parseFloat(label.getAttribute('stroke-width')) || 3 };
      });

      function updateLabels() {
        var show = view.w < LABEL_AT;
        var scale = view.w / base.w;
        if (show) {
          // A shape must read big enough on screen at the current zoom to earn a label at
          // all, then the biggest shapes claim it first and any label too close to one
          // already placed is dropped -- a dense site (Mission Bay's 101 records) would
          // otherwise pass the size test for nearly everything in view at once and paper it
          // in overlapping text (docs/briefs/site-ux.md).
          var candidates = [];
          labels.forEach(function (entry) {
            entry.big = false;
            var shape = svg.querySelector('.rec[data-id="' + entry.el.getAttribute('data-id') + '"]');
            if (!shape || !shape.getBBox) return;
            var bb = shape.getBBox();
            var size = Math.min(bb.width, bb.height);
            if (size / view.w > 0.045) {
              entry.size = size; entry.cx = bb.x + bb.width / 2; entry.cy = bb.y + bb.height / 2;
              candidates.push(entry);
            }
          });
          candidates.sort(function (a, b) { return b.size - a.size; });
          var placed = [], minDist = view.w * 0.11;
          candidates.forEach(function (entry) {
            entry.big = placed.every(function (p) { return Math.hypot(p.cx - entry.cx, p.cy - entry.cy) > minDist; });
            if (entry.big) placed.push(entry);
          });
        }
        labels.forEach(function (entry) {
          var label = entry.el;
          if (!show) { label.style.opacity = ''; return; }
          label.style.opacity = entry.big ? '1' : '0';
          label.style.fontSize = (entry.fontSize * scale).toFixed(2) + 'px';
          label.style.strokeWidth = (entry.strokeWidth * scale).toFixed(2) + 'px';
        });
        sitePins.forEach(function (entry) {
          entry.el.style.fontSize = (entry.fontSize * scale).toFixed(2) + 'px';
          entry.el.style.strokeWidth = (entry.strokeWidth * scale).toFixed(2) + 'px';
        });
      }

      function apply() {
        svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
        updateLabels();
      }
      function clamp() {
        view.w = Math.max(MIN_W, Math.min(MAX_W, view.w));
        view.h = view.w * (base.h / base.w);
        if (!freePan) {
          view.x = Math.max(outer.x, Math.min(outer.x + outer.w - view.w, view.x));
          view.y = Math.max(outer.y, Math.min(outer.y + outer.h - view.h, view.y));
        }
      }
      function toSvgPoint(clientX, clientY) {
        var ctm = svg.getScreenCTM();
        if (!ctm) return { x: view.x + view.w / 2, y: view.y + view.h / 2 };
        var pt = svg.createSVGPoint();
        pt.x = clientX; pt.y = clientY;
        var loc = pt.matrixTransform(ctm.inverse());
        return { x: loc.x, y: loc.y };
      }
      function zoomAt(factor, cx, cy) {
        var newW = Math.max(MIN_W, Math.min(MAX_W, view.w / factor));
        var scale = newW / view.w;
        view.x = cx - (cx - view.x) * scale;
        view.y = cy - (cy - view.y) * scale;
        view.w = newW; view.h = newW * (base.h / base.w);
        clamp(); apply();
      }
      function reset() { view = { x: base.x, y: base.y, w: base.w, h: base.h }; apply(); }
      function center() { return { x: view.x + view.w / 2, y: view.y + view.h / 2 }; }

      // A small public hook (sitegen/static/app.js's own near-me code below, docs/briefs/
      // near-me.md) so another script can recentre this same pan/zoom state -- e.g. on a real
      // device position -- rather than fighting it by writing the viewBox attribute directly,
      // which the drag/pinch/keyboard handlers above know nothing about.
      svg.ppGetBase = function () { return { x: base.x, y: base.y, w: base.w, h: base.h }; };
      svg.ppSetView = function (cx, cy, w) {
        view = { x: cx - w / 2, y: cy - (w * (base.h / base.w)) / 2, w: w, h: w * (base.h / base.w) };
        clamp(); apply();
      };
      svg.ppReset = reset;

      svg.addEventListener('wheel', function (e) {
        e.preventDefault();
        var p = toSvgPoint(e.clientX, e.clientY);
        zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
      }, { passive: false });
      svg.addEventListener('dblclick', function (e) { e.preventDefault(); reset(); });

      var pointers = {}, dragStart = null, pinchStart = null;
      svg.addEventListener('pointerdown', function (e) {
        svg.setPointerCapture(e.pointerId);
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ids = Object.keys(pointers);
        if (ids.length === 1) {
          dragStart = { clientX: e.clientX, clientY: e.clientY, view: { x: view.x, y: view.y } };
        } else if (ids.length === 2) {
          dragStart = null;
          var pts = ids.map(function (id) { return pointers[id]; });
          var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
          pinchStart = { dist: Math.hypot(dx, dy) || 1, view: { x: view.x, y: view.y, w: view.w },
                         mid: toSvgPoint((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2) };
        }
      });
      svg.addEventListener('pointermove', function (e) {
        if (!(e.pointerId in pointers)) return;
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ids = Object.keys(pointers);
        if (ids.length === 1 && dragStart) {
          var scale = view.w / svg.clientWidth;
          view.x = dragStart.view.x - (e.clientX - dragStart.clientX) * scale;
          view.y = dragStart.view.y - (e.clientY - dragStart.clientY) * scale;
          clamp(); apply();
        } else if (ids.length === 2 && pinchStart) {
          var pts = ids.map(function (id) { return pointers[id]; });
          var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
          var factor = (Math.hypot(dx, dy) || 1) / pinchStart.dist;
          var newW = Math.max(MIN_W, Math.min(MAX_W, pinchStart.view.w / factor));
          var s = newW / pinchStart.view.w;
          view.w = newW; view.h = newW * (base.h / base.w);
          view.x = pinchStart.mid.x - (pinchStart.mid.x - pinchStart.view.x) * s;
          view.y = pinchStart.mid.y - (pinchStart.mid.y - pinchStart.view.y) * s;
          clamp(); apply();
        }
      });
      function endPointer(e) {
        delete pointers[e.pointerId];
        var ids = Object.keys(pointers);
        dragStart = null; pinchStart = null;
        if (ids.length === 1) dragStart = { clientX: pointers[ids[0]].x, clientY: pointers[ids[0]].y, view: { x: view.x, y: view.y } };
      }
      svg.addEventListener('pointerup', endPointer);
      svg.addEventListener('pointercancel', endPointer);

      svg.addEventListener('keydown', function (e) {
        var step = Math.min(view.w, view.h) * 0.12;
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.25, center().x, center().y); }
        else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(1 / 1.25, center().x, center().y); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); view.x -= step; clamp(); apply(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); view.x += step; clamp(); apply(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); view.y -= step; clamp(); apply(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); view.y += step; clamp(); apply(); }
        else if (e.key === '0') { e.preventDefault(); reset(); }
      });

      if (controls) {
        controls.hidden = false;
        var inBtn = controls.querySelector('[data-zoom-in]');
        var outBtn = controls.querySelector('[data-zoom-out]');
        var resetBtn = controls.querySelector('[data-zoom-reset]');
        if (inBtn) inBtn.addEventListener('click', function () { var c = center(); zoomAt(1.4, c.x, c.y); });
        if (outBtn) outBtn.addEventListener('click', function () { var c = center(); zoomAt(1 / 1.4, c.x, c.y); });
        if (resetBtn) resetBtn.addEventListener('click', reset);
      }

      // The "show tenants" toggle (docs/briefs/retail-layer.md): an outline and a count per
      // parcel with a confirmed tenant, never a per-tenant pin. Rendered always by
      // sitegen/pages.py's site_map() but visually inert until this flips .tenants-on on the
      // svg -- so with JavaScript off the toggle button itself stays hidden (like the zoom
      // controls above) and the page's own "What's open, what's coming" section, already in
      // the markup, is the only way to see the tenant list.
      var toggle = frame ? frame.querySelector('[data-tenant-toggle]') : null;
      var panel = frame ? frame.parentElement.querySelector('[data-tenant-panel]') : null;
      if (toggle) {
        toggle.hidden = false;
        toggle.addEventListener('click', function () {
          var on = svg.classList.toggle('tenants-on');
          toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
          toggle.textContent = on ? 'Hide tenants' : 'Show tenants';
          if (!on && panel) panel.hidden = true;
        });
        if (panel) {
          var showPanel = function (a) {
            if (!svg.classList.contains('tenants-on')) return;
            var summary = a.getAttribute('data-tenant-summary');
            if (!summary) return;
            panel.textContent = summary.split('; ').join(' · ');
            panel.hidden = false;
          };
          var hidePanel = function () { panel.hidden = true; };
          svg.querySelectorAll('a[data-tenants]').forEach(function (a) {
            a.addEventListener('pointerenter', function () { showPanel(a); });
            a.addEventListener('focus', function () { showPanel(a); });
            a.addEventListener('pointerleave', hidePanel);
            a.addEventListener('blur', hidePanel);
          });
        }
      }
    });
  }
  initZoom();
})();

// /changes/all/'s filters (docs/briefs/changes-ux.md): a plain GET form so the page still
// works, unfiltered, with JavaScript off. With it on, this filters the already-inlined list
// client-side (no server round trip, no third-party request) and keeps the filter state in
// the URL query so a filtered view can be copied and shared. Runs on its own, independent of
// the timeline/zoom IIFE above, since a changes page carries no pp-record data.
(function () {
  var list = document.querySelector('[data-changes-list]');
  var form = document.querySelector('.changes-filters');
  if (!list || !form) return;
  var items = Array.prototype.slice.call(list.querySelectorAll('li'));
  var emptyNote = document.querySelector('[data-filter-empty]');
  var resetBtn = form.querySelector('[data-filter-reset]');
  var categoryDropdown = form.querySelector('.filter-dropdown');
  var categorySummary = form.querySelector('[data-filter-summary]');
  var fields = {
    site: form.querySelector('#cf-site'), category: Array.prototype.slice.call(form.querySelectorAll('input[name="category"]')),
    from: form.querySelector('#cf-from'), to: form.querySelector('#cf-to')
  };

  // The category dropdown is a native <details>, so it already opens and closes on its own
  // summary click with no JS at all; this only adds the extra behavior a real dropdown widget
  // is expected to have -- closing on an outside click or Escape, and a running "N categories"
  // label -- as enhancements on top of that working baseline.
  function categoryLabel(count) {
    if (!count) return 'All categories';
    if (count === 1) return '1 category';
    return count + ' categories';
  }
  if (categoryDropdown) {
    document.addEventListener('click', function (e) {
      if (categoryDropdown.open && !categoryDropdown.contains(e.target)) categoryDropdown.removeAttribute('open');
    });
    categoryDropdown.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && categoryDropdown.open) { categoryDropdown.removeAttribute('open'); categoryDropdown.querySelector('summary').focus(); }
    });
  }

  function readParams() {
    var params = new URLSearchParams(window.location.search);
    return { site: params.get('site') || '', category: params.getAll('category'),
             from: params.get('from') || '', to: params.get('to') || '' };
  }
  function applyToFields(v) {
    fields.site.value = v.site;
    fields.category.forEach(function (cb) { cb.checked = v.category.indexOf(cb.value) !== -1; });
    fields.from.value = v.from; fields.to.value = v.to;
  }
  function currentValues() {
    return { site: fields.site.value, category: fields.category.filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; }),
             from: fields.from.value, to: fields.to.value };
  }
  function matches(li, v) {
    if (v.site && li.getAttribute('data-site') !== v.site) return false;
    if (v.category.length && v.category.indexOf(li.getAttribute('data-category')) === -1) return false;
    var d = li.getAttribute('data-date');
    if (v.from && d < v.from) return false;
    if (v.to && d > v.to) return false;
    return true;
  }
  function filter() {
    var v = currentValues(), shown = 0;
    items.forEach(function (li) {
      var ok = matches(li, v);
      li.hidden = !ok;
      if (ok) shown++;
    });
    if (emptyNote) emptyNote.hidden = shown !== 0;
    if (resetBtn) resetBtn.hidden = !(v.site || v.category.length || v.from || v.to);
    if (categorySummary) categorySummary.textContent = categoryLabel(v.category.length);
    var params = new URLSearchParams();
    if (v.site) params.set('site', v.site);
    v.category.forEach(function (c) { params.append('category', c); });
    if (v.from) params.set('from', v.from);
    if (v.to) params.set('to', v.to);
    var qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  applyToFields(readParams());
  filter();
  form.addEventListener('submit', function (e) { e.preventDefault(); filter(); });
  [fields.site].concat(fields.category, [fields.from, fields.to]).forEach(function (el) {
    el.addEventListener('change', filter);
  });
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      applyToFields({ site: '', category: [], from: '', to: '' });
      filter();
    });
  }
})();

// Per-box filters (docs/briefs/page-sections.md): a category + optional date-from filter scoped
// to one collapsible box's own list, via data-filter-for="<list id>". Unlike the single-instance
// /changes/all/ filter above, a page can carry several of these independently (a site page has
// one for Changes and one for Retail; a record page can carry Sources' too), so this iterates
// every [data-filter-for] form rather than assuming just one. Operates on any element carrying
// data-category inside the target list, flat (Changes' <li>) or grouped (Retail's .tenant
// inside a .tenant-group) alike -- a group with nothing left visible after filtering hides itself.
(function () {
  document.querySelectorAll('[data-filter-for]').forEach(function (form) {
    var list = document.getElementById(form.getAttribute('data-filter-for'));
    if (!list) return;
    var items = Array.prototype.slice.call(list.querySelectorAll('[data-category]'));
    if (!items.length) return;
    var total = items.length;
    var catField = form.querySelector('[data-filter-category]');
    var fromField = form.querySelector('[data-filter-from]');
    var resetBtn = form.querySelector('[data-filter-reset]');
    var shownEl = form.querySelector('[data-filter-shown]');

    function filter() {
      var cat = catField ? catField.value : '';
      var from = fromField ? fromField.value : '';
      var shown = 0;
      items.forEach(function (el) {
        var ok = (!cat || el.getAttribute('data-category') === cat) &&
                 (!from || !el.hasAttribute('data-date') || el.getAttribute('data-date') >= from);
        el.hidden = !ok;
        if (ok) shown++;
      });
      list.querySelectorAll('.tenant-group, .tenant-closed').forEach(function (g) {
        g.hidden = g.querySelectorAll('[data-category]:not([hidden])').length === 0;
      });
      if (shownEl) shownEl.textContent = shown + ' of ' + total + ' shown';
      if (resetBtn) resetBtn.hidden = !(cat || from);
    }
    [catField, fromField].forEach(function (el) { if (el) el.addEventListener('change', filter); });
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (catField) catField.value = '';
        if (fromField) fromField.value = '';
        filter();
      });
    }
    filter();
  });
})();

// Reveal a collapsed <details> when navigating to an id inside it -- a citation superscript
// jumping into Sources, or a jump-nav link to a section itself (docs/briefs/page-sections.md).
// Doesn't depend on native browser support for auto-expanding <details> on fragment navigation,
// which is inconsistent enough across engines not to bet the citation-jump UX on.
(function () {
  function reveal() {
    var id = window.location.hash.slice(1);
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    var box = el.closest('details');
    if (box && !box.open) box.open = true;
    requestAnimationFrame(function () { el.scrollIntoView({ block: 'center' }); });
  }
  window.addEventListener('hashchange', reveal);
  if (window.location.hash) reveal();
})();

// /near/ (docs/briefs/near-me.md): the location prompt fires only from this button, never on
// load; the position is read once, used to place a dot and sort a list, and never stored or
// sent anywhere -- everything below runs on the device, against #pp-near's inlined bbox and
// record lat/lons (sitegen/build.py). Degrades to the plain, crawlable finder list with
// JavaScript off, or if the visitor never presses the button or declines the prompt.
(function () {
  var btn = document.getElementById('near-locate-btn');
  var dataEl = document.getElementById('pp-near');
  if (!btn || !dataEl) return;
  var D = JSON.parse(dataEl.textContent);
  var KX = Math.cos((D.s + D.n) / 2 * Math.PI / 180);
  var METRES_PER_UNIT = (D.n - D.s) * 111320 / D.height;
  // sitegen/geo.py's Projection, then sitegen/pages.py's overview_map() own sideways flip
  // (R(p) = (p[1], -p[0]), since the map is drawn with north pointing left): mirrored here
  // rather than sent pre-rotated, so this is the whole exported transform -- the bbox plus
  // the map's fixed height (geo.Projection's own height=1000).
  function project(lon, lat) {
    var x = (lon - D.w) * KX / (D.n - D.s) * D.height;
    var y = (D.n - lat) / (D.n - D.s) * D.height;
    return [y, -x];
  }
  function toRad(deg) { return deg * Math.PI / 180; }
  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function bearing(lat1, lon1, lat2, lon2) {
    var y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    var x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  var COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  function compassOf(deg) { return COMPASS[Math.round(deg / 45) % 8]; }
  function fmtDistance(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km'; }

  var NEAR_M = 1500, CLOSE_M = 250, MAP_WIDTH_M = 400;
  var mapFrame = document.getElementById('near-map-frame');
  var svgs = mapFrame ? Array.prototype.slice.call(mapFrame.querySelectorAll('.pp-map')) : [];
  var statusEl = document.getElementById('near-status');
  var closeWrap = document.getElementById('near-close');
  var closeList = document.getElementById('near-close-list');
  var furtherWrap = document.getElementById('near-further-wrap');
  var furtherCount = document.getElementById('near-further-count');
  var farList = document.getElementById('near-far-list');
  var farLine = document.getElementById('near-far-line');
  var finderSection = document.getElementById('near-finder');

  function svgEl(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }

  function clearOverlay(svg) {
    var g = svg.querySelector('.near-overlay');
    if (g) g.remove();
    Array.prototype.forEach.call(svg.querySelectorAll('.rec.near-highlight'), function (el) { el.classList.remove('near-highlight'); });
  }

  // The numbered site pins (sitegen/pages.py's overview_map()) are sized to read at the whole
  // map's own fitted scale -- the far-away view above and the home page's own overview -- and
  // turn into a giant, meaningless circle once the local map zooms into a 400 m crop around the
  // visitor, so showNear() hides them and showFar() (after resetting the view) brings them back.
  function setPinsVisible(svg, visible) {
    Array.prototype.forEach.call(svg.querySelectorAll('.site-pin, .site-pin-label'), function (el) {
      el.style.display = visible ? '' : 'none';
    });
  }

  function drawYouAreHere(svg, cx, cy, accuracyM, viewW) {
    var g = svgEl('g');
    g.setAttribute('class', 'near-overlay');
    if (accuracyM) {
      var ring = svgEl('circle');
      ring.setAttribute('class', 'near-accuracy-ring');
      ring.setAttribute('cx', cx); ring.setAttribute('cy', cy);
      ring.setAttribute('r', accuracyM / METRES_PER_UNIT);
      g.appendChild(ring);
    }
    var dot = svgEl('circle');
    dot.setAttribute('class', 'near-you-dot');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
    dot.setAttribute('r', Math.max(viewW * 0.014, 1.5));
    var title = svgEl('title'); title.textContent = 'You are here';
    dot.appendChild(title);
    g.appendChild(dot);
    svg.appendChild(g);
  }

  function drawArrow(svg, deg) {
    var base = svg.ppGetBase ? svg.ppGetBase() : null;
    if (!base) return;
    var screenDeg = deg - 90, rad = toRad(screenDeg);
    var dx = Math.sin(rad), dy = -Math.cos(rad);
    var halfW = base.w / 2, halfH = base.h / 2;
    var t = Math.min(dx ? Math.abs(halfW / dx) : Infinity, dy ? Math.abs(halfH / dy) : Infinity) * 0.94;
    var cx = base.x + halfW + dx * t, cy = base.y + halfH + dy * t;
    var size = Math.min(base.w, base.h) * 0.035;
    var g = svgEl('g');
    g.setAttribute('class', 'near-overlay near-arrow');
    g.setAttribute('transform', 'translate(' + cx + ' ' + cy + ') rotate(' + screenDeg + ')');
    var tri = svgEl('path');
    tri.setAttribute('d', 'M0 ' + (-size) + ' L' + (size * 0.7) + ' ' + (size * 0.6) + ' L' + (-size * 0.7) + ' ' + (size * 0.6) + ' Z');
    g.appendChild(tri);
    svg.appendChild(g);
  }

  function recordItemHtml(r, distanceM) {
    // .near-item, not .record-list's plain "what"/"detail" grid (sitegen/static/site.css):
    // a thumbnail alongside the name breaks that grid at phone width.
    var thumb = r.image ? '<img class="thumb" src="' + r.image + '" alt="" loading="lazy">' : '<span class="thumb thumb-empty" aria-hidden="true"></span>';
    var bits = [fmtDistance(distanceM), r.statusLabel, r.use];
    if (r.expectedLabel) bits.push('Expected ' + r.expectedLabel);
    return '<li class="near-item">' + thumb + '<div class="near-item-body"><a href="/parcels/' + r.slug + '/">' + r.name + '</a>' +
      '<span class="detail">' + bits.join(' · ') + '</span></div></li>';
  }

  function showStatus(text) {
    if (!statusEl) return;
    statusEl.hidden = !text;
    statusEl.textContent = text || '';
  }

  function resetPanels() {
    closeWrap.hidden = true;
    farLine.hidden = true;
    furtherWrap.hidden = true;
    svgs.forEach(clearOverlay);
  }

  function withDistances(lat, lon) {
    return D.records.map(function (r) {
      return { r: r, dist: haversine(lat, lon, r.lat, r.lon) };
    }).sort(function (a, b) { return a.dist - b.dist; });
  }

  function showNear(lat, lon, accuracyM) {
    var ranked = withDistances(lat, lon);
    var close = ranked.filter(function (x) { return x.dist <= CLOSE_M; });
    var further = ranked.filter(function (x) { return x.dist > CLOSE_M; });
    closeList.innerHTML = close.length ? close.map(function (x) { return recordItemHtml(x.r, x.dist); }).join('')
      : '<li><div class="what">Nothing tracked within ' + CLOSE_M + ' m.</div></li>';
    farList.innerHTML = further.map(function (x) { return recordItemHtml(x.r, x.dist); }).join('');
    furtherCount.textContent = further.length;
    furtherWrap.hidden = further.length === 0;
    closeWrap.hidden = false;
    farLine.hidden = true;
    finderSection.hidden = true;

    var p = project(lon, lat);
    var w = MAP_WIDTH_M / METRES_PER_UNIT;
    mapFrame.hidden = false;
    svgs.forEach(function (svg) {
      clearOverlay(svg);
      setPinsVisible(svg, false);
      if (svg.ppSetView) svg.ppSetView(p[0], p[1], w);
      drawYouAreHere(svg, p[0], p[1], accuracyM, w);
      close.forEach(function (x) {
        Array.prototype.forEach.call(svg.querySelectorAll('.rec[data-id="' + x.r.id + '"]'), function (el) { el.classList.add('near-highlight'); });
      });
    });
  }

  function showFar(lat, lon) {
    var ranked = withDistances(lat, lon);
    var nearest = ranked[0];
    closeWrap.hidden = true;
    finderSection.hidden = false;
    mapFrame.hidden = false;
    var deg = nearest ? bearing(nearest.r.lat, nearest.r.lon, lat, lon) : 0;
    svgs.forEach(function (svg) {
      clearOverlay(svg);
      setPinsVisible(svg, true);
      if (svg.ppReset) svg.ppReset();
      if (nearest) drawArrow(svg, deg);
    });
    if (nearest) {
      farLine.textContent = 'You are ' + fmtDistance(nearest.dist) + ' ' + compassOf(deg) + ' of ' + nearest.r.siteName + '.';
      farLine.hidden = false;
    } else {
      farLine.hidden = true;
    }
  }

  function success(pos) {
    showStatus('');
    resetPanels();
    var lat = pos.coords.latitude, lon = pos.coords.longitude, acc = pos.coords.accuracy;
    var ranked = withDistances(lat, lon);
    if (ranked.length && ranked[0].dist <= NEAR_M) showNear(lat, lon, acc);
    else showFar(lat, lon);
  }
  function failure(err) {
    showStatus('Location unavailable' + (err && err.message ? ' (' + err.message + ')' : '') + ' — showing every tracked record instead.');
    resetPanels();
    mapFrame.hidden = true;
    finderSection.hidden = false;
  }

  btn.addEventListener('click', function () {
    if (!('geolocation' in navigator)) { showStatus('Geolocation is not available in this browser.'); return; }
    showStatus('Locating…');
    navigator.geolocation.getCurrentPosition(success, failure, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
})();

// /near/'s finder (docs/briefs/near-me.md): search + site/status filters + sort, over the
// server-rendered, fully crawlable #finder-list above -- degrades to that plain list with
// JavaScript off. Its own IIFE, independent of the geolocation one above.
(function () {
  var list = document.getElementById('finder-list');
  if (!list) return;
  var items = Array.prototype.slice.call(list.querySelectorAll('.finder-item'));
  var search = document.getElementById('finder-search');
  var siteSel = document.getElementById('finder-site');
  var statusSel = document.getElementById('finder-status');
  var sortSel = document.getElementById('finder-sort');
  var resetBtn = document.getElementById('finder-reset');
  var emptyNote = document.getElementById('finder-empty');
  var STATUS_ORDER = ['complete', 'under_construction', 'planned', 'existing', 'being_removed'];

  function apply() {
    var q = (search.value || '').trim().toLowerCase();
    var site = siteSel.value, status = statusSel.value;
    var shown = 0;
    items.forEach(function (li) {
      var ok = (!site || li.getAttribute('data-site') === site) &&
        (!status || li.getAttribute('data-status') === status) &&
        (!q || li.getAttribute('data-name').indexOf(q) !== -1 || li.getAttribute('data-address').indexOf(q) !== -1);
      li.hidden = !ok;
      if (ok) shown++;
    });
    if (emptyNote) emptyNote.hidden = shown !== 0;
    if (resetBtn) resetBtn.hidden = !(q || site || status || sortSel.value);

    var by = sortSel.value;
    if (by) {
      var sorted = items.slice().sort(function (a, b) {
        if (by === 'status') return STATUS_ORDER.indexOf(a.getAttribute('data-status')) - STATUS_ORDER.indexOf(b.getAttribute('data-status'));
        var ea = a.getAttribute('data-expected') || '9999', eb = b.getAttribute('data-expected') || '9999';
        return ea < eb ? -1 : ea > eb ? 1 : 0;
      });
      sorted.forEach(function (li) { list.appendChild(li); });
    } else {
      items.forEach(function (li) { list.appendChild(li); });
    }
  }
  [search, siteSel, statusSel, sortSel].forEach(function (el) {
    el.addEventListener('input', apply);
    el.addEventListener('change', apply);
  });
  if (resetBtn) resetBtn.addEventListener('click', function () {
    search.value = ''; siteSel.value = ''; statusSel.value = ''; sortSel.value = '';
    apply();
  });
  apply();
})();
