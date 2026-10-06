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

  // Status | Use (docs/briefs/site-ux.md follow-up, sitegen/pages.py's view_toggle()): the
  // control only exists on the home and site pages (never a record page's own locator map), so
  // its absence is exactly the scope switch -- no toggle on the page means mode can never be
  // anything but 'status', whatever the URL says. Lives in the map's own top-left .map-controls
  // overlay, stacked with the tenant toggle (build.py's map_controls()) -- one lookup here still
  // works since a page only ever carries one of these regardless of which map-frame it sits in.
  var toggle = document.querySelector('.color-toggle');
  var viewParams = new URLSearchParams(window.location.search);
  // Satellite layer (docs/briefs/satellite-layer.md): satData is this page's one satellite-capable
  // map (the home overview or a site's own map -- never a record locator map, which carries no
  // .pp-imagery-data island at all), parsed once. satOn round-trips through ?sat=1, but only when
  // this page actually has imagery to show for it -- a URL copied from a page that does, pasted
  // onto one that doesn't, must not leave the site claiming a satellite view with nothing behind
  // it. 'none' (the third color-toggle segment) only ever applies with satellite on; a URL with
  // view=none but no sat=1 falls back to Status, same as turning satellite off while None is
  // selected does at runtime (requirement in the brief).
  var satEl = document.querySelector('.pp-imagery-data');
  var satData = satEl && JSON.parse(satEl.textContent);
  var satToggle = document.querySelector('.satellite-toggle');
  var satOn = !!(satData && viewParams.get('sat') === '1');
  var requestedView = viewParams.get('view');
  var mode = requestedView === 'use' ? 'use' : (requestedView === 'none' && satOn ? 'none' : 'status');
  if (!toggle) mode = 'status';
  var SAT_NONE_COLOR = '#ffffff';
  var SAT_NEARBY_COLOR = '#8a63b3'; // pages.py's NEARBY_COLOR
  // Satellite parcel paint (owner request 2026-10-04): a translucent fill of the category colour,
  // a constant-pixel stroke in the same colour, and a dark casing under that stroke so it reads on
  // light roofs and dark water alike. Widths are screen pixels (vector-effect: non-scaling-stroke,
  // set on every shape by pages.py's record_shape()), so they hold at every zoom.
  var SAT_STROKE = 2.2, SAT_NONE_STROKE = 1.5, SAT_CASING_EXTRA = 3, SAT_CASING = '#0f1618';
  var SAT_FILL_OPACITY = 0.3, SAT_FILL_OPACITY_APPROX = 0.14;

  function setLegendMode(m) {
    document.querySelectorAll('[data-legend-mode]').forEach(function (el) {
      el.hidden = el.getAttribute('data-legend-mode') !== m;
    });
  }
  // A parcel's tenant highlight (site.css's .tenants-on a[data-tenants] .rec) recolours its
  // stroke brass -- fine in Status mode, where brass never means anything else on the map, but in
  // Use mode that same brass would read as a sixth category that doesn't exist (owner decision
  // 2026-09-27, 4th round: brass stays reserved for interaction/tenants, never a parcel's own
  // colour). This class is what site.css's selector excludes; the tenant markers themselves are
  // unaffected, only a highlighted parcel's own outline.
  function setMapModeClass(m) {
    document.querySelectorAll('.pp-map').forEach(function (svg) {
      svg.classList.toggle('mode-use', m === 'use');
      svg.classList.toggle('mode-none', m === 'none');
    });
  }
  // Use is a clean single-variable map now (owner decision 2026-09-28, 9th round): it no longer
  // encodes status at all, so the slider, Play and the progress chart -- all of them status/time
  // controls -- have nothing left to drive in Use mode. sitegen/pages.py marks each one
  // data-view-mode="status" (the timeline's own controls/track, and home's .tracker-curve); the
  // timeline's one-line Use-mode note is the only data-view-mode="use" element. slider.value is
  // never touched here, so switching back to Status resumes at the same month it was on. None
  // reads as "status" here -- satellite's None colour is a separate axis from the timeline (it
  // still follows the slider, same as Status; only Use has nothing left for the timeline to show).
  function setViewVisibility(m) {
    var useOnly = m === 'use';
    document.querySelectorAll('[data-view-mode]').forEach(function (el) {
      el.hidden = (el.getAttribute('data-view-mode') === 'use') !== useOnly;
    });
  }
  // A timeline tick is a status event (sitegen/pages.py's timeline()), so its own colour clashes
  // with satellite's None palette (owner decision 2026-09-28) -- repainted neutral grey there, and
  // back to its own status colour otherwise, from data-color/data-expected rather than the server-
  // rendered inline style, which is only ever the Status-mode version. Use mode needs no case here
  // any more: its ticks are simply hidden along with the rest of the timeline (setViewVisibility).
  var TICK_NEUTRAL = '#a9b3ae';
  function paintTicks(m) {
    document.querySelectorAll('.timeline .tick').forEach(function (el) {
      var color = m === 'none' ? TICK_NEUTRAL : el.getAttribute('data-color');
      el.style.borderColor = color;
      el.style.background = el.getAttribute('data-expected') === '1' ? 'transparent' : color;
    });
  }
  function setMode(m, pushUrl) {
    if (m === 'none' && !satOn) m = 'status'; // None only ever reachable with satellite on
    mode = m;
    setLegendMode(m);
    setToggleButtons(m);
    setMapModeClass(m);
    setViewVisibility(m);
    paintTicks(m);
    if (pushUrl) {
      var params = new URLSearchParams(window.location.search);
      if (m === 'use' || m === 'none') params.set('view', m); else params.delete('view');
      var qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
    }
    paint(+slider.value);
  }
  function setToggleButtons(m) {
    if (!toggle) return;
    toggle.querySelectorAll('[data-view-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-view-toggle') === m ? 'true' : 'false');
    });
  }
  if (toggle) {
    setLegendMode(mode);
    setToggleButtons(mode);
    setMapModeClass(mode);
    setViewVisibility(mode);
    paintTicks(mode);
    toggle.querySelectorAll('[data-view-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () { setMode(btn.getAttribute('data-view-toggle'), true); });
    });
  }

  // ---------- satellite layer (docs/briefs/satellite-layer.md) ----------
  // The map-unit box a NAIP frame is drawn at is that frame's own georeferenced box
  // (frame.box, from its returned extent -- sitegen/satellite_geo.py); which frame is
  // current follows the timeline slider, "the NAIP frame nearest to and not after the slider's
  // month" -- before the first NAIP year, the earliest frame stands in, labelled as such rather
  // than silently implied to be dated to whatever month the slider is on.
  function satYearForIndex(m) {
    if (m <= 0) return START - 1; // before the window's own start: before every NAIP year too
    if (m >= MAX) return END + 1; // the "<end>+" cap: at or after every NAIP year
    return START + Math.floor((m - 1) / 12);
  }
  function pickSatFrame(m) {
    if (!satData || !satData.frames.length) return null;
    // Use is now a single-variable map with no timeline of its own (owner change, 2026-09-28:
    // every parcel draws at full use colour, and the timeline hides while Use is active) --
    // satellite there always shows the latest committed frame, never the slider's position,
    // which the mode no longer has a UI for anyway. Status keeps following the slider exactly as
    // before; None is unchanged too (still slider-driven, same as Status).
    if (mode === 'use') return { frame: satData.frames[satData.frames.length - 1], before: false };
    var year = satYearForIndex(m), chosen = satData.frames[0], before = true;
    satData.frames.forEach(function (f) { if (f.year <= year) { chosen = f; before = false; } });
    return { frame: chosen, before: before };
  }
  function satCreditText(picked) {
    var d = picked.frame.date.split('-');
    var text = 'Imagery: USDA NAIP, flown ' + MON[+d[1] - 1] + ' ' + d[0];
    return picked.before ? text + ' (earliest available)' : text;
  }
  // One <image> per .pp-sat-slot (the home overview carries two, its wide and narrow variants;
  // a site page carries one) -- both placed at the same frame box, since both variants
  // share one underlying map-unit coordinate system (sitegen/geo.py's image_box_from_view).
  // Created once, on the first time satellite is turned on ("no imagery bytes until Satellite is
  // first turned on"); its href is only ever set to the one frame actually needed next.
  function ensureSatImages() {
    if (!satData || satData.imgEls) return;
    satData.imgEls = [];
    // Scoped to satFrame, not the whole document: basemap_uses() gives every .pp-map its own
    // .pp-sat-slot (a record's own mini-map on a site card included), but only the one map next
    // to this page's Satellite chip actually has imagery to show -- "Record mini-maps ... stay
    // unchanged" (the brief's own scope line).
    (satFrame || document).querySelectorAll('.pp-sat-slot').forEach(function (slot) {
      var img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      // Placed per frame in updateSatFrame() from that frame's own georeferenced box.
      img.setAttribute('preserveAspectRatio', 'none');
      img.setAttribute('filter', 'url(#sat-mute)');
      // The overview-frame backdrop (frame.back, build.py's satellite_map_assets()) goes in first, so
      // it sits beneath the sharp site frame; only maps whose frames carry one get it.
      if (satData.frames.some(function (f) { return f.back; })) {
        var back = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        back.setAttribute('preserveAspectRatio', 'none');
        back.setAttribute('filter', 'url(#sat-mute)');
        slot.appendChild(back);
        satData.backEls = (satData.backEls || []).concat(back);
      }
      slot.appendChild(img);
      satData.imgEls.push(img);
    });
  }
  // Sets each satellite <image>'s href to the frame the current slider position calls for --
  // "then only the year needed": switching to a year not seen yet this visit is the only thing
  // that fetches new imagery bytes; revisiting one already shown re-uses the browser's own cache.
  function updateSatFrame(m) {
    if (!satOn || !satData) return;
    var picked = pickSatFrame(m);
    if (!picked) return;
    var box = picked.frame.box;
    satData.imgEls.forEach(function (img) {
      if (img.getAttribute('href') !== picked.frame.href) img.setAttribute('href', picked.frame.href);
      img.setAttribute('x', box[0]); img.setAttribute('y', box[1]);
      img.setAttribute('width', box[2]); img.setAttribute('height', box[3]);
    });
    (satData.backEls || []).forEach(function (img) {
      var b = picked.frame.back;
      if (!b) { img.removeAttribute('href'); return; }
      if (img.getAttribute('href') !== b.href) img.setAttribute('href', b.href);
      img.setAttribute('x', b.box[0]); img.setAttribute('y', b.box[1]);
      img.setAttribute('width', b.box[2]); img.setAttribute('height', b.box[3]);
    });
    var text = satCreditText(picked);
    document.querySelectorAll('.sat-credit').forEach(function (el) { el.textContent = text; });
    document.querySelectorAll('[data-sat-credit-legend]').forEach(function (el) { el.textContent = text; });
  }
  function setSatOn(on, pushUrl) {
    if (on && !satData) return; // a ?sat=1 pasted onto a page with no imagery is not honoured
    satOn = on;
    // Scoped to satFrame, not the whole document: a mini site-card map on the home page (or any
    // other .pp-map sharing the page) has no imagery of its own and must never be left with its
    // basemap hidden (site.css's .mode-sat .pp-basemap-detail) and nothing to show in its place --
    // that half-applied state is exactly the "mix" the None/Status/Use toggle must never produce.
    (satFrame ? satFrame.querySelectorAll('.pp-map') : []).forEach(function (svg) { svg.classList.toggle('mode-sat', on); });
    if (satToggle) satToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    // The None colour segment only ever exists with satellite on (view_toggle()'s own note).
    var noneBtn = toggle && toggle.querySelector('[data-view-toggle="none"]');
    if (noneBtn) noneBtn.hidden = !on;
    document.querySelectorAll('.sat-credit').forEach(function (el) { el.hidden = !on; });
    if (pushUrl) {
      var params = new URLSearchParams(window.location.search);
      if (on) { params.set('sat', '1'); } else { params.delete('sat'); if (params.get('view') === 'none') params.delete('view'); }
      var qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
    }
    if (on) { ensureSatImages(); updateSatFrame(+slider.value); }
    if (!on && mode === 'none') setMode('status', false); else paint(+slider.value);
  }
  // Press-and-hold peek: holding the Satellite chip, or a *stationary* long-press on the map
  // itself, hides every overlay (site.css's .pp-peeking .pp-overlays) until release, so the photo
  // shows clean. HOLD_MS/MOVE_TOLERANCE_PX shared by the chip, the map and the keyboard
  // equivalent below, so all three feel like the same gesture at the same threshold.
  var HOLD_MS = 450, MOVE_TOLERANCE_PX = 8;
  function peekStart(frame) { if (frame) frame.classList.add('pp-peeking'); }
  function peekEnd(frame) { if (frame) frame.classList.remove('pp-peeking'); }
  // Wires a stationary-hold gesture onto `el` via pointer events (covers mouse, touch and pen
  // alike) without ever calling preventDefault/stopPropagation -- panning and pinch-zoom (wired
  // separately, further down this file) see every event exactly as before; a hold is only ever
  // detected, never intercepted. Movement past MOVE_TOLERANCE_PX before the hold threshold fires
  // cancels the pending peek outright (a pan never triggers it); movement after peeking has
  // already started ends the peek immediately, so dragging always reads as dragging.
  function wireHold(el, onStart, onEnd) {
    var timer = null, startX = 0, startY = 0, active = false;
    // Move/up/cancel are wired on window, not `el`, once a press actually starts: a real hold
    // often drifts a pixel or two off the source element (a small chip especially) without the
    // pointer being released, and el-scoped listeners would see that as pointerleave and end the
    // peek early. Movement is still measured against the press's own start point, so panning the
    // map or dragging off the chip still cancels/ends the hold exactly as before -- only where
    // that movement is observed from has changed, not the thresholds themselves.
    function onMove(ev) {
      if (Math.abs(ev.clientX - startX) <= MOVE_TOLERANCE_PX && Math.abs(ev.clientY - startY) <= MOVE_TOLERANCE_PX) return;
      release();
    }
    function release() {
      clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      if (active) { active = false; onEnd(); }
    }
    el.addEventListener('pointerdown', function (ev) {
      if (ev.isPrimary === false) return;
      startX = ev.clientX; startY = ev.clientY; active = false;
      clearTimeout(timer);
      timer = setTimeout(function () { active = true; onStart(); }, HOLD_MS);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
    });
  }
  if (satToggle) {
    satToggle.hidden = false; // no-JS keeps this chip hidden entirely (requirement in the brief)
    // Both the chip's own hold and the map's own long-press peek the *same* map -- the
    // .map-frame that sits next to this chip's .map-toolbar (build.py's map_toolbar()/site_map(),
    // always siblings under one shared container, on both the home overview and a site page).
    var satToolbar = satToggle.closest('.map-toolbar');
    var satFrame = satToolbar && satToolbar.parentElement && satToolbar.parentElement.querySelector('.map-frame');
    var chipWasHold = false;
    wireHold(satToggle, function () { chipWasHold = true; peekStart(satFrame); }, function () { peekEnd(satFrame); });
    satToggle.addEventListener('click', function () {
      if (chipWasHold) { chipWasHold = false; return; } // a hold-then-release never also toggles
      setSatOn(!satOn, true);
    });
    if (satFrame) wireHold(satFrame, function () { peekStart(satFrame); }, function () { peekEnd(satFrame); });
    // Keyboard equivalent (requirement: "holding a key while the chip has focus"): the button's
    // own activation keys, Enter and Space, held past the same HOLD_MS threshold peek instead of
    // toggling -- released quickly, they toggle as normal. Native activation is suppressed
    // (preventDefault) so it never fires its own click on top of this.
    var keyTimer = null, keyHeld = false;
    satToggle.addEventListener('keydown', function (ev) {
      if (ev.key !== ' ' && ev.key !== 'Enter') return;
      ev.preventDefault();
      if (ev.repeat) return;
      keyHeld = false;
      keyTimer = setTimeout(function () { keyHeld = true; peekStart(satFrame); }, HOLD_MS);
    });
    satToggle.addEventListener('keyup', function (ev) {
      if (ev.key !== ' ' && ev.key !== 'Enter') return;
      ev.preventDefault();
      clearTimeout(keyTimer);
      if (keyHeld) { keyHeld = false; peekEnd(satFrame); } else { setSatOn(!satOn, true); }
    });
  }
  setSatOn(satOn, false);

  // The value of the "jump to a year" <option> that covers index m: one option per calendar
  // year (its January index), so any month within a year snaps to that year's own option.
  function yearOptionFor(m) {
    if (m <= 0) return 0;
    if (m >= MAX) return MAX;
    return 1 + Math.floor((m - 1) / 12) * 12;
  }

  // Below 720px the timeline is no longer pinned to the top of the screen (audit F8: it took 21% of
  // a phone for the rest of the page). It sits in the page under the map it drives, like any other
  // block; once it has scrolled off the top, this one-line readout (site.css's .timeline-mini)
  // takes its place so the date being shown is still on screen, with a link back up to change it.
  // It only ever shows below 720px, and in Status mode (setViewVisibility: Use has no date).
  var miniDate = null;
  var fullTimeline = document.querySelector('.timeline');
  if (fullTimeline && 'IntersectionObserver' in window) {
    var mini = document.createElement('div');
    mini.className = 'timeline-mini';
    mini.setAttribute('data-view-mode', 'status');
    mini.innerHTML = '<div class="wrap"><span class="timeline-mini-date" aria-hidden="true"></span><a href="#timeline">Change date</a></div>';
    document.body.appendChild(mini);
    miniDate = mini.querySelector('.timeline-mini-date');
    new IntersectionObserver(function (entries) {
      var en = entries[entries.length - 1];
      mini.classList.toggle('is-away', !en.isIntersecting && en.boundingClientRect.bottom < 0);
    }).observe(fullTimeline);
  }

  // The satellite look of one shape: translucent category fill, a SAT_STROKE-px stroke in the same
  // colour, and a dark casing (a non-interactive twin of the shape drawn just beneath it, wider
  // by SAT_CASING_EXTRA px in total) so the stroke reads on light roofs and dark water alike.
  // The twin is created on first use and hidden again by paint() whenever satellite is off.
  // Over the photo every parcel paints at full strength: a record page's map dims every parcel but
  // its own (data-dim, 0.45) against the flat basemap, and that dimming left the satellite colours
  // washed out next to a site page's. The record's own brass outline still sets it apart.
  function satPaint(n, color, width, fillOpacity, dash, opacity) {
    n.setAttribute('fill', fillOpacity ? color : 'none');
    n.setAttribute('fill-opacity', fillOpacity);
    n.setAttribute('stroke', color);
    n.setAttribute('stroke-width', width);
    n.setAttribute('opacity', opacity);
    if (dash) n.setAttribute('stroke-dasharray', dash); else n.removeAttribute('stroke-dasharray');
    var cs = n.satCasing;
    if (!cs) {
      cs = n.cloneNode(false);
      cs.removeAttribute('data-id'); cs.removeAttribute('data-mode');
      cs.setAttribute('class', 'rec-casing');
      cs.setAttribute('fill', 'none');
      cs.setAttribute('stroke', SAT_CASING);
      cs.setAttribute('pointer-events', 'none');
      cs.setAttribute('aria-hidden', 'true');
      n.parentNode.insertBefore(cs, n);
      n.satCasing = cs;
    }
    cs.style.display = '';
    cs.setAttribute('stroke-width', width + SAT_CASING_EXTRA);
    cs.setAttribute('opacity', opacity);
    if (dash) cs.setAttribute('stroke-dasharray', dash); else cs.removeAttribute('stroke-dasharray');
  }

  function paint(m) {
    shapes.forEach(function (n) {
      var r = byId[n.getAttribute('data-id')];
      if (!r) {
        // A nearby (adjacent) project is left out of R.records on purpose, so it never takes a
        // status or use colour -- but over the photo its plain 1.8 px dashed outline all but
        // disappears, so on the satellite map it gets the same casing treatment in its own
        // fixed purple (grey in Use mode, matching site.css's .mode-use .rec.nearby). Off the
        // satellite map it is put back exactly as record_shape() rendered it.
        if (n.classList.contains('nearby')) {
          if (satOn && !!satFrame && n.closest('.map-frame') === satFrame) {
            satPaint(n, mode === 'use' ? '#a9b3ae' : SAT_NEARBY_COLOR, SAT_STROKE, 0, '5 3', '1');
          } else {
            if (n.satCasing) n.satCasing.style.display = 'none';
            n.removeAttribute('fill-opacity');
            n.setAttribute('stroke', SAT_NEARBY_COLOR); n.setAttribute('stroke-width', '1.8');
            n.setAttribute('stroke-dasharray', '5 3'); n.setAttribute('opacity', n.getAttribute('data-dim') || '1');
          }
        }
        return;
      }
      var a = statusAt(r, m);
      var outline = n.getAttribute('data-mode') === 'outline';
      // The hover tooltip (record_shape()'s own <title>, server-rendered once from the record's
      // fixed current status): kept in sync with the active colour mode, same as the shape's own
      // fill/stroke just below -- a record with no use category falls back to its status label
      // here too, matching the same fallback the colouring itself uses a few lines down.
      var titleEl = n.querySelector('title');
      if (titleEl) {
        titleEl.textContent = (mode === 'use' && r.useCategory)
          ? r.name + ' · ' + R.useLabels[r.useCategory]
          : r.name + ' · ' + R.labels[r.status];
      }
      // The link around the shape names it for assistive tech as "name, status" (sitegen/pages.py's
      // record_shape()); keep that in step with the month on the slider and the active colour mode,
      // the same words the tooltip above uses. Tenant count stays on the end, as rendered.
      var link = n.closest('a');
      if (link) {
        var word = (mode === 'use' && r.useCategory) ? R.useLabels[r.useCategory] : (a.s ? R.labels[a.s] : 'no dated status yet');
        var tn = +link.getAttribute('data-tenants') || 0;
        link.setAttribute('aria-label', r.name + ', ' + word.toLowerCase() + (a.expected && mode !== 'use' ? ' (expected)' : '') +
          (tn ? ' · ' + tn + (tn === 1 ? ' tenant' : ' tenants') : ''));
      }
      n.removeAttribute('stroke-dasharray');
      n.setAttribute('fill-opacity', '1');
      n.setAttribute('stroke-opacity', '1');
      n.setAttribute('stroke-width', outline ? '1.8' : '0.8');
      // Satellite only ever touches shapes on the one map its own chip sits next to. A mini
      // site-card map on the home page (or any other .pp-map sharing a page with a satellite-
      // capable one) has no imagery of its own and no chip of its own -- it must render exactly
      // as Status/Use already do, on its own, never a half-applied satellite outline with no
      // photo behind it and never a "None" it has no way to opt into. That's the one thing the
      // colour toggle must never produce: Status, Use or None, never a mix of them on the same
      // page at once.
      var sat = satOn && !!satFrame && n.closest('.map-frame') === satFrame;
      if (!sat) { if (n.satCasing) n.satCasing.style.display = 'none'; }
      var approx = r.confidence === 'approximate';
      // Satellite's None colour (docs/briefs/satellite-layer.md): a thin white outline with its
      // dark casing, no status or use signal at all, dashed exactly where the shape is
      // approximate -- the photo, not the parcel colour, carries the information here.
      if (sat && mode === 'none') {
        satPaint(n, SAT_NONE_COLOR, SAT_NONE_STROKE, 0, approx ? '4 3' : '', '1');
        return;
      }
      if (!a.s) {
        if (sat) { satPaint(n, '#a9b3ae', SAT_NONE_STROKE, 0, '2 2', '1'); return; }
        n.setAttribute('fill', 'rgba(169,179,174,0.06)'); n.setAttribute('stroke', '#7d8a8e'); n.setAttribute('stroke-dasharray', '2 2'); n.setAttribute('opacity', '1');
        return;
      }
      // With satellite on (Status or Use), a parcel is a translucent fill plus a casing-backed
      // stroke over the photo instead of the flat fill: the approximate-shape hatch would draw
      // over the photo, so a dashed stroke and a fainter fill stand in for it as the "this shape
      // is approximate" honesty marker (satPaint()).
      if (mode === 'use' && r.useCategory) {
        // A clean single-variable map (owner decision 2026-09-28, 9th round): every parcel shows
        // its use at full strength, regardless of status -- the validated palette (dataviz skill's
        // checker) only clears its CVD/normal-vision checks at full strength; the faint "planned"
        // strength this used to render at failed both, which made a mostly-planned site like Pier
        // 70 or Potrero unreadable. Thin stroke for the same sleekness as before; the honesty
        // markers (hatch, outline, dashed) are geometry/data-quality, not status, so they're
        // unaffected and still apply here exactly as in Status mode.
        var uc = R.useColors[r.useCategory];
        if (sat) {
          satPaint(n, uc, SAT_STROKE, outline ? 0 : (approx ? SAT_FILL_OPACITY_APPROX : SAT_FILL_OPACITY), approx ? '4 3' : '', '1');
          return;
        }
        n.setAttribute('fill', outline ? 'none' : (approx ? 'url(#h-use-' + r.useCategory + ')' : uc));
        n.setAttribute('stroke', (outline || approx) ? uc : '#0f1618');
        if (!outline) n.setAttribute('stroke-width', '0.6');
        n.setAttribute('opacity', n.getAttribute('data-dim') || '1');
      } else {
        var c = R.colors[a.s];
        if (sat) {
          satPaint(n, c, SAT_STROKE, outline ? 0 : (approx ? SAT_FILL_OPACITY_APPROX : SAT_FILL_OPACITY),
                   approx ? '4 3' : (a.expected ? '3 2' : ''), a.expected ? '0.62' : '1');
          return;
        }
        n.setAttribute('fill', outline ? 'none' : (approx ? 'url(#h-' + a.s + ')' : c));
        n.setAttribute('stroke', (outline || approx) ? c : '#0f1618');
        n.setAttribute('opacity', a.expected ? '0.62' : (n.getAttribute('data-dim') || '1'));
        if (a.expected) n.setAttribute('stroke-dasharray', '3 2');
      }
    });
    updateSatFrame(m);
    var counts = {};
    R.records.forEach(function (r) {
      var a = statusAt(r, m), k = a.s || 'nodate';
      counts['all:' + k] = (counts['all:' + k] || 0) + 1;
      counts[r.site + ':' + k] = (counts[r.site + ':' + k] || 0) + 1;
      if (r.useCategory) {
        counts['all:use:' + r.useCategory] = (counts['all:use:' + r.useCategory] || 0) + 1;
        counts[r.site + ':use:' + r.useCategory] = (counts[r.site + ':use:' + r.useCategory] || 0) + 1;
      }
    });
    document.querySelectorAll('[data-count]').forEach(function (el) {
      var n = counts[el.getAttribute('data-count')] || 0;
      el.textContent = n;
      // A map legend lists only what is on that map right now (design review B5): a row with a
      // count of 0 ("Being removed 0", "No dated status yet 0") is hidden, and comes back if the
      // timeline moves to a date where it applies. The home page's PROGRESS block is not a map
      // legend and keeps its zeros.
      var row = el.parentNode;
      if (row && row.tagName === 'SPAN' && el.closest('.legend[data-legend-mode]')) row.hidden = n === 0;
    });
    document.querySelectorAll('[data-bar]').forEach(function (el) {
      el.style.flexGrow = counts[el.getAttribute('data-bar')] || 0;
    });
    var label = windowLabel(m);
    var phase = m < TODAY ? 'Recorded history' : m === TODAY ? 'Today' : 'Expected';
    // readDate/readPhase (pp-date/pp-phase): part of timeline()'s own visible scrubber, absent
    // on a page that embeds record data and a slider without the rest of that widget (/near/,
    // docs/briefs/near-me.md) -- it wants the Status/Use/Satellite toggle paint() drives, pinned
    // at today with no time-travel UI of its own, not a second, redundant date readout.
    if (readDate) readDate.textContent = label;
    if (readPhase) readPhase.textContent = phase;
    if (miniDate) miniDate.textContent = label + ' · ' + phase;
    slider.setAttribute('aria-valuetext', label + ', ' + phase);
    if (yearJump) yearJump.value = String(yearOptionFor(m));
  }

  // play (pp-play): also part of timeline()'s own widget, absent on /near/ for the same reason
  // readDate/readPhase are above -- guarded the same way rather than assuming every page that
  // embeds record data and a slider also renders the full scrubber.
  function stop() { if (timer) { clearInterval(timer); timer = null; } if (play) { play.setAttribute('aria-pressed', 'false'); play.querySelector('span').textContent = 'Play'; } }
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
  if (play) play.addEventListener('click', function () {
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
  if (toggle) toggle.hidden = false;
  paint(+slider.value);
})();

