// Pier & Point timeline: recolors every map and count on the page for the chosen month.
// Pages work without JavaScript; they are rendered at today's status.
(function () {
  var dataEl = document.getElementById('pp-record');
  var slider = document.getElementById('pp-slider');
  if (!dataEl || !slider) return;
  var R = JSON.parse(dataEl.textContent);
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var START = R.start_year, TODAY = R.today_index, MAX = R.max_index;
  var byId = {};
  R.records.forEach(function (r) { byId[r.id] = r; r.events = []; });
  R.milestones.forEach(function (m) {
    m.i = (+m.date.slice(0, 4) - START) * 12 + (+m.date.slice(5, 7)) - 1;
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

  var shapes = document.querySelectorAll('.pp-map [data-id]');
  var readDate = document.getElementById('pp-date');
  var readPhase = document.getElementById('pp-phase');
  var play = document.getElementById('pp-play');
  var timer = null;

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
    var label = MON[m % 12] + ' ' + (START + Math.floor(m / 12));
    readDate.textContent = label;
    readPhase.textContent = m < TODAY ? 'Recorded history' : m === TODAY ? 'Today' : 'Expected';
    slider.setAttribute('aria-valuetext', label + ', ' + readPhase.textContent);
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } play.setAttribute('aria-pressed', 'false'); play.querySelector('span').textContent = 'Play'; }
  slider.addEventListener('input', function () { stop(); paint(+slider.value); });
  play.addEventListener('click', function () {
    if (timer) { stop(); return; }
    if (+slider.value >= MAX) slider.value = 0;
    play.setAttribute('aria-pressed', 'true'); play.querySelector('span').textContent = 'Pause';
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer = setInterval(function () {
      var n = +slider.value + (reduce ? 12 : 1);
      if (n > MAX) { slider.value = MAX; paint(MAX); stop(); return; }
      slider.value = n; paint(n);
    }, reduce ? 700 : 140);
  });
  document.querySelectorAll('.timeline').forEach(function (t) { t.hidden = false; });
  paint(+slider.value);
})();
