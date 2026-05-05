// ============================================================
//  CONFIG
// ============================================================
const TRIPS = [
  { id: 1, name: '🏔️ Saské Švýcarsko – Schmilka', gpx: 'export%20(1).gpx', lat: 50.89, lon: 14.23 },
  { id: 2, name: '🏰 Kokořínský důl & Hrad Kokořín', gpx: 'export.gpx', lat: 50.43, lon: 14.63 },
  { id: 3, name: '🏖️ Máchovo jezero & Bezděz', gpx: 'export%20(2).gpx', lat: 50.56, lon: 14.65 },
  { id: 4, name: '🌲 Tolštejn & Jedlová', gpx: 'export%20(3).gpx', lat: 50.86, lon: 14.56 },
];

// ============================================================
//  WEATHER API
// ============================================================
const OWM_API_KEY = 'dda6c46e74b95dbeffeb910168f345c5';

async function fetchWeather() {
  const days = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  for (const t of TRIPS) {
    const wrap = document.getElementById('weather-' + t.id);
    if (!wrap) continue;
    try {
      const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${t.lat}&lon=${t.lon}&appid=${OWM_API_KEY}&units=metric&lang=cz`);
      const data = await res.json();

      const daily = {};
      data.list.forEach(item => {
        const date = item.dt_txt.split(' ')[0];
        if (!daily[date] || item.dt_txt.includes('12:00:00')) {
          daily[date] = item;
        }
      });

      const itemsHtml = Object.values(daily).slice(0, 5).map(item => {
        const d = new Date(item.dt_txt);
        const dayName = days[d.getDay()];
        const icon = item.weather[0].icon;
        const temp = Math.round(item.main.temp);
        const desc = item.weather[0].description;
        return `
          <div class="weather-day" title="${desc}">
            <div class="w-date">${dayName}</div>
            <img class="w-icon" src="https://openweathermap.org/img/wn/${icon}.png" alt="${desc}">
            <div class="w-temp">${temp}°</div>
          </div>
        `;
      }).join('');

      wrap.innerHTML = itemsHtml;
    } catch (e) {
      wrap.innerHTML = '<div class="weather-loading" style="color:#ef4444">Nelze načíst počasí</div>';
    }
  }
}

// ============================================================
//  GPX PARSER & ELEVATION
// ============================================================
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function fetchGPX(file) {
  try {
    const res = await fetch(file);
    if (!res.ok) throw new Error('failed');
    const text = await res.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');

    let totalDist = 0;
    let lastLat = null, lastLon = null;

    return [...xml.querySelectorAll('trkpt')].map(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      const ele = pt.querySelector('ele');

      if (lastLat !== null) {
        totalDist += getDistance(lastLat, lastLon, lat, lon);
      }
      lastLat = lat; lastLon = lon;

      return {
        lat, lon,
        ele: ele ? parseFloat(ele.textContent) : 0,
        dist: totalDist
      };
    });
  } catch { return []; }
}

function drawElevationChart(id, pts) {
  const ctx = document.getElementById('ele-' + id);
  if (!ctx || !pts.length || !window.Chart) return;
  const step = Math.max(1, Math.floor(pts.length / 100));
  const dataPts = pts.filter((_, i) => i % step === 0);
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: dataPts.map(p => p.dist.toFixed(1) + ' km'),
      datasets: [{
        label: 'Výška (m)',
        data: dataPts.map(p => p.ele),
        borderColor: 'rgba(124,58,237,1)',
        backgroundColor: 'rgba(124,58,237,0.15)',
        borderWidth: 2, fill: true, pointRadius: 0, tension: 0.3
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          display: true,
          ticks: { color: '#94a3b8', font: { size: 10 }, maxTicksLimit: 6 },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          display: true,
          ticks: { color: '#94a3b8', font: { size: 10 }, stepSize: 100 },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      },
      layout: { padding: 10 }
    }
  });
}

// ============================================================
//  LEAFLET MAP ANIMATION
// ============================================================
const mapInstances = {}; // id → { map, ghostPoly, animPoly, marker, latLngs, sampled, timer }

// OpenTopoMap tile (terrain + contours – best for hiking)
const TILE_URL = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '© OpenStreetMap contributors, © OpenTopoMap';

// Marker HTML – pulsing dot
function markerHTML(color) {
  return `<div style="
    width:14px;height:14px;
    background:${color};
    border:2.5px solid #fff;
    border-radius:50%;
    box-shadow:0 0 0 4px ${color}55, 0 0 16px ${color}aa;
    animation:markerPulse 1s ease-in-out infinite alternate;
  "></div>`;
}

async function initLeafletMap(id, gpxFile) {
  const container = document.getElementById('map-' + id);
  if (!container) return;

  const pts = await fetchGPX(gpxFile);
  if (pts.length < 2) {
    container.innerHTML = '<div style="color:#666;padding:20px;text-align:center;font-size:.8rem">Mapa není k dispozici</div>';
    return;
  }

  const latLngs = pts.map(p => [p.lat, p.lon]);
  drawElevationChart(id, pts);

  const map = L.map(container, {
    zoomControl: false, attributionControl: true, dragging: false,
    scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, keyboard: false,
  });

  L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 17 }).addTo(map);
  map.fitBounds(L.latLngBounds(latLngs), { padding: [18, 18] });

  // Ghost full route (dim)
  const ghostPoly = L.polyline(latLngs, {
    color: 'rgba(255,255,255,0.22)',
    weight: 3,
    dashArray: '6 4',
  }).addTo(map);

  // Animated polyline (starts empty)
  const animPoly = L.polyline([], {
    color: '#06b6d4',
    weight: 4.5,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(map);

  // Start marker (green)
  L.marker(latLngs[0], {
    icon: L.divIcon({ html: '<div style="width:10px;height:10px;background:#10b981;border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px #10b981"></div>', iconSize: [10, 10], iconAnchor: [5, 5], className: '' }),
  }).addTo(map);

  // End marker (red) – shown from start
  L.marker(latLngs[latLngs.length - 1], {
    icon: L.divIcon({ html: '<div style="width:10px;height:10px;background:#ef4444;border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px #ef4444"></div>', iconSize: [10, 10], iconAnchor: [5, 5], className: '' }),
  }).addTo(map);

  // Moving marker
  const movIcon = L.divIcon({ html: markerHTML('#06b6d4'), iconSize: [14, 14], iconAnchor: [7, 7], className: '' });
  const movMarker = L.marker(latLngs[0], { icon: movIcon, zIndexOffset: 1000 }).addTo(map);

  // Sample ~250 points for smooth animation
  const step = Math.max(1, Math.floor(latLngs.length / 250));
  const sampled = latLngs.filter((_, i) => i % step === 0);
  if (sampled[sampled.length - 1] !== latLngs[latLngs.length - 1])
    sampled.push(latLngs[latLngs.length - 1]);

  mapInstances[id] = { map, ghostPoly, animPoly, movMarker, latLngs, sampled, timer: null };
}

function replayMap(id) {
  const s = mapInstances[id];
  if (!s) return;
  if (s.timer) cancelAnimationFrame(s.timer);

  s.animPoly.setLatLngs([]);
  s.movMarker.setLatLng(s.sampled[0]);

  // Set a slightly further zoom for a better overview during flyby
  s.map.setZoom(10, { animate: true });

  let i = 0;
  let lastTime = 0;
  const DURATION = 30000; // 30 seconds - very slow and smooth
  const startTime = performance.now();

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / DURATION, 1);

    // Calculate index based on progress
    const targetIndex = Math.floor(progress * (s.sampled.length - 1));

    while (i <= targetIndex) {
      s.animPoly.addLatLng(s.sampled[i]);
      s.movMarker.setLatLng(s.sampled[i]);
      // Center map on marker
      s.map.panTo(s.sampled[i], { animate: false });
      i++;
    }

    if (progress < 1) {
      s.timer = requestAnimationFrame(step);
    } else {
      // Animation finished -> Zoom out to show full route
      setTimeout(() => {
        s.map.fitBounds(L.latLngBounds(s.latLngs), { padding: [18, 18], animate: true });
      }, 500);
    }
  }

  s.timer = requestAnimationFrame(step);
}