// Pan and zoom (the .pp-zoomable svg; sitegen/pages.py's site_map(zoomable=True) on a site or
// record page's own map, and overview_map(zoomable=True) on /near/'s local map, docs/briefs/
// near-me.md). Manipulates the SVG viewBox directly: no map library, no tiles, no external
// requests (docs/briefs/site-ux.md). Degrades to the fitted view with JS off. Its own IIFE,
// not gated on the timeline's #pp-record/#pp-slider above: a record page and /near/ carry
// neither.
(function () {
  function svgEl(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }
  function initZoom() {
    document.querySelectorAll('.pp-zoomable').forEach(function (svg) {
      var frame = svg.closest('.map-frame');
      var controls = frame ? frame.querySelector('.zoom-controls') : null;
      var parts = (svg.getAttribute('viewBox') || '0 0 100 100').split(' ').map(Number);
      var base = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
      var view = { x: base.x, y: base.y, w: base.w, h: base.h };
      // Reassigned below, once, if this map carries tenant markers (docs/briefs/
      // tenant-markers.md) -- a no-op otherwise, so apply() can call it unconditionally.
      var updateTenantMarkers = function () {};
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
      // Landmark names (sitegen/pages.py's landmark_layer(), class landmark-label): same deal as
      // the site-name pins above -- always visible, counter-scaled so "ORACLE PARK" reads at a
      // constant size rather than growing with the shape as the map zooms in.
      var landmarkLabels = Array.prototype.map.call(svg.querySelectorAll('.landmark-label'), function (label) {
        return { el: label, fontSize: parseFloat(label.getAttribute('font-size')) || 9,
                 strokeWidth: parseFloat(label.getAttribute('stroke-width')) || 3 };
      });

      // The numbered site badges themselves (overview_map()'s <a class="site-pin">: a circle and
      // its number), not just their name labels above: sized to read at the overview's own fitted
      // scale, they ballooned into a giant disc once the map zoomed in. Counter-scaled about each
      // badge's own centre by the same view.w / base.w factor, so the badge holds a constant
      // on-screen size while it stays pinned to the site it marks.
      var pinBadges = Array.prototype.map.call(svg.querySelectorAll('a.site-pin'), function (a) {
        var c = a.querySelector('circle');
        return { el: a, cx: c ? parseFloat(c.getAttribute('cx')) || 0 : 0, cy: c ? parseFloat(c.getAttribute('cy')) || 0 : 0 };
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
        landmarkLabels.forEach(function (entry) {
          entry.el.style.fontSize = (entry.fontSize * scale).toFixed(2) + 'px';
          entry.el.style.strokeWidth = (entry.strokeWidth * scale).toFixed(2) + 'px';
        });
        pinBadges.forEach(function (entry) {
          entry.el.setAttribute('transform', 'translate(' + entry.cx + ' ' + entry.cy + ') scale(' + scale.toFixed(4) +
            ') translate(' + (-entry.cx) + ' ' + (-entry.cy) + ')');
        });
      }

      function apply() {
        svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
        updateLabels();
        updateTenantMarkers();
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

      var pointers = {}, dragStart = null, pinchStart = null, dragging = false;
      // Below this many px of movement, a single pointer is still a click/tap, not a drag --
      // matters because setPointerCapture retargets the click that follows to the captured
      // element (the svg itself), so a parcel's own <a> never sees it and its page never
      // opens. Deferring capture (and any view change) until real movement is seen keeps a
      // plain click on a parcel link working, while an actual drag still pans as before.
      var DRAG_THRESHOLD = 4;
      svg.addEventListener('pointerdown', function (e) {
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ids = Object.keys(pointers);
        if (ids.length === 1) {
          dragStart = { clientX: e.clientX, clientY: e.clientY, view: { x: view.x, y: view.y } };
          dragging = false;
        } else if (ids.length === 2) {
          dragStart = null;
          // Two pointers down is unambiguously a pinch, never a click -- capture both right away.
          ids.forEach(function (id) { svg.setPointerCapture(+id); });
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
          if (!dragging) {
            if (Math.hypot(e.clientX - dragStart.clientX, e.clientY - dragStart.clientY) < DRAG_THRESHOLD) return;
            dragging = true;
            svg.setPointerCapture(e.pointerId);
          }
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
        dragStart = null; pinchStart = null; dragging = false;
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

      // The "show tenants" toggle and its markers (docs/briefs/tenant-markers.md): a single chip
      // in the toolbar row above the map (sitegen/build.py's map_toolbar()), rendered hidden by
      // sitegen/build.py; the pills and per-tenant markers themselves are built entirely here
      // from the sibling JSON island (sitegen/pages.py's tenant_marker_json()) into the empty
      // <g class="tenant-markers"> site_map() left in the svg -- so with JavaScript off the
      // toggle stays hidden and the page's own tenant list, already in the markup, is the only
      // way to see it. The toolbar is a sibling of .map-frame, not a descendant (owner decision
      // 2026-09-27: the map canvas itself carries no overlay but the zoom buttons), so this reads
      // from frame.parentElement exactly like legendCaption below.
      var tenantChip = frame && frame.parentElement ? frame.parentElement.querySelector('.tenant-toggle') : null;
      var dataEl = frame ? frame.querySelector('.pp-tenant-data') : null;
      var card = frame ? frame.querySelector('[data-tenant-card]') : null;
      var legendCaption = frame && frame.parentElement ? frame.parentElement.querySelector('[data-tenant-legend]') : null;
      var markersLayer = svg.querySelector('.tenant-markers');
      var DATA = null;
      if (dataEl) { try { DATA = JSON.parse(dataEl.textContent); } catch (err) { DATA = null; } }
      var parcelIds = DATA ? Object.keys(DATA.parcels) : [];

      if (tenantChip && markersLayer && DATA && parcelIds.length) {
        tenantChip.hidden = false;
        var SPLIT_PX = 120; // a parcel must read at least this wide on screen to split into markers
        // A marker's diameter grows from MIN_MARKER_PX (right at the split threshold) up to
        // MAX_MARKER_PX as the parcel keeps getting bigger on screen, then holds -- there's more
        // room to tap a bigger target once you've zoomed in further, so it shouldn't stay pinned
        // to its smallest comfortable size forever. MAX_MARKER_PX matches the usual ~44px
        // minimum touch-target guideline.
        var MIN_MARKER_PX = 26, MAX_MARKER_PX = 44, GROW_OVER_PX = 200;
        var GRID_SPACING = 2.6; // grid cell spacing, in multiples of the marker's own live radius
        var MIN_RADIUS_SCALE = 0.6; // never shrink a marker below this fraction of its target size
        var STATUS_WORD = { open: 'Open', announced: 'Announced', closed: 'Closed' };
        var openMarker = null, allMarkers = [];

        var parcels = parcelIds.map(function (id) {
          var d = DATA.parcels[id];
          var n = d.tenants.length;
          var cols = Math.max(1, Math.ceil(Math.sqrt(n)));
          var rows = Math.ceil(n / cols);
          // bboxFit: the largest grid-cell spacing this parcel's own footprint can offer
          // (data-space, fixed regardless of zoom) -- caps how big updateTenantMarkers() can grow
          // this parcel's markers before they'd spill past its own outline into a neighbour.
          var shape = svg.querySelector('.rec[data-id="' + id + '"]');
          var bb = shape && shape.getBBox ? shape.getBBox() : null;
          var bboxFit = (bb && bb.width && bb.height) ? Math.min(bb.width, bb.height) / (Math.max(cols, rows) + 0.6) : Infinity;
          // overview_map() (/near/) draws its shapes inside a rotate(-90) group, so getBBox()'s
          // width/height are the parcel's on-screen height/width -- read the right side for the
          // "wide enough on screen to split" test. bboxFit above takes the min of the two, which
          // a 90-degree turn leaves unchanged.
          var bboxScreenW = bb ? (DATA.rotated ? bb.height : bb.width) : 0;
          var markers = d.tenants.map(function (t, i) {
            var g = svgEl('g');
            g.setAttribute('class', 'tenant-marker');
            g.setAttribute('data-status', t.status);
            g.setAttribute('tabindex', '0');
            g.setAttribute('role', 'button');
            g.setAttribute('aria-label', t.name + ', ' + (STATUS_WORD[t.status] || t.status));
            var circle = svgEl('circle');
            circle.setAttribute('class', 'tenant-marker-circle');
            g.appendChild(circle);
            var use = svgEl('use');
            use.setAttribute('class', 'tenant-glyph');
            use.setAttribute('href', '#tg-' + t.catKey);
            g.appendChild(use);
            markersLayer.appendChild(g);
            // col/row: this marker's fixed grid cell; cx/cy (its live screen anchor, kept current
            // by updateTenantMarkers() below) start at the parcel's own centroid and are only
            // ever read once positioned.
            var entry = { parcelId: id, col: i % cols, row: Math.floor(i / cols), cx: d.cx, cy: d.cy,
                         t: t, el: g, circle: circle, use: use, record: d.record };
            g.addEventListener('click', function () { entry.el.focus(); openCard(entry); });
            g.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(entry); }
              else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault(); e.stopPropagation();
                var dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
                var i2 = allMarkers.indexOf(entry);
                var next = allMarkers[(i2 + dir + allMarkers.length) % allMarkers.length];
                if (next) { next.el.focus(); openCard(next); }
              }
            });
            return entry;
          });
          allMarkers = allMarkers.concat(markers);

          var pillG = svgEl('g');
          pillG.setAttribute('class', 'tenant-pill');
          pillG.setAttribute('tabindex', '0');
          pillG.setAttribute('role', 'button');
          pillG.setAttribute('aria-label', n + (n === 1 ? ' tenant' : ' tenants') + ' at ' + d.recordName + ', press to zoom in');
          var rect = svgEl('rect');
          rect.setAttribute('class', 'tenant-pill-bg');
          pillG.appendChild(rect);
          var text = svgEl('text');
          text.setAttribute('class', 'tenant-pill-count');
          text.setAttribute('text-anchor', 'middle');
          pillG.appendChild(text);
          markersLayer.appendChild(pillG);
          var pill = { el: pillG, rect: rect, text: text, ox: 0, oy: 0, hide: false, mergedCount: n };
          var p = { id: id, cx: d.cx, cy: d.cy, count: n, cols: cols, rows: rows, record: d.record, split: false,
                   bboxWidth: bboxScreenW, bboxFit: bboxFit, markers: markers, pill: pill };
          pillG.addEventListener('click', function () { zoomToParcel(p); });
          pillG.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoomToParcel(p); }
          });
          return p;
        });

        function zoomToParcel(p) {
          var w = Math.max(MIN_W, base.w * 0.16);
          if (svg.ppSetView) svg.ppSetView(p.cx, p.cy, w);
          else { view.x = p.cx - view.w / 2; view.y = p.cy - view.h / 2; clamp(); apply(); }
        }

        function pillMetrics(count, factor) {
          var fs = DATA.pillFs * factor;
          var w = fs * (1.7 + String(count).length * 0.95), h = fs * 1.9;
          return { fs: fs, w: w, h: h };
        }

        function resolvePillOverlap(factor, pxPerUnit) {
          var visible = parcels.filter(function (p) { return !p.split; });
          visible.forEach(function (p) {
            p.metrics = pillMetrics(p.count, factor);
            p.pill.ox = 0; p.pill.oy = 0; p.pill.hide = false; p.pill.mergedCount = p.count;
          });
          if (pxPerUnit) {
            var order = visible.slice().sort(function (a, b) { return b.count - a.count; });
            var placed = [];
            order.forEach(function (p) {
              var m = p.metrics, placedOk = false;
              var candidates = [[0, 0]];
              var ring = (m.w + m.h) / 2 + 8;
              for (var s = 0; s < 8; s++) {
                var ang = (s / 8) * Math.PI * 2;
                candidates.push([Math.cos(ang) * ring / pxPerUnit, Math.sin(ang) * ring / pxPerUnit]);
              }
              for (var c = 0; c < candidates.length && !placedOk; c++) {
                var ox = candidates[c][0], oy = candidates[c][1];
                var sx = (p.cx + ox) * pxPerUnit, sy = (p.cy + oy) * pxPerUnit;
                var collide = placed.some(function (q) {
                  var qx = (q.cx + q.pill.ox) * pxPerUnit, qy = (q.cy + q.pill.oy) * pxPerUnit;
                  return Math.abs(sx - qx) < (m.w + q.metrics.w) / 2 + 6 && Math.abs(sy - qy) < (m.h + q.metrics.h) / 2 + 6;
                });
                if (!collide) { p.pill.ox = ox; p.pill.oy = oy; placedOk = true; }
              }
              if (placedOk) { placed.push(p); return; }
              var nearest = null, nearestDist = Infinity;
              placed.forEach(function (q) {
                var d2 = Math.hypot(p.cx - q.cx, p.cy - q.cy);
                if (d2 < nearestDist) { nearestDist = d2; nearest = q; }
              });
              if (nearest) { nearest.pill.mergedCount += p.count; p.pill.hide = true; }
              else { placed.push(p); }
            });
          }
          visible.forEach(function (p) {
            var pill = p.pill;
            pill.el.style.display = pill.hide ? 'none' : '';
            if (pill.hide) return;
            var m = p.metrics, cx = p.cx + pill.ox, cy = p.cy + pill.oy;
            pill.rect.setAttribute('x', (cx - m.w / 2).toFixed(1));
            pill.rect.setAttribute('y', (cy - m.h / 2).toFixed(1));
            pill.rect.setAttribute('width', m.w.toFixed(1));
            pill.rect.setAttribute('height', m.h.toFixed(1));
            pill.rect.setAttribute('rx', (m.h / 2).toFixed(1));
            pill.text.setAttribute('x', cx.toFixed(1));
            pill.text.setAttribute('y', (cy + m.fs * 0.34).toFixed(1));
            pill.text.setAttribute('font-size', m.fs.toFixed(2));
            pill.text.textContent = pill.mergedCount;
          });
        }

        function positionCard(entry) {
          if (!card || !svg.getScreenCTM) return;
          var ctm = svg.getScreenCTM();
          if (!ctm) return;
          var pt = svg.createSVGPoint();
          pt.x = entry.cx; pt.y = entry.cy;
          var screenPt = pt.matrixTransform(ctm);
          var frameRect = frame.getBoundingClientRect();
          var x = screenPt.x - frameRect.left, y = screenPt.y - frameRect.top;
          var dock = frameRect.width > 0 && frameRect.width < 480;
          card.classList.toggle('tenant-card-dock', dock);
          if (dock) { card.style.left = ''; card.style.top = ''; return; }
          var cw = card.offsetWidth || 240, ch = card.offsetHeight || 150;
          var flipX = x + cw + 16 > frameRect.width;
          var flipY = y - ch - 14 < 0;
          card.style.left = Math.max(8, flipX ? x - cw - 12 : x + 12) + 'px';
          card.style.top = Math.max(8, flipY ? y + 14 : y - ch - 14) + 'px';
        }

        function closeCard() {
          if (!card || card.hidden) return;
          card.classList.remove('tenant-card-open');
          card.hidden = true;
          if (openMarker) { openMarker.el.classList.remove('tenant-marker-open'); openMarker = null; }
        }

        function openCard(entry) {
          if (!card) return;
          if (openMarker) openMarker.el.classList.remove('tenant-marker-open');
          openMarker = entry;
          entry.el.classList.add('tenant-marker-open');
          var t = entry.t;
          var media = card.querySelector('[data-tenant-card-media]');
          if (t.photo) { media.hidden = false; media.innerHTML = '<img src="' + t.photo.src + '" alt="" style="object-position:' + t.photo.pos + '">'; }
          else { media.hidden = true; media.innerHTML = ''; }
          card.querySelector('[data-tenant-card-name]').textContent = t.name;
          card.querySelector('[data-tenant-card-meta]').textContent = [t.categoryLabel, STATUS_WORD[t.status] || t.status, t.dateLabel].filter(Boolean).join(' · ');
          var loc = card.querySelector('[data-tenant-card-loc]');
          if (t.unit) { loc.hidden = false; loc.textContent = t.unit; } else { loc.hidden = true; }
          var src = card.querySelector('[data-tenant-card-source]');
          if (t.source) { src.hidden = false; src.href = t.source; } else { src.hidden = true; }
          // #tenant-<slug> (sitegen/pages.py's tenant_item(), the same row id the Retail list's
          // own tenants carry) lands on this tenant's own row, not just the top of its record
          // page -- and turns tapping a tenant on the record you're already viewing into a
          // same-page scroll instead of a same-URL reload that looks like nothing happened.
          card.querySelector('[data-tenant-card-open]').setAttribute('href', '/parcels/' + entry.record + '/#tenant-' + t.slug);
          card.hidden = false;
          positionCard(entry);
          requestAnimationFrame(function () { card.classList.add('tenant-card-open'); positionCard(entry); });
        }

        var closeBtn = card ? card.querySelector('[data-tenant-card-close]') : null;
        if (closeBtn) closeBtn.addEventListener('click', function () { var m = openMarker; closeCard(); if (m) m.el.focus(); });
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && card && !card.hidden) { var m = openMarker; closeCard(); if (m) m.el.focus(); }
        });
        document.addEventListener('pointerdown', function (e) {
          if (card && !card.hidden && !card.contains(e.target) && !markersLayer.contains(e.target)) closeCard();
        }, true);

        function setTenantsOn(on) {
          svg.classList.toggle('tenants-on', on);
          tenantChip.setAttribute('aria-pressed', on ? 'true' : 'false');
          if (legendCaption) legendCaption.hidden = !on;
          if (!on) closeCard();
        }
        // Each map flips from its own state, not the chip's aria-pressed: /near/ carries two maps
        // (wide and compact) sharing the one chip, and the second listener would otherwise read
        // the first one's already-flipped value and switch its own map back off.
        tenantChip.addEventListener('click', function () { setTenantsOn(!svg.classList.contains('tenants-on')); });

        updateTenantMarkers = function () {
          var factor = view.w / base.w;
          var pxPerUnit = svg.clientWidth ? svg.clientWidth / view.w : 0;
          parcels.forEach(function (p) {
            var parcelPx = pxPerUnit * p.bboxWidth;
            var split = pxPerUnit > 0 && parcelPx >= SPLIT_PX;
            if (p.split && !split && openMarker && openMarker.parcelId === p.id) closeCard();
            p.split = split;
            p.pill.el.style.display = split ? 'none' : '';
            if (!split) {
              p.markers.forEach(function (m) { m.el.style.display = 'none'; });
              return;
            }
            // Grow the target diameter from MIN_MARKER_PX (right at the split threshold) toward
            // MAX_MARKER_PX as the parcel keeps getting bigger on screen, then hold -- easier to
            // tap once there's room, instead of staying pinned to its smallest size forever.
            var growT = pxPerUnit > 0 ? Math.max(0, Math.min(1, (parcelPx - SPLIT_PX) / GROW_OVER_PX)) : 0;
            var targetPxR = (MIN_MARKER_PX + growT * (MAX_MARKER_PX - MIN_MARKER_PX)) / 2;
            var targetDataR = pxPerUnit > 0 ? targetPxR / pxPerUnit : 0;
            // Clamp down to what this parcel's own footprint can fit its tenant count without
            // spilling into a neighbour (p.bboxFit, set once from the shape's own bbox), never
            // below MIN_RADIUS_SCALE of the target so the glyph stays legible on a packed parcel.
            var maxByBbox = p.bboxFit / GRID_SPACING;
            var pr = Math.max(targetDataR * MIN_RADIUS_SCALE, Math.min(targetDataR, maxByBbox));
            var gap = pr * GRID_SPACING;
            p.markers.forEach(function (m) {
              m.el.style.display = '';
              var mx = p.cx + (m.col - (p.cols - 1) / 2) * gap, my = p.cy + (m.row - (p.rows - 1) / 2) * gap;
              m.cx = mx; m.cy = my;
              m.el.setAttribute('transform', 'translate(' + mx.toFixed(2) + ' ' + my.toFixed(2) + ')');
              m.circle.setAttribute('r', pr.toFixed(2));
              // The ring's own stroke-width (site.css's --mk) has to scale with the circle's
              // radius too, not stay a fixed size -- a fixed width would swallow a small
              // marker's fill whole and barely register on a large one.
              m.circle.style.setProperty('--mk', (pr * 0.12).toFixed(3));
              // Each glyph is authored on a 24x24 grid centred at (12,12) (sitegen/pages.py's
              // TENANT_CATEGORY_GLYPHS) -- translate that centre onto the marker's own local
              // origin (0,0) before scaling it down to fit inside the circle.
              m.use.setAttribute('transform', 'scale(' + (pr * 0.09).toFixed(3) + ') translate(-12 -12)');
            });
          });
          resolvePillOverlap(factor, pxPerUnit);
          if (openMarker && card && !card.hidden) positionCard(openMarker);
        };
        updateTenantMarkers();
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
    from: form.querySelector('#cf-from'), to: form.querySelector('#cf-to'), record: form.querySelector('#cf-record'),
    datetype: Array.prototype.slice.call(form.querySelectorAll('input[name="datetype"]'))
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
             from: params.get('from') || '', to: params.get('to') || '', record: params.get('record') || '',
             datetype: params.get('datetype') === 'added' ? 'added' : 'event' };
  }
  function applyToFields(v) {
    fields.site.value = v.site;
    fields.category.forEach(function (cb) { cb.checked = v.category.indexOf(cb.value) !== -1; });
    fields.from.value = v.from; fields.to.value = v.to;
    if (fields.record) fields.record.value = v.record;
    fields.datetype.forEach(function (r) { r.checked = r.value === v.datetype; });
  }
  function currentValues() {
    var checkedType = fields.datetype.filter(function (r) { return r.checked; })[0];
    return { site: fields.site.value, category: fields.category.filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; }),
             from: fields.from.value, to: fields.to.value, record: fields.record ? fields.record.value : '',
             datetype: checkedType ? checkedType.value : 'event' };
  }
  function matches(li, v) {
    if (v.site && li.getAttribute('data-site') !== v.site) return false;
    if (v.record && li.getAttribute('data-record') !== v.record) return false;
    if (v.category.length && v.category.indexOf(li.getAttribute('data-category')) === -1) return false;
    // "When it happened" (default) reads data-date (the event date, falling back to the added
    // date when none was recorded); "When we recorded it" reads data-added-date instead
    // (docs/briefs/dates-and-closed.md).
    var d = li.getAttribute(v.datetype === 'added' ? 'data-added-date' : 'data-date');
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
    if (resetBtn) resetBtn.hidden = !(v.site || v.category.length || v.from || v.to || v.record || v.datetype !== 'event');
    if (categorySummary) categorySummary.textContent = categoryLabel(v.category.length);
    var params = new URLSearchParams();
    if (v.site) params.set('site', v.site);
    v.category.forEach(function (c) { params.append('category', c); });
    if (v.from) params.set('from', v.from);
    if (v.to) params.set('to', v.to);
    if (v.record) params.set('record', v.record);
    if (v.datetype !== 'event') params.set('datetype', v.datetype);
    var qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  applyToFields(readParams());
  filter();
  form.addEventListener('submit', function (e) { e.preventDefault(); filter(); });
  [fields.site].concat(fields.category, [fields.from, fields.to], fields.datetype).forEach(function (el) {
    el.addEventListener('change', filter);
  });
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      applyToFields({ site: '', category: [], from: '', to: '', record: '', datetype: 'event' });
      filter();
    });
  }
})();

