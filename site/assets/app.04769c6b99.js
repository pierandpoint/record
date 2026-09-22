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

  // Pan and zoom on a site page's own map only (the .pp-zoomable svg; sitegen/pages.py's
  // site_map(zoomable=True)). Manipulates the SVG viewBox directly: no map library, no tiles,
  // no external requests (docs/briefs/site-ux.md). Degrades to the fitted view with JS off.
  function initZoom() {
    document.querySelectorAll('.pp-zoomable').forEach(function (svg) {
      var frame = svg.closest('.map-frame');
      var controls = frame ? frame.querySelector('.zoom-controls') : null;
      var parts = (svg.getAttribute('viewBox') || '0 0 100 100').split(' ').map(Number);
      var base = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
      var view = { x: base.x, y: base.y, w: base.w, h: base.h };
      var MIN_W = base.w / 8, MAX_W = base.w, LABEL_AT = base.w * 0.45;
      // A label's font-size and halo are set in the same user-unit space as the map itself
      // (sitegen/pages.py), so left alone they'd grow with the shapes as the view zooms in.
      // Counter-scale both by view.w / base.w on every zoom step to hold their on-screen size
      // roughly constant instead.
      var labels = Array.prototype.map.call(svg.querySelectorAll('.parcel-label'), function (label) {
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
      }

      function apply() {
        svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
        updateLabels();
      }
      function clamp() {
        view.w = Math.max(MIN_W, Math.min(MAX_W, view.w));
        view.h = view.w * (base.h / base.w);
        view.x = Math.max(base.x, Math.min(base.x + base.w - view.w, view.x));
        view.y = Math.max(base.y, Math.min(base.y + base.h - view.h, view.y));
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
    });
  }
  initZoom();
})();