// Auto-play when map scrolls into view
function setupMapObserver() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = parseInt(e.target.dataset.id);
        // Short delay to let tiles load
        setTimeout(() => replayMap(id), 800);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.3 });

  TRIPS.forEach(t => {
    const el = document.getElementById('map-' + t.id);
    if (el) { el.dataset.id = t.id; obs.observe(el); }
  });
}

// ============================================================
//  FIREBASE CONFIG
//  → Vyplň svými hodnotami z Firebase Console (viz návod níže)
//  → https://console.firebase.google.com
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCn0GmOGrLTy2IEXYlF3q3CBjWy2BBdpDI",
  authDomain: "vylet-dff14.firebaseapp.com",
  databaseURL: "https://vylet-dff14-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "vylet-dff14",
  storageBucket: "vylet-dff14.firebasestorage.app",
  messagingSenderId: "933796149925",
  appId: "1:933796149925:web:d85c476fe6a9916e4feb4c",
  measurementId: "G-RCVSCBMJQW"
};

// ============================================================
//  LIKE SYSTEM – Firebase Realtime Database
//  ❤️ počet   = sdílený pro všechny v reálném čase
//  ♥ srdíčko = per-zařízení (localStorage)
// ============================================================

function loadLiked() {
  try { return JSON.parse(localStorage.getItem('vylet_liked_2026')) || {}; }
  catch { return {}; }
}
function saveLiked(l) { localStorage.setItem('vylet_liked_2026', JSON.stringify(l)); }

