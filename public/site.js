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

  // The screenshot strip: arrows instead of a scrollbar.
  //
  // In a right-to-left page the strip starts at scrollLeft 0 on the right and
  // counts down into negative numbers as it moves left, so "one card further"
  // is a signed step and both ends are found by absolute value.
  var strip = document.getElementById('shots');
  var gallery = strip && strip.closest('.gallery');
  if (strip && gallery) {
    var prev = gallery.querySelector('.nav.prev');
    var next = gallery.querySelector('.nav.next');
    var rtl = getComputedStyle(strip).direction === 'rtl';
    var sign = rtl ? -1 : 1;

    var step = function () {
      var card = strip.querySelector('.shot');
      return card ? card.getBoundingClientRect().width + 18 : 250;
    };

    var overflowing = function () {
      return strip.scrollWidth - strip.clientWidth > 4;
    };

    var sync = function () {
      var room = overflowing();
      prev.hidden = next.hidden = !room;
      if (!room) return;
      var pos = Math.abs(strip.scrollLeft);
      prev.disabled = pos <= 2;
      next.disabled = pos + strip.clientWidth >= strip.scrollWidth - 2;
    };

    var move = function (direction) {
      gallery.classList.add('touched');
      strip.scrollBy({
        left: sign * direction * step(),
        behavior: reduced ? 'auto' : 'smooth'
      });
    };

    prev.addEventListener('click', function () { move(-1); });
    next.addEventListener('click', function () { move(1); });
    strip.addEventListener('scroll', function () {
      gallery.classList.add('touched');
      sync();
    }, { passive: true });
    window.addEventListener('resize', sync);
    // Late web fonts and images change the measurements under us.
    window.addEventListener('load', sync);
    sync();
  }

  var hero = document.getElementById('download');
  var bar = document.getElementById('bar');
  if (hero && bar && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      bar.classList.toggle('show', !entries[0].isIntersecting);
    }).observe(hero);
  }
})();