// The .box pattern (docs/briefs/box-pattern.md): a single-select category chip row, a lead row
// (Changes and Costs only -- the list's own first item, both already sorted newest-first) shown
// while the box is collapsed, and a full-width bar that toggles between collapsed and expanded.
// Server-rendered markup always shows the complete list with the chip row as plain text and the
// bar hidden, so this only ever upgrades in place -- a visitor with JavaScript off keeps the
// full, unfiltered list. Whether a box gets a bar at all is a server-side call (pages.py's
// box_bar(), against its own threshold -- Costs uses 1, not the shared BOX_THRESHOLD, so it
// still collapses past a single entry): this only ever checks whether that markup exists, never
// re-derives the threshold itself, so the two can't drift out of sync with each other.
(function () {
  document.querySelectorAll('.box[data-total]').forEach(function (box) {
    var count = parseInt(box.getAttribute('data-total'), 10) || 0;
    // data-lead: how many of the list's own first items stay visible while collapsed (1 for Changes
    // and Costs; Records keeps 3).
    var leadCount = parseInt(box.getAttribute('data-lead'), 10) || 0;
    var lead = leadCount > 0;
    var list = box.querySelector('.box-list');
    if (!list) return;
    var items = Array.prototype.slice.call(list.querySelectorAll('[data-box-item]'));
    // The lead row (docs/briefs/box-pattern.md): Changes marks its own pick explicitly
    // (pages.py's lead_entry() skips correction/coverage rows, which can otherwise sort more
    // recent than the row actually worth leading with) -- Costs has no such row to skip, so its
    // already-sorted-newest-first list's own first item stands in.
    var leadEls = list.querySelector('[data-box-lead]') ? [list.querySelector('[data-box-lead]')] : items.slice(0, leadCount);
    var tail = list.querySelector('[data-box-tail]');
    // A preview (a site's Records box, pages.py's record_preview_list()): its own short list of
    // example rows, shown instead of the full list while collapsed with no chip selected. It ships
    // hidden, so with JavaScript off only the full list shows.
    var preview = list.querySelector('[data-box-preview]');
    var previewCount = preview ? preview.querySelectorAll('li').length : 0;
    var allLabel = box.getAttribute('data-all-label') || '';
    var bar = box.querySelector('.bx-bar');
    var status = box.querySelector('[data-box-status]');
    var chips = box.querySelector('.bx-chips');
    var chipButtons = chips ? Array.prototype.slice.call(chips.querySelectorAll('button.bx-chip')) : [];
    var hasBar = !!bar;

    // Upgrade the chip row in place: reveal the tappable buttons, hide the plain-text counts
    // they stand in for with JavaScript off.
    if (chips) {
      Array.prototype.slice.call(chips.querySelectorAll('span.bx-chip')).forEach(function (el) { el.hidden = true; });
      chipButtons.forEach(function (el) { el.hidden = false; });
    }

    var activeCat = '';
    // An under-threshold box has no bar and so no collapsed state at all -- chips still narrow
    // it, but there's nothing to "expand" back out of.
    var expanded = !hasBar;

    // A closed tenant (data-status="closed", Retail only -- docs/briefs/dates-and-closed.md)
    // never counts toward a chip's count, the header count or the bar's "of N": those are all
    // current-tenant (open/announced) figures. No other box's items carry data-status at all,
    // so isClosed() is always false there and every count below is unaffected.
    function isClosed(el) { return el.getAttribute('data-status') === 'closed'; }
    function itemCount(cat) {
      return items.filter(function (el) { return el.getAttribute('data-category') === cat && !isClosed(el); }).length;
    }
    function chipLabel(cat) {
      var btn = chipButtons.filter(function (b) { return b.getAttribute('data-cat') === cat; })[0];
      return btn ? btn.getAttribute('data-label') : '';
    }
    function render() {
      var shown = 0;
      var previewing = !!preview && !activeCat && !expanded;
      if (preview) preview.hidden = !previewing;
      if (previewing) shown = previewCount;
      items.forEach(function (el) {
        var ok = activeCat ? el.getAttribute('data-category') === activeCat
                            : (expanded || (!previewing && lead && leadEls.indexOf(el) !== -1));
        el.hidden = !ok;
        if (ok && !isClosed(el)) shown++;
      });
      // The full list's own top border would sit under the preview as an empty rule.
      var fullList = list.querySelector('#' + box.id + '-list');
      if (fullList && preview) fullList.hidden = previewing;
      if (tail) tail.hidden = !(expanded || activeCat);
      // The Closed group's own count follows the same filter as everything else (previously it
      // stayed a static server-rendered number regardless of which chip was active): shown with
      // its full count when no chip is selected, narrowed to just the active category's closed
      // tenants when one is, and hidden entirely once that leaves nothing to show.
      list.querySelectorAll('.tenant-group, .tenant-closed').forEach(function (g) {
        var visible = g.querySelectorAll('[data-box-item]:not([hidden])').length;
        g.hidden = visible === 0;
        if (g.classList.contains('tenant-closed')) {
          var summary = g.querySelector('summary');
          if (summary) summary.textContent = 'Closed (' + visible + ')';
        }
      });
      chipButtons.forEach(function (btn) {
        btn.setAttribute('aria-pressed', btn.getAttribute('data-cat') === activeCat ? 'true' : 'false');
      });
      if (hasBar) {
        var left, right;
        if (activeCat) {
          left = itemCount(activeCat) + ' ' + chipLabel(activeCat) + ' of ' + count;
          right = allLabel || 'Show all ' + count;
        } else if (expanded) {
          left = 'All ' + count;
          right = 'Show less ▴';
        } else if (previewing) {
          left = previewCount + ' example' + (previewCount === 1 ? '' : 's') + ' of ' + count;
          right = (allLabel || 'Show all ' + count) + ' ▾';
        } else if (lead) {
          left = '+' + (count - leadEls.length) + (leadCount > 1 ? ' more' : ' earlier');
          right = 'Show all ▾';
        } else {
          left = 'All ' + count;
          right = 'Show all ▾';
        }
        bar.querySelector('.bx-bar-l').textContent = left;
        bar.querySelector('.bx-bar-r').textContent = right;
        bar.setAttribute('aria-expanded', (expanded || !!activeCat) ? 'true' : 'false');
      }
      if (status) status.textContent = 'Showing ' + shown + ' of ' + count + '.';
    }

    chipButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = btn.getAttribute('data-cat');
        if (activeCat === cat) { activeCat = ''; expanded = !hasBar; } // tapping the selected chip again collapses
        else activeCat = cat;
        render();
      });
    });
    if (hasBar) {
      bar.hidden = false;
      bar.addEventListener('click', function () {
        if (activeCat) { activeCat = ''; expanded = true; } // "Show all N" clears the filter and expands
        else expanded = !expanded;
        render();
      });
    }
    // The citation-jump and jump-nav reveal (below) calls this to force a collapsed box open
    // without needing to know its internal state.
    box._ppExpand = function () { activeCat = ''; expanded = true; render(); };
    render();
  });
})();

