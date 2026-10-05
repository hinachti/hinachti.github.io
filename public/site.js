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
  // Stills rather than a video: a video that is seeked rather than played
  // stutters, and iOS will not always seek one at all. Every frame of motion is
  // there, at 30 a second; reel.json (written by tools/make-reel.py) says which
  // picture belongs to each step of the scroll, so a screen that stands still
  // is one file however long it stands.
  //
  // Three things make it glide rather than click from picture to picture:
  // the play head eases after the scroll instead of jumping with each notch of
  // the wheel; between two frames the next one is faded in by the fraction
  // the play head has travelled; and the frames arrive coarse to fine (every
  // eighth first, then the gaps), so the whole story scrubs within moments
  // and only gets smoother while the rest loads.
  //
  // The frames are fetched only when the section is close, and a reader who
  // asked for less motion, or is on a metered connection, keeps the still.
  //
  // Its own function scope: everything here is `var`, and a `paint` of its
  // own once replaced the page clock's `paint` above, which stopped the sun.
  var reel = document.getElementById('reel');
  if (reel) (function () {
    var canvas = reel.querySelector('.reel-canvas');
    var poster = reel.querySelector('.reel-poster');
    var steps = reel.querySelectorAll('.reel-steps li');
    var saveData = navigator.connection && navigator.connection.saveData;
    // The last stretch is the app's own screen settling, so the frames are
    // spread over the first 88% of the section and the end simply holds.
    var SPAN = 0.88;

    if (reduced || saveData || !canvas.getContext) {
      canvas.remove();
      reel.classList.add('reel-still');
    } else {
      var ctx = canvas.getContext('2d', { alpha: false });
      var seq = null;
      var files = [];
      var marks = [];
      for (var sm = 0; sm < steps.length; sm++) marks.push(parseFloat(steps[sm].getAttribute('data-at')));
      var target = 0;
      var head = 0;
      var drawnKey = '';
      var gliding = false;

      var clamp = function (v) { return Math.min(1, Math.max(0, v)); };
      // 0 before a, 1 after b, straight in between.
      var ramp = function (v, a, b) { return clamp((v - a) / (b - a)); };

      // The nearest step, from i outward, whose picture has arrived.
      var nearest = function (i) {
        for (var d = 0; d < seq.length; d++) {
          if (i - d >= 0 && files[seq[i - d]]) return files[seq[i - d]];
          if (i + d < seq.length && files[seq[i + d]]) return files[seq[i + d]];
        }
        return null;
      };

      var paintReel = function (pos) {
        var last = seq.length - 1;
        var i = Math.min(last, Math.floor(pos));
        var a = nearest(i);
        if (!a) return;
        var b = nearest(Math.min(last, i + 1));
        var mix = b && b !== a ? Math.round((pos - i) * 20) / 20 : 0;
        var key = a.src + '|' + (mix ? b.src + '|' + mix : '');
        if (key === drawnKey) return;
        drawnKey = key;
        ctx.globalAlpha = 1;
        ctx.drawImage(a, 0, 0, canvas.width, canvas.height);
        if (mix) {
          ctx.globalAlpha = mix;
          ctx.drawImage(b, 0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = 1;
        }
        // Until now the still underneath showed through.
        canvas.classList.add('drawn');
      };

      var position = function () {
        var box = reel.getBoundingClientRect();
        var travel = reel.offsetHeight - window.innerHeight;
        if (travel <= 0) return 0;
        return clamp(-box.top / travel);
      };

      var show = function (p) {
        if (seq) paintReel(Math.min(1, p / SPAN) * (seq.length - 1));
        var pressAt = marks[1] || 0.2;
        var doneAt = marks[2] || 0.5;
        // The halo behind the phone follows the story: warmer as the morning
        // plays out, with a touch of green once the day is marked.
        reel.style.setProperty('--reel', p.toFixed(4));
        reel.style.setProperty('--reel-done', ramp(p, doneAt, doneAt + 0.2).toFixed(3));
        // The phone arrives tilted back a little and straightens as the story
        // starts; the line beside the steps fills as it goes.
        reel.style.setProperty('--in', ramp(p, 0, 0.12).toFixed(3));
        reel.style.setProperty('--reel-fill', clamp(p / SPAN).toFixed(4));
        // The reminder drops in as the section settles and is gone by the
        // time the button is pressed; the streak line rises out of the phone
        // once the screen has come back to say the day is marked.
        reel.style.setProperty('--note', Math.min(ramp(p, 0.008, 0.04),1 - ramp(p, pressAt - 0.05, pressAt)).toFixed(3));
        reel.style.setProperty('--streak', ramp(p, doneAt + (SPAN - doneAt) * 0.6, SPAN + 0.02).toFixed(3));
        for (var s = 0; s < steps.length; s++) {
          var nextAt = s + 1 < steps.length ? marks[s + 1] : 2;
          steps[s].classList.toggle('on', p >= marks[s] && p < nextAt);
        }
      };

      // The play head eases after the scroll: a fifth of the way each frame,
      // and it stops asking for frames once it has arrived.
      var glide = function () {
        target = position();
        var gap = target - head;
        head = Math.abs(gap) < 0.0004 ? target : head + gap * 0.2;
        show(head);
        if (head !== target) requestAnimationFrame(glide);
        else gliding = false;
      };

      var onReelScroll = function () {
        if (gliding) return;
        gliding = true;
        requestAnimationFrame(glide);
      };

      var fetchFrame = function (index) {
        var image = new Image();
        image.decoding = 'async';
        image.onload = function () {
          files[index] = image;
          drawnKey = '';
          show(head);
        };
        image.src = '/reel/' + ('00' + index).slice(-3) + '.webp';
      };

      var load = function () {
        var request = new XMLHttpRequest();
        request.open('GET', '/reel/reel.json');
        request.responseType = 'json';
        request.onload = function () {
          var data = request.response;
          if (!data || !data.seq || !data.count) return;
          seq = data.seq;
          // The steps of the story start where the motion does.
          if (data.marks && data.marks.length === steps.length) {
            marks = data.marks.map(function (m) { return m * SPAN; });
          }
          // Coarse to fine: the first and last, every eighth, fourth,
          // second, then the rest.
          var queued = {};
          var order = [0, data.count - 1];
          for (var stride = 8; stride >= 1; stride = stride / 2) {
            for (var f = 0; f < data.count; f += stride) order.push(f);
          }
          for (var q = 0; q < order.length; q++) {
            if (queued[order[q]]) continue;
            queued[order[q]] = true;
            fetchFrame(order[q]);
          }
          head = target = position();
          show(head);
        };
        request.send();
        window.addEventListener('scroll', onReelScroll, { passive: true });
        window.addEventListener('resize', onReelScroll);
      };

      // The words are right from the start, frames or no frames.
      show(position());

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
  })();

  // --- the film ------------------------------------------------------------
  //
  // Opens over the page from the button in the header. Nothing is fetched
  // until then (preload="none"), so the page costs no more to load than it
  // did. A phone held upright gets the upright cut; everything else the wide one.
  var film = document.getElementById('film');
  var openers = document.querySelectorAll('[data-film]');
  if (film && typeof film.showModal === 'function' && openers.length) {
    var video = film.querySelector('video');
    var qButtons = film.querySelectorAll('[data-q]');
    var opener = null;
    var tall = false;

    // 1080p unless the reader asked the browser to save data or the line is
    // slow; a choice they make here wins, and is kept on this device only.
    var saved = null;
    try { saved = localStorage.getItem('hinachti-film-q'); } catch (e) {}
    var net = navigator.connection || {};
    var quality = saved || ((net.saveData || /(^|-)2g|3g/.test(net.effectiveType || '')) ? '720' : '1080');

    var srcFor = function () {
      return video.getAttribute(tall ? 'data-tall' : 'data-wide').replace('{q}', quality);
    };
    var markQuality = function () {
      for (var b = 0; b < qButtons.length; b++) {
        qButtons[b].setAttribute('aria-pressed', qButtons[b].getAttribute('data-q') === quality ? 'true' : 'false');
      }
    };

    // Where to pick up after a change of quality. Kept across changes, so two
    // quick clicks before the first file has loaded do not lose the place.
    var pending = null;
    var resume = function () {
      if (!pending) return;
      var at = pending.at;
      var play = pending.play;
      pending = null;
      if (at) video.currentTime = at;
      if (play) {
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
      }
    };
    video.addEventListener('loadedmetadata', resume);

    for (var qb = 0; qb < qButtons.length; qb++) {
      qButtons[qb].addEventListener('click', function () {
        var q = this.getAttribute('data-q');
        if (q === quality) return;
        quality = q;
        try { localStorage.setItem('hinachti-film-q', q); } catch (e) {}
        markQuality();
        if (!pending) {
          pending = { at: video.readyState > 0 ? video.currentTime : 0, play: !video.paused };
        }
        video.setAttribute('src', srcFor());
      });
    }

    var openFilm = function (event) {
      event.preventDefault();
      opener = this;
      tall = window.matchMedia('(max-aspect-ratio: 4/5)').matches;
      // preload="none" keeps the page light until now; once the reader has
      // asked for the film, a change of quality must load without waiting
      // for another press of play.
      video.preload = 'auto';
      var src = srcFor();
      if (video.getAttribute('src') !== src) {
        pending = null;
        video.setAttribute('poster', video.getAttribute(tall ? 'data-tall-poster' : 'data-wide-poster'));
        video.setAttribute('src', src);
      }
      markQuality();
      film.classList.toggle('tall', tall);
      film.showModal();
      // the click is the permission to play with sound
      var playing = video.play();
      if (playing && playing.catch) playing.catch(function () {});
    };
    for (var f = 0; f < openers.length; f++) openers[f].addEventListener('click', openFilm);

    film.querySelector('.film-close').addEventListener('click', function () { film.close(); });
    // a click on the dim area around the film closes it
    film.addEventListener('click', function (event) {
      if (event.target === film) film.close();
    });
    film.addEventListener('close', function () {
      video.pause();
      if (opener) opener.focus();
    });
  }

  // --- write to us ---------------------------------------------------------
  //
  // The message goes to a small script in the site owner's own Google account,
  // which checks it, files it where only he can read it, and tells him at
  // once. Nothing is loaded for this: it is one request, sent when the reader
  // presses send, carrying only what they typed.
  //
  // The app's "כתבו לנו" opens this page with ?from=app&v=<version>&device=<model>,
  // so a report from the app arrives already saying which phone and version.
  var CONTACT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwV5B4HwFJturt6FyxYBqQ_VlZdsI1a09GBNv19fAJGBm6dwq-tQAerxuX6LcC-3gDGMw/exec';
  var POW_BITS = 16;
  var form = document.getElementById('contact-form');
  if (form) {
    var opened = Date.now();
    var stars = document.getElementById('stars');
    var starButtons = stars.querySelectorAll('[data-star]');
    var rating = 0;
    var body = form.elements.body;
    var count = document.getElementById('count');
    var device = document.getElementById('device');
    var deviceModel = document.getElementById('device-model');
    var confirmBox = document.getElementById('confirm');
    var confirmState = confirmBox.querySelector('.confirm-state');
    var sendButton = document.getElementById('send');
    var sendError = document.getElementById('send-error');
    var params = new URLSearchParams(location.search);
    var source = params.get('from') === 'app' ? 'app' : 'web';

    var paintStars = function (n) {
      for (var s = 0; s < starButtons.length; s++) {
        starButtons[s].classList.toggle('on', s < n);
        starButtons[s].setAttribute('aria-checked', String(s + 1 === rating));
      }
    };
    for (var sb = 0; sb < starButtons.length; sb++) {
      starButtons[sb].addEventListener('click', function () {
        rating = +this.getAttribute('data-star');
        paintStars(rating);
      });
      starButtons[sb].addEventListener('mouseenter', function () { paintStars(+this.getAttribute('data-star')); });
      starButtons[sb].addEventListener('mouseleave', function () { paintStars(rating); });
    }

    // stars only for a review; the version for a fault or a review; the phone for a fault
    var showFor = function (kind) {
      stars.hidden = kind !== 'review';
      device.hidden = kind !== 'bug' && kind !== 'review';
      deviceModel.hidden = kind !== 'bug';
    };
    var kinds = form.querySelectorAll('input[name="kind"]');
    for (var kd = 0; kd < kinds.length; kd++) {
      kinds[kd].addEventListener('change', function () { showFor(this.value); });
    }

    // what the app passed along, or what the browser itself can tell
    var fromApp = function () {
      if (params.get('v')) form.elements.appVersion.value = params.get('v').slice(0, 20);
      if (params.get('device')) form.elements.device.value = params.get('device').slice(0, 80);
      var wanted = form.querySelector('input[name="kind"][value="' + params.get('kind') + '"]');
      if (wanted) { wanted.checked = true; showFor(wanted.value); }
    };
    fromApp();
    if (!form.elements.device.value && navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      navigator.userAgentData.getHighEntropyValues(['model']).then(function (ua) {
        if (ua.model && !form.elements.device.value) form.elements.device.value = ua.model;
      }).catch(function () {});
    }

    body.addEventListener('input', function () { count.textContent = body.value.length; });

    // Proof of work: find a number whose hash with a fresh salt starts with
    // POW_BITS zero bits. About a second's worth of hashing, once, in the
    // background; the server checks it with a single hash.
    var pow = null;
    var solving = null;
    var leadingZeroBits = function (bytes) {
      var n = 0;
      for (var i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0) { n += 8; continue; }
        for (var b = 7; b >= 0 && !(bytes[i] >> b & 1); b--) n++;
        break;
      }
      return n;
    };
    var solve = function () {
      var salt = opened + '.' + Math.random().toString(16).slice(2, 10);
      var enc = new TextEncoder();
      var nonce = 0;
      var batch = function () {
        var tries = [];
        for (var k = 0; k < 64; k++) {
          (function (n) {
            tries.push(crypto.subtle.digest('SHA-256', enc.encode(salt + ':' + n)).then(function (h) {
              return leadingZeroBits(new Uint8Array(h)) >= POW_BITS ? n : -1;
            }));
          })(nonce++);
        }
        return Promise.all(tries).then(function (found) {
          for (var f = 0; f < found.length; f++) if (found[f] >= 0) return { salt: salt, nonce: found[f] };
          return batch();
        });
      };
      return batch();
    };
    var startSolving = function () {
      confirmBox.classList.remove('bad', 'ok');
      confirmState.textContent = 'בודק…';
      var mine = solving = solve().then(function (result) {
        if (solving !== mine) return result;
        pow = result;
        confirmBox.classList.add('ok');
        confirmState.textContent = '✓ אומת';
        return result;
      });
      return mine;
    };
    form.elements.confirm.addEventListener('change', function () {
      pow = null;
      if (this.checked) startSolving();
      else { solving = null; confirmBox.classList.remove('ok'); confirmState.textContent = ''; }
    });

    var mark = function (name, bad) {
      form.elements[name].closest('.field').classList.toggle('bad', bad);
      return bad;
    };
    ['subject', 'body', 'email'].forEach(function (name) {
      form.elements[name].addEventListener('input', function () { mark(name, false); });
    });

    var sending = false;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (sending) return;
      sendError.hidden = true;
      var email = form.elements.email.value.trim();
      var bad = false;
      bad = mark('subject', form.elements.subject.value.trim().length < 2) || bad;
      bad = mark('body', body.value.trim().length < 5) || bad;
      bad = mark('email', email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) || bad;
      var unconfirmed = !form.elements.confirm.checked;
      confirmBox.classList.toggle('bad', unconfirmed);
      if (bad || unconfirmed) {
        var first = form.querySelector('.field.bad input, .field.bad textarea') || form.elements.confirm;
        first.focus();
        return;
      }
      if (form.elements.website.value) {             // the trap was filled: a bot. Look sent, send nothing.
        form.classList.add('done');
        document.getElementById('sent').hidden = false;
        return;
      }

      sending = true;
      sendButton.disabled = true;
      sendButton.textContent = 'שולח…';
      var kind = form.querySelector('input[name="kind"]:checked').value;

      Promise.resolve(pow || solving || startSolving()).then(function (proof) {
        var message = {
          kind: kind,
          stars: kind === 'review' ? rating : 0,
          name: form.elements.name.value.trim(),
          email: email,
          subject: form.elements.subject.value.trim(),
          body: body.value.trim(),
          device: kind === 'bug' ? form.elements.device.value.trim() : '',
          appVersion: kind === 'bug' || kind === 'review' ? form.elements.appVersion.value.trim() : '',
          source: source,
          opened: opened,
          salt: proof.salt,
          nonce: proof.nonce,
          website: ''
        };
        if (!CONTACT_ENDPOINT) {
          // Only a local preview may run without the backend; anywhere else,
          // pretending it was sent would lose the message.
          if (location.hostname !== 'localhost') throw new Error('no endpoint');
          return new Promise(function (ok) { setTimeout(function () { ok({ ok: true }); }, 500); });
        }
        var aborter = 'AbortController' in window ? new AbortController() : null;
        var timer = setTimeout(function () { if (aborter) aborter.abort(); }, 20000);
        return fetch(CONTACT_ENDPOINT, {
          method: 'POST',
          // text/plain keeps this a simple request: no preflight, which Apps Script cannot answer
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(message),
          signal: aborter ? aborter.signal : undefined
        }).then(function (response) {
          clearTimeout(timer);
          return response.json();
        });
      }).then(function (reply) {
        if (!reply || !reply.ok) throw new Error((reply && reply.error) || 'rejected');
        form.classList.add('done');
        document.getElementById('sent').hidden = false;
      }).catch(function () {
        sendError.hidden = false;
      }).then(function () {
        sending = false;
        sendButton.disabled = false;
        sendButton.textContent = 'שליחה';
      });
    });

    document.getElementById('again').addEventListener('click', function () {
      form.reset();
      rating = 0;
      paintStars(0);
      showFor('question');
      fromApp();
      count.textContent = '0';
      opened = Date.now();
      pow = null;
      solving = null;
      confirmBox.classList.remove('ok', 'bad');
      confirmState.textContent = '';
      document.getElementById('sent').hidden = true;
      form.classList.remove('done');
      form.elements.subject.focus();
    });
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

  // --- the cursor: a point of light, and a ring that trails it ---------------
  //
  // A mouse only (a finger has no cursor), and nothing until the mouse first
  // moves, so it never sits in a corner. The dot is where the pointer is; the
  // ring eases after it, and stops asking for frames once it has caught up.
  // Asked for less motion: the ring keeps up at once instead of trailing.
  if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var root = document.documentElement;
    var dot = document.createElement('div');
    var ring = document.createElement('div');
    dot.className = 'cursor-dot';
    ring.className = 'cursor-ring';
    dot.setAttribute('aria-hidden', 'true');
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dot);
    document.body.appendChild(ring);
    root.classList.add('has-cursor');

    var CLICKABLE = 'a, button, label, summary, select, [role="button"], [data-film], .shots img, input[type="radio"], input[type="checkbox"]';
    var TYPING = 'input:not([type="radio"]):not([type="checkbox"]):not([type="range"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]';
    var mx = 0, my = 0, rx = 0, ry = 0;
    var chasing = false;

    var chase = function () {
      var dx = mx - rx, dy = my - ry;
      if (reduced || (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1)) {
        rx = mx; ry = my;
        chasing = false;
      } else {
        rx += dx * 0.2; ry += dy * 0.2;
        requestAnimationFrame(chase);
      }
      ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
    };

    document.addEventListener('mousemove', function (event) {
      mx = event.clientX; my = event.clientY;
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      if (!root.classList.contains('cursor-on')) {
        rx = mx; ry = my;
        root.classList.add('cursor-on');
      }
      if (!chasing) { chasing = true; requestAnimationFrame(chase); }
    }, { passive: true });

    document.addEventListener('mouseover', function (event) {
      var target = event.target && event.target.closest ? event.target : null;
      ring.classList.toggle('over', !!(target && target.closest(CLICKABLE)));
      root.classList.toggle('cursor-typing', !!(target && target.closest(TYPING)));
    });
    document.addEventListener('mousedown', function () { ring.classList.add('down'); });
    document.addEventListener('mouseup', function () { ring.classList.remove('down'); });
    // Off the page (into the browser's own bar, or another window): gone.
    root.addEventListener('mouseleave', function () { root.classList.remove('cursor-on'); });
    window.addEventListener('blur', function () { root.classList.remove('cursor-on'); });

    // --- the wheel press: the browser's autoscroll, drawn in our own light ---
    //
    // Pressing the wheel puts the browser's black two-arrow badge on the page,
    // which no page can restyle, so this takes the gesture over and draws its
    // own. It behaves the way the browser's does: press and release, then move
    // the mouse to scroll and press anything to stop; or hold the wheel down,
    // move, and let go. The farther from the badge, the faster. A wheel press on
    // a link still opens it in a new tab, and on a field it is left alone.
    var badge = document.createElement('div');
    badge.className = 'autoscroll';
    badge.setAttribute('aria-hidden', 'true');
    badge.innerHTML = '<svg viewBox="0 0 34 34"><path class="up" d="M12 13.5l5-5 5 5"/>' +
      '<circle cx="17" cy="17" r="1.6"/><path class="down" d="M12 20.5l5 5 5-5"/></svg>';
    document.body.appendChild(badge);

    var LEAVE = 'a, button, input, textarea, select, label, summary, [contenteditable="true"], [role="button"], dialog';
    var DEAD = 10;       // px around the badge that do not scroll
    var oy = 0, cy = 0, pressedAt = 0;
    var scrolling = false, holding = false, last = 0;

    var stop = function () {
      if (!scrolling) return;
      scrolling = false;
      holding = false;
      badge.classList.remove('on', 'up', 'down');
      root.classList.remove('autoscrolling');
    };
    var step = function (now) {
      if (!scrolling) return;
      var dt = last ? Math.min(now - last, 50) : 16;
      last = now;
      var d = cy - oy;
      var dir = d > DEAD ? 1 : d < -DEAD ? -1 : 0;
      badge.classList.toggle('down', dir > 0);
      badge.classList.toggle('up', dir < 0);
      if (dir) {
        // Gentle near the badge, quick far from it, like the browser's own.
        // About 60 px/s just past the dead zone, 350 at 90px, 2800 at 400px.
        var px = Math.min(Math.pow(Math.abs(d) - DEAD, 1.3) * 0.02, 50) * (dt / 16);
        window.scrollBy({ top: dir * px, left: 0, behavior: 'instant' });
      }
      requestAnimationFrame(step);
    };

    document.addEventListener('mousedown', function (event) {
      if (scrolling) {
        // Any press ends it, and is not also a click on what lies beneath.
        event.preventDefault();
        stop();
        return;
      }
      if (event.button !== 1) return;
      var target = event.target && event.target.closest ? event.target : null;
      if (target && target.closest(LEAVE)) return;
      if (document.documentElement.scrollHeight <= window.innerHeight + 1) return;
      event.preventDefault();
      oy = cy = event.clientY;
      pressedAt = event.timeStamp;
      scrolling = true;
      holding = true;
      last = 0;
      badge.style.transform = 'translate3d(' + event.clientX + 'px,' + event.clientY + 'px,0)';
      badge.classList.add('on');
      root.classList.add('autoscrolling');
      requestAnimationFrame(step);
    });
    document.addEventListener('mousemove', function (event) { cy = event.clientY; }, { passive: true });
    document.addEventListener('mouseup', function (event) {
      if (!scrolling || event.button !== 1 || !holding) return;
      holding = false;
      // A quick press and release keeps it going until the next press; a hold
      // that moved away from the badge was a drag, and ends with the release.
      if (event.timeStamp - pressedAt > 350 && Math.abs(cy - oy) > DEAD) stop();
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') stop(); });
    document.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('blur', stop);
  }
})();
