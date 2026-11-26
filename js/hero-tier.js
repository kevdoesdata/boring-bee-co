/* Hero jars: which version does this device get?
     full  = desktop / laptop: the full 3D jars
     phone = recent phone: same 3D look, battery-saving habits, touch-friendly
     lite  = older or budget phone (about 5+ years old): lighter 3D honey, 30 fps
     photo = the photos already in the page (very old phones, data saver, reduce motion, no 3D, or 3D failed)
   Browsers don't say how old a phone is, so this reads the clues they do give; js/hero-3d.js also steps down
   a level if the phone turns out slower than it looked. The photos are the first paint for everyone, and the 3D
   fades in over them once it's ready. To try a tier on purpose, add #tier=full|phone|lite|photo to the URL. */

// OFF SWITCH: set to false to show the still photos to everyone (the 3D files are then never downloaded).
// #tier=full in the URL still shows the 3D, for testing a fix before switching it back on.
var HERO_3D = true;

(function () {
  // this script's ?v= (cache-busting) is passed on to the 3D file it loads
  var self = document.currentScript, V = self && self.src.indexOf('?') > 0 ? self.src.slice(self.src.indexOf('?')) : '';
  var nav = navigator, ua = nav.userAgent || '', html = document.documentElement;
  var mm = function (q) { return matchMedia(q).matches; };
  var why = [], cutoff = new Date().getFullYear() - 5;
  var short = Math.min(screen.width, screen.height);
  var touch = mm('(hover: none)') && mm('(pointer: coarse)');
  var mobileUA = /iPhone|iPod|Android.+Mobile|Mobile.+Firefox/i.test(ua) || !!(nav.userAgentData && nav.userAgentData.mobile);
  var phone = short <= 600 && (touch || mobileUA);

  // the graphics chip dates an Android phone well; iPhones hide theirs
  var gl = null, gpu = '';
  try {
    var c = document.createElement('canvas');
    gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
      var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    }
  } catch (e) { gl = null; }
  var chip = gpuAge(gpu);

  var tier = phone ? 'phone' : 'full';
  if (phone) {
    var older = function (reason) { tier = 'lite'; why.push(reason); };
    if (chip.year && chip.year < cutoff) older(chip.name + ' graphics, ~' + chip.year);
    else if (chip.weak) older(chip.name + ' graphics, budget chip');
    if (nav.deviceMemory && nav.deviceMemory <= 3) older(nav.deviceMemory + ' GB memory');
    if (/Android/i.test(ua) && nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) older(nav.hardwareConcurrency + ' CPU cores');
    var ios = ua.match(/(?:iPhone|CPU) OS (\d+)_/);
    if (ios && /iPhone|iPod/.test(ua) && +ios[1] < 17) older('iOS ' + ios[1]);
    var dims = short + 'x' + Math.max(screen.width, screen.height);
    if (/iPhone|iPod/.test(ua) && ['320x568', '375x667', '414x736'].indexOf(dims) >= 0) older('iPhone 8-era screen');
  }
  if (nav.connection && nav.connection.saveData) { tier = 'photo'; why.push('data saver on'); }
  if (mm('(prefers-reduced-motion: reduce)')) { tier = 'photo'; why.push('reduce motion on'); }
  if (!gl) { tier = 'photo'; why.push('no 3D graphics'); }
  if (!HERO_3D) { tier = 'photo'; why.push('3D switched off'); }
  if (typeof Promise === 'undefined' || !('noModule' in document.createElement('script'))) { tier = 'photo'; why.push('old browser'); }

  var forced = (location.hash.match(/tier=(full|phone|lite|photo)/) || [])[1] || null;
  var BB = window.BB = {
    auto: tier, tier: forced || tier, forced: forced, why: why, phone: phone, touch: touch, gpu: gpu,
    T0: performance.now(),
    emulateTouch: !touch && (forced === 'phone' || forced === 'lite'),   // so a mouse can try the phone gestures
    updatePill: function () {},                                           // (the preview's tier pill; nothing here)
  };
  html.classList.add('tier-' + BB.tier);
  if (phone && nav.getBattery) nav.getBattery().then(function (b) { if (!b.charging && b.level <= 0.2) BB.lowBattery = true; }).catch(function () {});
  if (BB.tier === 'photo') return;

  // the 3D waits for the page's own entrance (headline "up", jars "rise") before taking over
  BB.introEnd = new Promise(function (res) {
    var done = false, finish = function () { if (!done) { done = true; setTimeout(res, 80); } };
    setTimeout(finish, 2600);
    var go = function () {
      var anims = document.getAnimations ? document.getAnimations().filter(function (a) { return a.animationName === 'rise' || a.animationName === 'up'; }) : [];
      Promise.all(anims.map(function (a) { return a.finished.catch(function () {}); })).then(finish);
    };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : go();
  });
  // the swap: the live canvas fades in over the photos, then the photos step back
  BB.show3D = function () {
    html.classList.add('gl-ready');
    setTimeout(function () { if (html.classList.contains('gl-ready')) html.classList.add('gl-on'); }, 500);
  };
  BB.back2D = function (reason) {
    BB.tier = 'photo'; if (reason) why.push(reason);
    html.classList.remove('gl-on', 'gl-ready', 'tier-full', 'tier-phone', 'tier-lite'); html.classList.add('tier-photo');
  };

  // load the 3D only once the page and photos are done (desktop right after, phones when the browser is idle)
  var load = function () {
    import(new URL('js/hero-3d.js' + V, document.baseURI).href).catch(function (e) {
      console.warn('3D jars failed to load; keeping the photos', e); BB.back2D('3D failed to load');
    });
  };
  var later = function () { window.requestIdleCallback ? requestIdleCallback(load, { timeout: BB.tier === 'full' ? 500 : 1500 }) : setTimeout(load, 300); };
  document.readyState === 'complete' ? later() : addEventListener('load', later, { once: true });

  function gpuAge(r) {
    var m, Y, n;
    if ((m = r.match(/Adreno\D*(\d{3})/i))) {
      n = +m[1];
      Y = { 505: 2016, 506: 2016, 508: 2017, 509: 2017, 510: 2015, 512: 2017, 530: 2016, 540: 2017,
        605: 2018, 608: 2018, 610: 2019, 612: 2019, 613: 2022, 615: 2018, 616: 2018, 618: 2019, 619: 2020, 620: 2020,
        630: 2018, 640: 2019, 642: 2021, 643: 2021, 644: 2022, 650: 2020, 660: 2021, 662: 2022, 663: 2023, 680: 2021, 690: 2021 };
      return { name: 'Adreno ' + n, year: Y[n] || (n >= 700 ? 2022 : n >= 600 ? 2019 : n >= 500 ? 2016 : 2014), weak: n < 616 };
    }
    if ((m = r.match(/Mali-?([GT])(\d+)/i))) {
      n = +m[2];
      if (m[1].toUpperCase() === 'T') return { name: 'Mali-T' + n, year: 2015, weak: true };
      Y = { 31: 2018, 51: 2016, 52: 2018, 57: 2020, 68: 2021, 71: 2016, 72: 2017, 76: 2018, 77: 2019, 78: 2020,
        310: 2022, 510: 2021, 610: 2022, 615: 2022, 620: 2023, 710: 2021, 715: 2022, 720: 2023, 925: 2024 };
      return { name: 'Mali-G' + n, year: Y[n] || (n >= 700 ? 2021 : n >= 100 ? 2022 : 2017), weak: [31, 51, 52, 57, 68, 310, 510].indexOf(n) >= 0 };
    }
    if (/PowerVR/i.test(r)) return { name: 'PowerVR', year: 2016, weak: true };
    if (/Xclipse|Immortalis/i.test(r)) return { name: r.match(/Xclipse|Immortalis/i)[0], year: 2022, weak: false };
    return { name: '', year: 0, weak: false };
  }
})();
