// =============================================
// OceanRoute — Smart Shipping for Marine Life
// map.js — Leaflet map + API calls + Chart.js
// =============================================

// ---- STATE ----
let map;
let whaleLayerGroup;
let shipLayerGroup;
let shipRoutes = [];      // current editable ship coordinates
let whaleRoutes = [];     // whale migration coordinates (read only)
let disturbanceHistory = [];  // for time series chart
let disturbanceChart;
let noiseLevel = 120;
let shipDensity = 10;

// ---- INIT MAP ----
function initMap() {
  map = L.map('map', {
    center: [30, -120],
    zoom: 3,
    zoomControl: true,
    attributionControl: false,
  });

  // dark ocean tile layer from CartoDB
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 10,
    minZoom: 2,
  }).addTo(map);

  whaleLayerGroup = L.layerGroup().addTo(map);
  shipLayerGroup  = L.layerGroup().addTo(map);

  loadRoutes();
  initChart();
}

// ---- LOAD ROUTES FROM JSON FILES ----
async function loadRoutes() {
  try {
    const [whaleData, shipData] = await Promise.all([
      fetch('/static/data/whale_routes.json').then(r => r.json()),
      fetch('/static/data/ship_routes.json').then(r => r.json()),
    ]);

    // draw whale routes
    whaleData.routes.forEach(route => {
      const line = L.polyline(route.coordinates, {
        color: route.color,
        weight: 3,
        opacity: 0.8,
        dashArray: '6, 8',
        className: 'whale-route',
      });

      // glow effect using double lines
      const glowLine = L.polyline(route.coordinates, {
        color: route.color,
        weight: 8,
        opacity: 0.1,
      });

      line.bindTooltip(`🐋 ${route.name}<br><i>${route.species}</i><br>${route.season}`, {
        className: 'map-tooltip',
        sticky: true,
      });

      whaleLayerGroup.addLayer(glowLine);
      whaleLayerGroup.addLayer(line);

      // add animated whale markers along path
      addWhaleMarker(route.coordinates[0], route.color, route.name);

      whaleRoutes.push(...route.coordinates);
    });

    // draw ship routes (editable via drag markers)
    shipData.routes.forEach((route, routeIndex) => {
      drawShipRoute(route.coordinates, routeIndex, route.name);
      shipRoutes.push({ name: route.name, coords: [...route.coordinates] });
    });

    // initial disturbance calculation
    updateDisturbance();

    // build route toggles in sidebar
    buildRouteToggles(whaleData.routes, shipData.routes);

  } catch (err) {
    console.error('Error loading routes:', err);
    document.getElementById('statusMsg').textContent = 'Error loading route data.';
  }
}

// ---- DRAW A SHIP ROUTE WITH DRAGGABLE MARKERS ----
function drawShipRoute(coords, routeIndex, routeName) {
  shipLayerGroup.clearLayers();
  shipRoutes = [];

  // re-draw all ship routes (called after any edit)
  fetch('/static/data/ship_routes.json')
    .then(r => r.json())
    .then(shipData => {
      shipData.routes.forEach((route, idx) => {
        const currentCoords = idx === routeIndex ? coords : route.coordinates;
        addShipRoute(currentCoords, idx, route.name);
        shipRoutes.push({ name: route.name, coords: currentCoords });
      });
      updateDisturbance();
    });
}

function addShipRoute(coords, routeIndex, routeName) {
  // glow line
  const glow = L.polyline(coords, {
    color: '#ff4f4f',
    weight: 10,
    opacity: 0.08,
  }).addTo(shipLayerGroup);

  // main line
  const line = L.polyline(coords, {
    color: '#ff4f4f',
    weight: 2.5,
    opacity: 0.9,
  }).addTo(shipLayerGroup);

  line.bindTooltip(`🚢 ${routeName}<br>Drag waypoints to adjust`, {
    sticky: true,
  });

  // add draggable waypoint markers
  coords.forEach((coord, pointIndex) => {
    const marker = L.circleMarker(coord, {
      radius: 6,
      color: '#ff4f4f',
      fillColor: '#1a0a0a',
      fillOpacity: 1,
      weight: 2,
    }).addTo(shipLayerGroup);

    marker.bindTooltip('Drag to reroute', { direction: 'top' });

    // make draggable
    marker.on('mousedown', function(e) {
      map.dragging.disable();
      map.on('mousemove', onMarkerDrag);
      map.on('mouseup', onMarkerDrop);

      function onMarkerDrag(e) {
        const newLatLng = e.latlng;
        coords[pointIndex] = [newLatLng.lat, newLatLng.lng];
        marker.setLatLng(newLatLng);
        line.setLatLngs(coords);
        glow.setLatLngs(coords);
        updateDisturbanceLive(coords);
      }

      function onMarkerDrop() {
        map.dragging.enable();
        map.off('mousemove', onMarkerDrag);
        map.off('mouseup', onMarkerDrop);
        // update the stored routes
        shipRoutes[routeIndex] = { name: routeName, coords: coords };
        updateDisturbance();
      }
    });
  });
}

