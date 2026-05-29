// ============================================================
//  CONFIG
// ============================================================
const TRIPS = [
  { id: 1, name: '🏔️ Saské Švýcarsko – Schmilka', gpx: 'export%20(1).gpx', lat: 50.89, lon: 14.23, category: 'standard' },
  { id: 2, name: '🏰 Kokořínský důl & Hrad Kokořín', gpx: 'export.gpx', lat: 50.43, lon: 14.63, category: 'standard' },
  { id: 3, name: '🏖️ Máchovo jezero & Bezděz', gpx: 'export%20(2).gpx', lat: 50.56, lon: 14.65, category: 'standard' },
  { id: 4, name: '🌲 Tolštejn & Jedlová', gpx: 'export%20(3).gpx', lat: 50.86, lon: 14.56, category: 'standard' },
  { id: 5, name: '⛰️ Liberec – N. Bor (Ještěd, Ralsko)', gpx: '50km/export.gpx', lat: 50.73, lon: 15.00, category: '50km' },
  { id: 6, name: '🌲 Hřensko – N. Bor (České Švýcarsko)', gpx: '50km/export%20(1).gpx', lat: 50.87, lon: 14.24, category: '50km' },
  { id: 7, name: '🏰 Krompach – N. Bor (Oybin, Luž)', gpx: '50km/export%20(2).gpx', lat: 50.83, lon: 14.69, category: '50km' },
  { id: 8, name: '🏖️ Bělá p. B. – N. Bor (Bezděz, Sloup)', gpx: '50km/export%20(3).gpx', lat: 50.50, lon: 14.80, category: '50km' },
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
        borderColor: 'rgba(16, 185, 129, 1)',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
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
  s.map.setZoom(14, { animate: true });

  let i = 0;
  let lastTime = 0;
  const DURATION = id >= 5 ? 12000 : 5000; // 12s for 50km+, 5s for standard
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

// ============================================================
//  LIKE SYSTEM – Local Server (IP based)
// ============================================================

const API_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') || window.location.origin.startsWith('http://192.168') 
  ? '' // Pokud běžíme na stejném serveru, stačí relativní cesta
  : 'http://localhost:8765'; // Fallback pro vývoj

let liked = {}; // Teď se plní ze serveru podle IP
let counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };

async function syncWithServer() {
  try {
    const res = await fetch(`${API_BASE}/api/likes`);
    if (!res.ok) return;
    const data = await res.json();
    counts = data.counts;
    liked = data.userLikes;
    renderAll();
  } catch (e) {
    console.warn('Server není dostupný, používám lokální data.');
  }
}

async function toggleLike(id) {
  const btn = document.getElementById('like-' + id);
  if (!btn) return;
  btn.disabled = true;

  // Optimistický UI update (okamžitá reakce)
  const previousState = !!liked[id];
  const newLikedState = !previousState;
  
  liked[id] = newLikedState;
  counts[id] += newLikedState ? 1 : -1;

  // Okamžitá animace
  if (newLikedState) {
    btn.classList.add('liked');
    btn.classList.remove('just-liked');
    void btn.offsetWidth;
    btn.classList.add('just-liked');
    setTimeout(() => btn.classList.remove('just-liked'), 500);
    spawnConfetti(btn);
  } else {
    btn.classList.remove('liked', 'just-liked');
  }

  renderAll(); // Překreslí žebříčky a počítadla ihned

  try {
    const res = await fetch(`${API_BASE}/api/like/${id}`, { method: 'POST' });
    const data = await res.json();
    
    // Server potvrdí finální stav
    liked[id] = data.isLiked;
    counts[id] = data.count;
    renderAll();
  } catch (e) {
    // V případě chyby serveru (fallback)
    console.warn('Nepodařilo se spojit se serverem. Lajk uložen pouze lokálně.');
    // Záměrně NEREVERTUJEME stav, aby web fungoval vizuálně i bez běžícího serveru (demo režim).
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
  const renderCategory = (category, elementId) => {
    const lb = document.getElementById(elementId);
    if (!lb) return;
    const catTrips = TRIPS.filter(t => t.category === category);
    const sorted = [...catTrips].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    const max = Math.max(1, ...sorted.map(t => counts[t.id] || 0));
    const medals = ['<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>', '<span style="font-size:12px;font-weight:bold;color:#64748b">4.</span>'];
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
  };

  renderCategory('standard', 'lb-list');
  renderCategory('50km', 'lb-list-50km');
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
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.trip-card').forEach((c, i) => {
    c.style.transitionDelay = `${i * 0.1}s`;
    obs.observe(c);
  });
}

// removed init3DCards

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
      // Nature colors: Soft green and golden pollen
      const color = i.r > 1.5 ? '16, 185, 129' : '245, 158, 11';
      ctx.fillStyle = `rgba(${color}, ${Math.max(0, i.a * 0.3)})`;
      ctx.fill();
    });
    requestAnimationFrame(loop);
  }
  loop();
  window.addEventListener('resize', () => { w = cvs.width = window.innerWidth; h = cvs.height = window.innerHeight; });
}

// removed initScrollParallax

// Keyframe for marker pulse (injected into <head>)
const markerStyle = document.createElement('style');
markerStyle.textContent = `@keyframes markerPulse { from{box-shadow:0 0 0 3px #06b6d455,0 0 14px #06b6d4aa} to{box-shadow:0 0 0 8px #06b6d422,0 0 24px #06b6d488} }`;
document.head.appendChild(markerStyle);

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  syncWithServer();
  // Každých 10 sekund zkontroluj nové lajky od ostatních
  setInterval(syncWithServer, 10000);

  renderAll();
  initParticles();
  initScrollAnim();
  fetchWeather();
  await Promise.all(TRIPS.map(t => initLeafletMap(t.id, t.gpx)));
  setupMapObserver();
});