let liked = loadLiked();
let counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
let fireDb = null;
let likesRef = null;

function initFirebase() {
  try {
    // Pokud config není vyplněn → přeskočit
    if (!FIREBASE_CONFIG.databaseURL || FIREBASE_CONFIG.databaseURL.includes('TVUJ')) {
      console.info('Firebase: config není nastaven – liky jsou jen lokální.');
      return;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    fireDb = firebase.database();
    likesRef = fireDb.ref('likes');

    // 🔴 Real-time listener – všichni vidí změny okamžitě
    likesRef.on('value', snapshot => {
      const data = snapshot.val() || {};
      TRIPS.forEach(t => { counts[t.id] = data[t.id] || 0; });
      renderAll();
    });
  } catch (e) {
    console.warn('Firebase init selhal:', e);
  }
}

async function toggleLike(id) {
  const btn = document.getElementById('like-' + id);
  btn.disabled = true;
  const wasLiked = !!liked[id];

  // Optimistická aktualizace UI (okamžitá zpětná vazba)
  if (wasLiked) {
    liked[id] = false;
    btn.classList.remove('liked', 'just-liked');
  } else {
    liked[id] = true;
    btn.classList.add('liked');
    btn.classList.remove('just-liked');
    void btn.offsetWidth;
    btn.classList.add('just-liked');
    setTimeout(() => btn.classList.remove('just-liked'), 500);
    spawnConfetti(btn);
  }
  saveLiked(liked);

  if (likesRef) {
    // Firebase – atomická transakce (bezpečná při souběžných kliknutích)
    try {
      await fireDb.ref(`likes/${id}`).transaction(current =>
        Math.max(0, (current || 0) + (wasLiked ? -1 : 1))
      );
      // Listener výše automaticky překreslí s novým počtem
    } catch (e) {
      counts[id] = Math.max(0, counts[id] + (wasLiked ? -1 : 1));
      renderAll();
    }
  } else {
    // Fallback: žádný server → jen lokálně
    counts[id] = Math.max(0, counts[id] + (wasLiked ? -1 : 1));
    renderAll();
  }

  btn.disabled = false;
}

function renderButtons() {
  TRIPS.forEach(t => {
    const btn = document.getElementById('like-' + t.id);
    const count = document.getElementById('count-' + t.id);
    if (!btn || !count) return;
    count.textContent = counts[t.id] || 0;
    btn.classList.toggle('liked', !!liked[t.id]);
  });
}

function renderLeaderboard() {
  const lb = document.getElementById('lb-list');
  if (!lb) return;
  const sorted = [...TRIPS].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
  const max = Math.max(1, ...sorted.map(t => counts[t.id] || 0));
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  lb.innerHTML = sorted.map((t, i) => {
    const v = counts[t.id] || 0;
    return `<div class="lb-item" style="animation-delay:${i * 0.08}s">
      <div class="lb-rank">${medals[i]}</div>
      <div>
        <div class="lb-name">${t.name}</div>
        <div class="lb-bar-wrap"><div class="lb-bar" style="width:${(v / max) * 100}%"></div></div>
      </div>
      <div class="lb-votes">${v} ❤️</div>
    </div>`;
  }).join('');
}

function renderAll() { renderButtons(); renderLeaderboard(); }

// ============================================================
//  CONFETTI
// ============================================================
function spawnConfetti(btn) {
  const { left, top, width, height } = btn.getBoundingClientRect();
  const cx = left + width / 2, cy = top + height / 2;
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#7c3aed', '#06b6d4', '#fff'];
  for (let i = 0; i < 18; i++) {
    const dot = document.createElement('div');
    const angle = (Math.PI * 2 * i / 18) + (Math.random() - 0.5);
    const dist = 60 + Math.random() * 80;
    dot.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${4 + Math.random() * 6}px;height:${4 + Math.random() * 6}px;background:${colors[i % colors.length]};border-radius:${Math.random() > .5 ? '50%' : '2px'};pointer-events:none;z-index:9999;transform:translate(-50%,-50%)`;
    document.body.appendChild(dot);
    dot.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px),calc(-50% + ${Math.sin(angle) * dist - 30}px)) scale(0)`, opacity: 0 },
    ], { duration: 600 + Math.random() * 400, easing: 'cubic-bezier(0,0,0.2,1)', fill: 'forwards' })
      .finished.then(() => dot.remove());
  }
}