// Reveal a collapsed section when navigating to an id inside it -- a citation superscript
// jumping into Sources, or a jump-nav link to a section itself (docs/briefs/page-sections.md).
// Handles both the remaining <details> sections ("About this shape"/"Research notes") and the
// .box pattern (docs/briefs/box-pattern.md), whose own collapse state isn't a <details open>
// attribute the browser can restore on its own -- either way this doesn't depend on native
// browser support for auto-expanding on fragment navigation, inconsistent enough across engines
// not to bet the citation-jump UX on.
(function () {
  function reveal() {
    var id = window.location.hash.slice(1);
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    var details = el.closest('details');
    if (details && !details.open) details.open = true;
    var box = el.closest('.box');
    if (box && typeof box._ppExpand === 'function') box._ppExpand();
    requestAnimationFrame(function () { el.scrollIntoView({ block: 'center' }); });
  }
  window.addEventListener('hashchange', reveal);
  if (window.location.hash) reveal();
})();

// /near/ (docs/briefs/near-me.md): the browser's own permission dialog only ever appears from a
// click on this button, never on load; once granted, a later load skips straight to the map (see
// the permissions.query() check at the end of this IIFE) rather than asking again every time.
// Either way the position is watched continuously (a visitor walking the neighbourhood wants the
// dot and the nearby list to keep up, not a one-time snapshot) and never stored or sent anywhere
// -- everything below runs on the device, against #pp-near's inlined bbox and record lat/lons
// (sitegen/build.py), on every position the browser reports, for as long as the page stays open.
// Degrades to the plain, crawlable finder list with JavaScript off, or if the visitor never
// presses the button or declines the prompt.
(function () {
  var btn = document.getElementById('near-locate-btn');
  var dataEl = document.getElementById('pp-near');
  if (!btn || !dataEl) return;
  var locateWrap = btn.closest('.near-locate');
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
  var watchId = null;
  // mapSection (build.py's #near-map-section) wraps the map-toolbar (Status/Use/Satellite),
  // the map-frame itself and its caption as one unit -- hidden/shown together, so the toggle
  // row and caption never show above a map that isn't there yet. mapFrame stays the inner
  // .map-frame alone: svgs/ppSetView/ppReset all still address the map itself, not the wrapper.
  var mapSection = document.getElementById('near-map-section');
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
  var urlQuery = (new URLSearchParams(window.location.search).get('q') || '').trim();

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
    // Someone who came here from the header search wants those results, location or not.
    finderSection.hidden = !urlQuery;

    var p = project(lon, lat);
    var w = MAP_WIDTH_M / METRES_PER_UNIT;
    mapSection.hidden = false;
    svgs.forEach(function (svg) {
      clearOverlay(svg);
      setPinsVisible(svg, false);
      // Re-centres on every call, including a later one from the position watch below as a
      // visitor walks -- a deliberate follow-me choice (confirmed directly) over leaving the
      // view wherever a visitor last panned/zoomed it, so the map always frames what's actually
      // around them right now rather than fighting to stay in view as they move.
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
    mapSection.hidden = false;
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

  // success() runs on every position the watch below reports, not just the first -- re-ranking
  // the list and redrawing the dot each time is exactly what a visitor walking around wants, and
  // showNear()/showFar() already do a full redraw+recentre per call, so nothing here needs to
  // know it might be the fifth update rather than the first. But a stationary phone's GPS still
  // keeps firing updates a few metres apart from pure noise, and every one of those redraws would
  // otherwise reset any pinch-zoom or pan a visitor just made to look at one block more closely
  // (confirmed directly: don't touch the view if they haven't actually moved). MOVE_THRESHOLD_M
  // is compared against the last position that actually triggered a redraw, not the previous
  // callback, so a walk of several sub-threshold steps in the same direction still adds up and
  // triggers once the cumulative distance clears it, rather than each step comparing fresh
  // against wherever the phone happened to be a moment before.
  var lastFixLat = null, lastFixLon = null;
  var MOVE_THRESHOLD_M = 12;
  function success(pos) {
    var lat = pos.coords.latitude, lon = pos.coords.longitude, acc = pos.coords.accuracy;
    if (lastFixLat !== null && haversine(lastFixLat, lastFixLon, lat, lon) < MOVE_THRESHOLD_M) return;
    lastFixLat = lat; lastFixLon = lon;
    showStatus('');
    resetPanels();
    // Found it -- the button (and the privacy line under it) has done its job for this visit,
    // so it steps aside for the map/list it just produced. Reappears on a fresh page load
    // wherever locate() isn't re-run automatically below (permission not yet granted, or
    // withdrawn since).
    if (locateWrap) locateWrap.hidden = true;
    var ranked = withDistances(lat, lon);
    if (ranked.length && ranked[0].dist <= NEAR_M) showNear(lat, lon, acc);
    else showFar(lat, lon);
  }
  function failure(err) {
    // A continuous watch can hit a transient error mid-walk (signal loss under a bridge or
    // between tall buildings, or the mocked-geolocation reset this exact case was caught with in
    // testing) without anything really being wrong -- if there's already a good fix on screen,
    // leave the map, dot and list exactly as they are rather than yanking the visitor back to the
    // plain fallback list over a blip the next reading will likely resolve on its own. Only fall
    // back when there's never been a fix to fall back *from*.
    if (lastFixLat === null) {
      showStatus('Location unavailable' + (err && err.message ? ' (' + err.message + ')' : '') + ' — showing every tracked record instead.');
      resetPanels();
      mapSection.hidden = true;
      finderSection.hidden = false;
    }
    // PERMISSION_DENIED (code 1) is terminal for this watch -- the browser won't grant itself
    // permission on a later callback, so there's no point leaving it running (or, on some
    // browsers, repeatedly firing this same error). Anything else (POSITION_UNAVAILABLE, TIMEOUT)
    // can resolve on its own as the device's GPS gets a fix, so the watch stays open for those.
    if (err && err.code === 1 && watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  function locate() {
    if (!('geolocation' in navigator)) { showStatus('Geolocation is not available in this browser.'); return; }
    showStatus('Locating…');
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    // watchPosition, not getCurrentPosition: a visitor walking the neighbourhood wants the dot
    // and nearby list to keep tracking them, not a single snapshot from wherever they pressed
    // the button. A Permissions-Policy block (sitegen/static/_headers) or a browser that simply
    // refuses the call can throw synchronously here rather than reaching the error callback below
    // -- caught so the button never leaves the visitor stuck on "Locating…" with no explanation.
    try {
      watchId = navigator.geolocation.watchPosition(success, failure, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    } catch (e) {
      failure({ message: (e && e.message) || 'blocked by the browser' });
    }
  }

  btn.addEventListener('click', locate);

  // If this browser already granted pierandpoint.org geolocation access -- from an earlier visit,
  // or an earlier click this same session -- skip straight to the map on the next load instead of
  // asking the visitor to press the button again every time. navigator.permissions.query() only
  // reads the existing grant; it never shows a prompt of its own, so this still never surfaces the
  // browser's permission dialog without a click (docs/briefs/near-me.md's "the prompt fires only
  // from the button" is about that dialog, not about noticing a grant that's already there) --
  // and the position it then reads is used and discarded exactly as a manual click's would be,
  // never stored. Silently falls back to the plain button wherever the Permissions API is missing,
  // or reports the state as 'prompt' (not decided yet) or 'denied'.
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(function (status) {
      if (status.state === 'granted') locate();
    }).catch(function () { /* unsupported for this query in this browser -- button stays the only path */ });
  }
})();

// The header search keeps what was typed after it submits, on /near/ (where ?q= is read).
(function () {
  var input = document.getElementById('header-search-q');
  var q = new URLSearchParams(window.location.search).get('q');
  if (input && q && window.location.pathname === '/near/') input.value = q;
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
  // The header search (sitegen/pages.py's HEADER_SEARCH) submits here as /near/?q=...: read it on
  // load, so the finder opens already filtered. Name, parcel (the record id) and address all match.
  var initialQ = new URLSearchParams(window.location.search).get('q');
  if (initialQ) search.value = initialQ;

  function apply() {
    var q = (search.value || '').trim().toLowerCase();
    var site = siteSel.value, status = statusSel.value;
    var shown = 0;
    items.forEach(function (li) {
      var ok = (!site || li.getAttribute('data-site') === site) &&
        (!status || li.getAttribute('data-status') === status) &&
        (!q || li.getAttribute('data-name').indexOf(q) !== -1 || li.getAttribute('data-address').indexOf(q) !== -1 ||
          (li.getAttribute('data-id') || '').toLowerCase().indexOf(q) !== -1);
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

// Image lightbox for a record page's gallery (sitegen/build.py, docs/briefs/site-ux.md): the
// lead image and every thumbnail below it are each a real <a href> straight to the full-size
// file, so with JS off a click just opens that file directly. With JS, this intercepts the click
// and opens an in-page overlay instead, paging across every image on the page (in the same
// lead-then-thumbnails order they're laid out in, not just the ones in whichever kind group was
// clicked) via the prev/next buttons, the keyboard, or a swipe -- a carousel from the moment it
// opens, not a single fixed view. Its own IIFE, guarded on there being any gallery at all, since
// most pages (everything but a record page) carry none.
(function () {
  var frames = Array.prototype.slice.call(document.querySelectorAll('a.gallery-frame'));
  if (!frames.length) return;

  // Kind filter (site-ux follow-up): when a record's images span more than one kind, prev/next/
  // swipe can be narrowed to just the kinds still checked, rather than always paging through
  // everything -- e.g. only "Now" and "Rendering", skipping "Document" and "Before". Clicking a
  // thumbnail directly always shows that image regardless of the filter; the filter only changes
  // what stepping with the buttons/keyboard/swipe lands on next. `activeKinds` stays null (no
  // filter UI, nothing to narrow) when every image shares one kind or has none at all.
  var kindLabels = frames.map(function (a) { return a.dataset.kindLabel || ''; });
  var distinctKinds = kindLabels.filter(function (k, i) { return k && kindLabels.indexOf(k) === i; });
  var activeKinds = null;
  if (distinctKinds.length > 1) {
    activeKinds = {};
    distinctKinds.forEach(function (k) { activeKinds[k] = true; });
  }
  function isActive(i) {
    return !activeKinds || !kindLabels[i] || activeKinds[kindLabels[i]];
  }

  var overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Image viewer');
  var kindsHtml = activeKinds ? '<div class="lightbox-kinds" role="group" aria-label="Filter by kind">' +
    distinctKinds.map(function (k) {
      return '<button type="button" class="lightbox-kind" aria-pressed="true">' + k + '</button>';
    }).join('') + '</div>' : '';
  overlay.innerHTML =
    '<button type="button" class="lightbox-close" aria-label="Close">×</button>' +
    (frames.length > 1 ? '<button type="button" class="lightbox-prev" aria-label="Previous image">‹</button>' +
      '<button type="button" class="lightbox-next" aria-label="Next image">›</button>' : '') +
    kindsHtml +
    '<figure><img alt="" draggable="false"><figcaption></figcaption>' +
    (frames.length > 1 ? '<p class="lightbox-count" aria-hidden="true"></p>' : '') + '</figure>';
  document.body.appendChild(overlay);

  var imgEl = overlay.querySelector('img');
  var capEl = overlay.querySelector('figcaption');
  var countEl = overlay.querySelector('.lightbox-count');
  var closeBtn = overlay.querySelector('.lightbox-close');
  var prevBtn = overlay.querySelector('.lightbox-prev');
  var nextBtn = overlay.querySelector('.lightbox-next');
  var current = 0, lastFocused = null;

  function show(i) {
    current = (i + frames.length) % frames.length;
    var a = frames[current];
    var thumb = a.querySelector('img');
    var caption = a.closest('figure').querySelector('figcaption');
    imgEl.src = a.getAttribute('href');
    imgEl.alt = thumb ? thumb.getAttribute('alt') || '' : '';
    // data-full: a figure whose visible credit is the short form (site page lead) keeps the full one here.
    capEl.innerHTML = caption ? (caption.getAttribute('data-full') || caption.innerHTML) : '';
    if (countEl) countEl.textContent = (current + 1) + ' of ' + frames.length;
  }
  // Prev/next/swipe/keyboard all step through the filter, not straight to current+/-1: skips any
  // frame whose kind is unchecked, wrapping around: the `tries` bound is only a guard against
  // activeKinds somehow having nothing checked (the chip handler below never allows that).
  function step(delta) {
    if (!activeKinds) { show(current + delta); return; }
    var i = current, tries = 0;
    do { i = (i + delta + frames.length) % frames.length; tries++; } while (!isActive(i) && tries <= frames.length);
    show(i);
  }
  function open(i) {
    lastFocused = document.activeElement;
    show(i);
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
    document.addEventListener('keydown', onKey);
  }
  function close() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  }
  frames.forEach(function (a, i) {
    a.addEventListener('click', function (e) { e.preventDefault(); open(i); });
  });
  closeBtn.addEventListener('click', close);
  if (prevBtn) prevBtn.addEventListener('click', function () { step(-1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { step(1); });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

  if (activeKinds) {
    Array.prototype.slice.call(overlay.querySelectorAll('.lightbox-kind')).forEach(function (btn, n) {
      var k = distinctKinds[n];
      btn.addEventListener('click', function () {
        var isOn = activeKinds[k];
        // Never let the last checked kind be unchecked -- stepping needs at least one to land on.
        if (isOn && distinctKinds.filter(function (kk) { return activeKinds[kk]; }).length <= 1) return;
        activeKinds[k] = !isOn;
        btn.setAttribute('aria-pressed', String(!isOn));
        if (!isActive(current)) step(1);
      });
    });
  }

  // Swipe left/right to page -- a threshold before it counts as a swipe (the same drag-vs-tap
  // distinction the map's own pan/zoom uses, sitegen/static/app.js's initZoom() above), so a
  // plain tap on the image or the backdrop doesn't accidentally turn the page.
  var swipeStartX = null;
  overlay.addEventListener('pointerdown', function (e) { swipeStartX = e.clientX; });
  overlay.addEventListener('pointerup', function (e) {
    if (swipeStartX === null || frames.length < 2) return;
    var dx = e.clientX - swipeStartX;
    swipeStartX = null;
    if (dx > 40) step(-1);
    else if (dx < -40) step(1);
  });
})();