// ---- ADD ANIMATED WHALE ICON ----
function addWhaleMarker(coord, color, name) {
  const icon = L.divIcon({
    html: `<div style="font-size:18px; filter: drop-shadow(0 0 6px ${color})">🐋</div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  L.marker(coord, { icon })
    .bindPopup(`<b>${name}</b><br>Migration start point`)
    .addTo(whaleLayerGroup);
}

// ---- CALCULATE DISTURBANCE (calls Flask API) ----
async function updateDisturbance() {
  if (shipRoutes.length === 0 || whaleRoutes.length === 0) return;

  // flatten all ship coords
  const allShipCoords = shipRoutes.flatMap(r => r.coords);

  showWave(true);

  try {
    const response = await fetch('/calculate-disturbance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ship_coordinates: allShipCoords,
        whale_coordinates: whaleRoutes,
        noise_level: noiseLevel,
        ship_density: shipDensity,
      }),
    });

    const result = await response.json();
    displayResults(result);
    pushChartData(result.disturbance_score);

  } catch (err) {
    console.error('API error:', err);
    document.getElementById('statusMsg').textContent = 'Could not reach server.';
  }

  showWave(false);
}

// live update while dragging (no chart push)
async function updateDisturbanceLive(changedCoords) {
  const allShipCoords = shipRoutes.flatMap(r => r.coords);

  try {
    const response = await fetch('/calculate-disturbance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ship_coordinates: allShipCoords,
        whale_coordinates: whaleRoutes,
        noise_level: noiseLevel,
        ship_density: shipDensity,
      }),
    });

    const result = await response.json();
    displayResults(result);
  } catch (err) { /* silent during drag */ }
}

// ---- DISPLAY RESULTS IN RIGHT PANEL ----
function displayResults(result) {
  const d = result.disturbance_score;
  const s = result.whale_safety_score;

  // disturbance score color
  let dClass = 'safe';
  if (d > 70) dClass = 'danger';
  else if (d > 40) dClass = 'warn';

  let sClass = 'danger';
  if (s > 60) sClass = 'safe';
  else if (s > 30) sClass = 'warn';

  document.getElementById('disturbanceVal').textContent = d;
  document.getElementById('disturbanceVal').className = `sc-val ${dClass}`;

  document.getElementById('safetyVal').textContent = s;
  document.getElementById('safetyVal').className = `sc-val ${sClass}`;

  document.getElementById('distanceVal').textContent = result.min_distance_km + ' km';
  document.getElementById('affectedVal').textContent = result.affected_whales.toLocaleString();
  document.getElementById('noiseVal').textContent    = result.noise_level + ' dB';
  document.getElementById('densityVal').textContent  = result.ship_density + ' ships';

  // progress bar
  const bar = document.getElementById('disturbanceBarFill');
  bar.style.width = d + '%';
  bar.style.background = dClass === 'danger' ? '#ff4f4f' :
                         dClass === 'warn'   ? '#f5c842' : '#3dd68c';

  // status message
  const msgs = [
    [80, '🔴 Critical — shipping routes severely overlap whale migration.'],
    [60, '🟠 High — significant disturbance to whale communication.'],
    [40, '🟡 Moderate — some impact on nearby whale populations.'],
    [20, '🟢 Low — minimal disruption to whale migration routes.'],
    [ 0, '✅ Excellent — shipping routes safely clear of whale paths.'],
  ];
  const msg = msgs.find(([threshold]) => d >= threshold);
  document.getElementById('statusMsg').textContent = msg ? msg[1] : '✅ Monitoring active.';
}

// ---- CHART.JS SETUP ----
function initChart() {
  const ctx = document.getElementById('disturbanceChart').getContext('2d');
  disturbanceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Disturbance Score',
        data: [],
        borderColor: '#00cfff',
        backgroundColor: 'rgba(0, 207, 255, 0.08)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#00cfff',
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: '#3a6070', font: { size: 9 } },
          grid: { color: 'rgba(0,180,220,0.06)' },
        },
        y: {
          min: 0,
          max: 100,
          ticks: { color: '#3a6070', font: { size: 9 } },
          grid: { color: 'rgba(0,180,220,0.06)' },
        }
      }
    }
  });
}

function pushChartData(score) {
  const now = new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  disturbanceHistory.push({ time: now, score });

  // keep last 20 data points
  if (disturbanceHistory.length > 20) disturbanceHistory.shift();

  disturbanceChart.data.labels = disturbanceHistory.map(d => d.time);
  disturbanceChart.data.datasets[0].data = disturbanceHistory.map(d => d.score);
  disturbanceChart.update('none'); // no animation for performance
}

// ---- OPTIMIZE ROUTE ----
async function optimizeRoute() {
  if (shipRoutes.length === 0) return;

  showWave(true);
  document.getElementById('statusMsg').textContent = '⚙️ Optimizing routes...';

  try {
    const allShipCoords = shipRoutes.flatMap(r => r.coords);

    const response = await fetch('/optimize-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ship_coordinates: allShipCoords,
        whale_coordinates: whaleRoutes,
      }),
    });

    const result = await response.json();

    // redistribute optimized coords back to original routes
    let idx = 0;
    const newRoutes = shipRoutes.map(route => {
      const len = route.coords.length;
      const optimizedSlice = result.optimized_coordinates.slice(idx, idx + len);
      idx += len;
      return { name: route.name, coords: optimizedSlice };
    });

    // redraw ship routes
    shipLayerGroup.clearLayers();
    newRoutes.forEach((route, i) => {
      addShipRoute(route.coords, i, route.name);
    });
    shipRoutes = newRoutes;

    await updateDisturbance();
    document.getElementById('statusMsg').textContent = '✅ Routes optimized for whale safety!';

  } catch (err) {
    document.getElementById('statusMsg').textContent = 'Optimization failed.';
    console.error(err);
  }

  showWave(false);
}

// ---- RESET ROUTES ----
async function resetRoutes() {
  shipLayerGroup.clearLayers();
  whaleLayerGroup.clearLayers();
  shipRoutes = [];
  whaleRoutes = [];
  disturbanceHistory = [];
  disturbanceChart.data.labels = [];
  disturbanceChart.data.datasets[0].data = [];
  disturbanceChart.update();
  loadRoutes();
}

// ---- BUILD ROUTE TOGGLE CHECKBOXES ----
function buildRouteToggles(whaleData, shipData) {
  const container = document.getElementById('routeToggles');
  container.innerHTML = '';

  whaleData.forEach((route, i) => {
    container.innerHTML += `
      <label class="route-toggle">
        <input type="checkbox" checked onchange="toggleWhaleRoute(${i}, this.checked)" />
        <div class="route-dot" style="background:${route.color}"></div>
        <span>${route.name.split('—')[0].trim()}</span>
      </label>
    `;
  });
}

function toggleWhaleRoute(index, visible) {
  const layers = whaleLayerGroup.getLayers();
  // each route has 2 layers (glow + line) + 1 marker
  // simple approach: toggle all if one checkbox
  layers.forEach(layer => {
    if (visible) {
      layer.setStyle({ opacity: 0.8 });
    } else {
      layer.setStyle({ opacity: 0 });
    }
  });
}

// ---- SLIDER HANDLERS ----
function updateNoise(val) {
  noiseLevel = parseInt(val);
  document.getElementById('noiseLabel').textContent = val + ' dB';
  updateDisturbance();
}

function updateDensity(val) {
  shipDensity = parseInt(val);
  document.getElementById('densityLabel').textContent = val;
  updateDisturbance();
}

// ---- WAVE LOADING INDICATOR ----
function showWave(active) {
  document.getElementById('waveBar').classList.toggle('active', active);
}

// ---- INIT ON LOAD ----
window.addEventListener('DOMContentLoaded', () => {
  initMap();
});