// ============================================================
//  CARD SCROLL ANIMATION
// ============================================================
function initScrollAnim() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.trip-card').forEach((c, i) => {
    c.style.cssText += `opacity:0;transform:translateY(40px);transition:opacity .6s ease ${i * .1}s,transform .6s ease ${i * .1}s`;
    obs.observe(c);
  });
}

// ============================================================
//  PREMIUM: 3D CARD HOVER & PARTICLES
// ============================================================
function init3DCards() {
  document.querySelectorAll('.trip-card').forEach(card => {
    const glare = card.querySelector('.card-glare');
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const xc = rect.width / 2, yc = rect.height / 2;
      const rx = -(y - yc) / yc * 8, ry = (x - xc) / xc * 8;
      card.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.01,1.01,1.01)`;
      if (glare) glare.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.18) 0%, transparent 60%)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = `perspective(1000px) rotateX(0) rotateY(0) scale3d(1,1,1)`;
      if (glare) glare.style.background = `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.12) 0%, transparent 50%)`;
    });
  });
}

function initParticles() {
  const cvs = document.getElementById('particles-bg');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  let w = cvs.width = window.innerWidth, h = cvs.height = window.innerHeight;
  const p = Array.from({ length: 40 }, () => ({
    x: Math.random() * w, y: Math.random() * h,
    r: Math.random() * 2 + 0.5,
    vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
    a: Math.random(), da: (Math.random() - 0.5) * 0.02
  }));
  function loop() {
    ctx.clearRect(0, 0, w, h);
    p.forEach(i => {
      i.x += i.vx; i.y += i.vy; i.a += i.da;
      if (i.a > 1 || i.a < 0) i.da *= -1;
      if (i.x < 0) i.x = w; if (i.x > w) i.x = 0;
      if (i.y < 0) i.y = h; if (i.y > h) i.y = 0;
      ctx.beginPath(); ctx.arc(i.x, i.y, i.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(167, 139, 250, ${Math.max(0, i.a * 0.6)})`; ctx.fill();
    });
    requestAnimationFrame(loop);
  }
  loop();
  window.addEventListener('resize', () => { w = cvs.width = window.innerWidth; h = cvs.height = window.innerHeight; });
}

function initScrollParallax() {
  const heroContent = document.querySelector('.hero-content');
  const bentoGrid = document.querySelector('.bento-grid');

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    if (scrollY < window.innerHeight) {
      const op = Math.max(0, 1 - (scrollY / 400));
      const ty = scrollY * 0.4;

      if (heroContent) {
        heroContent.style.transform = `translateY(${ty}px)`;
        heroContent.style.opacity = op;
      }
      if (bentoGrid) {
        bentoGrid.style.transform = `translateY(${ty * 1.2}px)`;
        bentoGrid.style.opacity = op;
      }
    }
  }, { passive: true });
}

// Keyframe for marker pulse (injected into <head>)
const markerStyle = document.createElement('style');
markerStyle.textContent = `@keyframes markerPulse { from{box-shadow:0 0 0 3px #06b6d455,0 0 14px #06b6d4aa} to{box-shadow:0 0 0 8px #06b6d422,0 0 24px #06b6d488} }`;
document.head.appendChild(markerStyle);

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  initFirebase();
  renderAll();
  init3DCards();
  initParticles();
  initScrollParallax();
  initScrollAnim();
  fetchWeather(); // asynchronní načtení počasí
  // Init all Leaflet maps in parallel
  await Promise.all(TRIPS.map(t => initLeafletMap(t.id, t.gpx)));
  setupMapObserver();
});
