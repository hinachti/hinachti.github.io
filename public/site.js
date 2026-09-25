// Two small things, and nothing else: no tracking, no libraries, no cookies.
//
// 1. Sections fade in as they arrive. If the browser cannot do this, or the
//    reader asked for less motion, everything is simply visible from the start
//    (the CSS handles that case).
// 2. On a phone, the download button follows you down the page once the one in
//    the header has scrolled away.

(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items = document.querySelectorAll('.reveal');

  function showAll() {
    for (var k = 0; k < items.length; k++) items[k].classList.add('in');
  }

  // Nothing on this page is allowed to stay invisible. If the observer never
  // fires - a browser quirk, a stalled tab, a bug of mine - this shows
  // everything a few seconds later anyway.
  setTimeout(showAll, 4000);

  if (reduced || !('IntersectionObserver' in window)) {
    showAll();
  } else {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        seen.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    for (var j = 0; j < items.length; j++) seen.observe(items[j]);
  }

  var hero = document.getElementById('download');
  var bar = document.getElementById('bar');
  if (hero && bar && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      bar.classList.toggle('show', !entries[0].isIntersecting);
    }).observe(hero);
  }
})();
