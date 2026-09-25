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

  // --- the one clock -------------------------------------------------------
  //
  // How far down the page you are, 0 to 1, written to the root element once
  // per frame. The sun, the warming sky and the bar at the top all read it,
  // which is what keeps them in step. --arch is the same number bent into a
  // hill, so the sun rises and sets instead of sliding downhill.
  if (!reduced) {
    var root = document.documentElement;
    var ticking = false;

    var paint = function () {
      ticking = false;
      var max = root.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      root.style.setProperty('--scroll', p.toFixed(4));
      root.style.setProperty('--arch', (p * (1 - p) * 4).toFixed(4));
    };

    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(paint);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    paint();
  }

  // --- one wave, not twenty ------------------------------------------------
  //
  // Items that share a parent arrive one after another. The delay lives in CSS
  // and only the index is set here.
  for (var n = 0; n < items.length; n++) {
    var parent = items[n].parentNode;
    if (!parent.revealCount) parent.revealCount = 0;
    items[n].style.setProperty('--i', parent.revealCount++);
  }

  // --- the numbers count up ------------------------------------------------
  var counters = document.querySelectorAll('[data-count]');
  var runCounter = function (el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (reduced || !target) { el.textContent = String(target); return; }
    var started = null;
    var tick = function (now) {
      if (started === null) started = now;
      var t = Math.min(1, (now - started) / 900);
      // Fast first, gentle landing.
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    el.textContent = '0';
    requestAnimationFrame(tick);
    // A number stuck at zero is a lie about the app. If frames are throttled
    // (a background tab, a screenshot tool, a tired phone) this writes the
    // real figure anyway.
    setTimeout(function () { el.textContent = String(target); }, 1600);
  };

  if ('IntersectionObserver' in window && counters.length) {
    var counterSeen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        runCounter(entry.target);
        counterSeen.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    for (var c = 0; c < counters.length; c++) counterSeen.observe(counters[c]);
  }

  // --- the reel: a recording of the app, scrubbed by the scroll ------------
  //
  // Thirty-four stills rather than a video: a video that is seeked rather than
  // played stutters, and iOS will not always seek one at all. The frames are
  // fetched only when the section is close, and a reader who asked for less
  // motion, or is on a metered connection, keeps the still image.
  var reel = document.getElementById('reel');
  if (reel) {
    var canvas = reel.querySelector('.reel-canvas');
    var poster = reel.querySelector('.reel-poster');
    var steps = reel.querySelectorAll('.reel-steps li');
    var COUNT = 34;
    var saveData = navigator.connection && navigator.connection.saveData;

    if (reduced || saveData || !canvas.getContext) {
      canvas.remove();
    } else {
      var ctx = canvas.getContext('2d', { alpha: false });
      var frames = new Array(COUNT);
      var ready = 0;
      var shown = -1;

      var draw = function (index) {
        var image = frames[index];
        if (!image || index === shown) return;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        shown = index;
      };

      var position = function () {
        var box = reel.getBoundingClientRect();
        var travel = reel.offsetHeight - window.innerHeight;
        if (travel <= 0) return 0;
        return Math.min(1, Math.max(0, -box.top / travel));
      };

      var reelTick = false;
      var updateReel = function () {
        reelTick = false;
        var p = position();
        // The last stretch is the app's own animation settling, so the frames
        // are spread over the first 88% and the end simply holds.
        var index = Math.round(Math.min(1, p / 0.88) * (COUNT - 1));
        draw(index);
        for (var s = 0; s < steps.length; s++) {
          var at = parseFloat(steps[s].getAttribute('data-at'));
          var nextAt = s + 1 < steps.length ? parseFloat(steps[s + 1].getAttribute('data-at')) : 2;
          steps[s].classList.toggle('on', p >= at && p < nextAt);
        }
      };

      var onReelScroll = function () {
        if (reelTick) return;
        reelTick = true;
        requestAnimationFrame(updateReel);
      };

      var load = function () {
        for (var f = 0; f < COUNT; f++) {
          (function (index) {
            var image = new Image();
            image.decoding = 'async';
            image.src = '/reel/' + (index < 10 ? '0' : '') + index + '.webp';
            image.onload = function () {
              frames[index] = image;
              ready++;
              if (index === 0) draw(0);
              if (ready === COUNT) updateReel();
            };
          })(f);
        }
        window.addEventListener('scroll', onReelScroll, { passive: true });
        window.addEventListener('resize', onReelScroll);
      };

      if ('IntersectionObserver' in window) {
        var near = new IntersectionObserver(function (entries) {
          if (!entries[0].isIntersecting) return;
          near.disconnect();
          load();
        }, { rootMargin: '400px 0px' });
        near.observe(reel);
      } else {
        load();
      }

      // The still underneath is what shows until the first frame is decoded.
      if (poster) poster.setAttribute('aria-hidden', 'true');
    }
  }

  // --- light follows the pointer across a card -----------------------------
  //
  // Pointer only: a finger has no hover, and a card that lights up under a
  // tap that was meant to scroll is noise.
  if (!reduced && window.matchMedia && window.matchMedia('(hover: hover)').matches) {
    var cards = document.querySelectorAll('.card');
    for (var d = 0; d < cards.length; d++) {
      cards[d].addEventListener('pointermove', function (event) {
        var box = this.getBoundingClientRect();
        this.style.setProperty('--mx', (event.clientX - box.left) + 'px');
        this.style.setProperty('--my', (event.clientY - box.top) + 'px');
      });
    }
  }
})();
