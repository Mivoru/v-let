// ============================================================
//  CONFIG
// ============================================================
const TRIPS = [
  { id: 1, name: '🏔️ Saské Švýcarsko – Schmilka', gpx: 'export%20(1).gpx' },
  { id: 2, name: '🏰 Kokořínský důl & Hrad Kokořín', gpx: 'export.gpx' },
  { id: 3, name: '🏖️ Máchovo jezero & Bezděz',      gpx: 'export%20(2).gpx' },
  { id: 4, name: '🌲 Tolštejn & Jedlová',           gpx: 'export%20(3).gpx' },
];

// ============================================================
//  GALLERY
// ============================================================
const galState = { 1: 0, 2: 0, 3: 0, 4: 0 };

function setGal(id, idx) {
  const inner = document.getElementById('gal-' + id);
  if (!inner) return;
  const imgs = inner.querySelectorAll('.gal-img');
  idx = ((idx % imgs.length) + imgs.length) % imgs.length;
  galState[id] = idx;
  inner.style.transform = `translateX(-${idx * 50}%)`;
  for (let i = 0; i < imgs.length; i++) {
    const d = document.getElementById(`gd-${id}-${i}`);
    if (d) d.classList.toggle('active', i === idx);
  }
}
function galNext(id) { setGal(id, galState[id] + 1); }
function galPrev(id) { setGal(id, galState[id] - 1); }

// ============================================================
//  GPX PARSER
// ============================================================
async function fetchGPX(file) {
  try {
    const res = await fetch(file);
    if (!res.ok) throw new Error('failed');
    const text = await res.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    return [...xml.querySelectorAll('trkpt')].map(pt => [
      parseFloat(pt.getAttribute('lat')),
      parseFloat(pt.getAttribute('lon')),
    ]);
  } catch { return []; }
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

  const latLngs = await fetchGPX(gpxFile);
  if (latLngs.length < 2) {
    container.innerHTML = '<div style="color:#666;padding:20px;text-align:center;font-size:.8rem">Mapa není k dispozici offline</div>';
    return;
  }

  // Init map – no controls, pointer-events off (CSS), tile only
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: true,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    keyboard: false,
  });

  L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 17 }).addTo(map);

  // Fit to route
  const bounds = L.latLngBounds(latLngs);
  map.fitBounds(bounds, { padding: [18, 18] });

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
  const step    = Math.max(1, Math.floor(latLngs.length / 250));
  const sampled = latLngs.filter((_, i) => i % step === 0);
  if (sampled[sampled.length - 1] !== latLngs[latLngs.length - 1])
    sampled.push(latLngs[latLngs.length - 1]);

  mapInstances[id] = { map, ghostPoly, animPoly, movMarker, latLngs, sampled, timer: null };
}

function replayMap(id) {
  const s = mapInstances[id];
  if (!s) return;
  if (s.timer) clearInterval(s.timer);
  s.animPoly.setLatLngs([]);
  s.movMarker.setLatLng(s.sampled[0]);

  let i = 0;
  const DURATION = 5000; // ms total
  const interval = DURATION / s.sampled.length;

  s.timer = setInterval(() => {
    if (i >= s.sampled.length) { clearInterval(s.timer); return; }
    s.animPoly.addLatLng(s.sampled[i]);
    s.movMarker.setLatLng(s.sampled[i]);
    i++;
  }, interval);
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

let liked    = loadLiked();
let counts   = { 1: 0, 2: 0, 3: 0, 4: 0 };
let fireDb   = null;
let likesRef = null;

function initFirebase() {
  try {
    // Pokud config není vyplněn → přeskočit
    if (!FIREBASE_CONFIG.databaseURL || FIREBASE_CONFIG.databaseURL.includes('TVUJ')) {
      console.info('Firebase: config není nastaven – liky jsou jen lokální.');
      return;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    fireDb   = firebase.database();
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
  const btn     = document.getElementById('like-' + id);
  btn.disabled  = true;
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
    const btn   = document.getElementById('like-' + t.id);
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
  const max    = Math.max(1, ...sorted.map(t => counts[t.id] || 0));
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
    const dot   = document.createElement('div');
    const angle = (Math.PI * 2 * i / 18) + (Math.random() - 0.5);
    const dist  = 60 + Math.random() * 80;
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

// Keyframe for marker pulse (injected into <head>)
const markerStyle = document.createElement('style');
markerStyle.textContent = `@keyframes markerPulse { from{box-shadow:0 0 0 3px #06b6d455,0 0 14px #06b6d4aa} to{box-shadow:0 0 0 8px #06b6d422,0 0 24px #06b6d488} }`;
document.head.appendChild(markerStyle);

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  initFirebase();     // připojí Firebase + real-time listener
  renderAll();
  initScrollAnim();
  // Init all Leaflet maps in parallel
  await Promise.all(TRIPS.map(t => initLeafletMap(t.id, t.gpx)));
  setupMapObserver();
});
