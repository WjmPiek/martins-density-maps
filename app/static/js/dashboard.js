const appContext = window.APP_CONTEXT || {};

const state = {
  records: [],
  filtered: [],
  currentMapView: 'markers',
  availableUsers: [],
  selectedUserId: String(appContext.selectedUserId || ''),
};

const els = {
  totalRows: document.getElementById('totalRows'),
  mappedRows: document.getElementById('mappedRows'),
  unmappedRows: document.getElementById('unmappedRows'),
  scopeValue: document.getElementById('scopeValue'),
  userFilter: document.getElementById('userFilter'),
  townFilter: document.getElementById('townFilter'),
  provinceFilter: document.getElementById('provinceFilter'),
  formStatus: document.getElementById('formStatus'),
  addressHelp: document.getElementById('addressHelp'),
  recordForm: document.getElementById('recordForm'),
  clearFormBtn: document.getElementById('clearFormBtn'),
  recordsTable: document.getElementById('recordsTable'),
  recordId: document.getElementById('recordId'),
  mfFile: document.getElementById('mfFile'),
  dod: document.getElementById('dod'),
  deceasedName: document.getElementById('deceasedName'),
  deceasedSurname: document.getElementById('deceasedSurname'),
  deceasedAddress: document.getElementById('deceasedAddress'),
  churchName: document.getElementById('churchName'),
  churchAddress: document.getElementById('churchAddress'),
  pastorName: document.getElementById('pastorName'),
  address: document.getElementById('address'),
  city: document.getElementById('city'),
  province: document.getElementById('province'),
  postalCode: document.getElementById('postalCode'),
  country: document.getElementById('country'),
  fullAddress: document.getElementById('fullAddress'),
  latitude: document.getElementById('latitude'),
  longitude: document.getElementById('longitude'),
  weight: document.getElementById('weight'),
  nextOfKinName: document.getElementById('nextOfKinName'),
  nextOfKinSurname: document.getElementById('nextOfKinSurname'),
  relationship: document.getElementById('relationship'),
  contactNumber: document.getElementById('contactNumber'),
  mapMode: document.getElementById('mapMode'),
  heatRadius: document.getElementById('heatRadius'),
  pinRadius: document.getElementById('pinRadius'),
  chartViewFilter: document.getElementById('chartViewFilter'),
  chartFromDate: document.getElementById('chartFromDate'),
  chartToDate: document.getElementById('chartToDate'),
  chartLimitFilter: document.getElementById('chartLimitFilter'),
  chartSummary: document.getElementById('chartSummary'),
};

let map;
let baseLayer;
let heatLayer = null;
let markerLayer = null;
let clusterLayer = null;
let mainChartInstance = null;
let geocodeQueueActive = false;

function setBox(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  el.classList.toggle('error', isError);
}

function clearBox(el) {
  if (!el) return;
  el.textContent = '';
  el.classList.add('hidden');
  el.classList.remove('error');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function popupHtml(record) {
  const lat = Number(record.latitude);
  const lng = Number(record.longitude);
  const googleMapsHref = Number.isFinite(lat) && Number.isFinite(lng)
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : '';

  return `
    <div class="popup-grid">
      <strong>${escapeHtml(record.deceasedName || '')} ${escapeHtml(record.deceasedSurname || '')}</strong>
      <div><b>MF File:</b> ${escapeHtml(record.mfFile || '-')}</div>
      <div><b>DOD:</b> ${escapeHtml(record.dod || '-')}</div>
      <div><b>Deceased Address:</b> ${escapeHtml(record.deceasedAddress || record.address || '-')}</div>
      <div><b>Church:</b> ${escapeHtml(record.churchName || '-')}</div>
      <div><b>Pastor:</b> ${escapeHtml(record.pastorName || '-')}</div>
      <div><b>Church Address:</b> ${escapeHtml(record.churchAddress || '-')}</div>
      <div><b>Address:</b> ${escapeHtml(record.fullAddress || record.address || '-')}</div>
      <div><b>Town:</b> ${escapeHtml(record.city || '-')}</div>
      <div><b>Province:</b> ${escapeHtml(record.province || '-')}</div>
      <div><b>Contact:</b> ${escapeHtml(record.contactNumber || '-')}</div>
      ${googleMapsHref ? `<div><a href="${googleMapsHref}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a></div>` : ''}
    </div>
  `;
}

function normalizeProvinceName(value) {
  if (!value) return '';
  const provinceMap = {
    'eastern cape': 'Eastern Cape',
    'free state': 'Free State',
    'gauteng': 'Gauteng',
    'kwazulu-natal': 'KwaZulu-Natal',
    'kwa-zulu natal': 'KwaZulu-Natal',
    'limpopo': 'Limpopo',
    'mpumalanga': 'Mpumalanga',
    'north west': 'North West',
    'northwest': 'North West',
    'northern cape': 'Northern Cape',
    'western cape': 'Western Cape',
  };
  const key = String(value).trim().toLowerCase();
  return provinceMap[key] || value;
}

function getAddressComponent(components, type) {
  return (components || []).find((component) => component.types && component.types.includes(type));
}

function getFullAddressFromForm() {
  const parts = [
    els.address?.value,
    els.city?.value,
    els.province?.value,
    els.postalCode?.value,
    els.country?.value || 'South Africa',
  ].map((item) => String(item || '').trim()).filter(Boolean);

  return parts.join(', ');
}

function initAddressAutocomplete() {
  const streetInput = els.address;
  if (!streetInput || !window.google || !google.maps || !google.maps.places) return;
  if (streetInput.dataset.autocompleteReady === '1') return;
  streetInput.dataset.autocompleteReady = '1';

  const autocomplete = new google.maps.places.Autocomplete(streetInput, {
    fields: ['formatted_address', 'geometry', 'address_components', 'name'],
    types: ['address'],
    componentRestrictions: { country: 'za' },
  });

  streetInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.preventDefault();
  });

  streetInput.addEventListener('input', () => {
    if (els.latitude) els.latitude.value = '';
    if (els.longitude) els.longitude.value = '';
    if (els.fullAddress) els.fullAddress.value = getFullAddressFromForm();
    if (els.country && !els.country.value) els.country.value = 'South Africa';
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place || !place.address_components) return;

    const components = place.address_components || [];
    const streetNumber = getAddressComponent(components, 'street_number');
    const route = getAddressComponent(components, 'route');
    const locality =
      getAddressComponent(components, 'locality') ||
      getAddressComponent(components, 'postal_town') ||
      getAddressComponent(components, 'administrative_area_level_2') ||
      getAddressComponent(components, 'sublocality_level_1') ||
      getAddressComponent(components, 'sublocality');
    const province = getAddressComponent(components, 'administrative_area_level_1');
    const postalCode = getAddressComponent(components, 'postal_code');
    const country = getAddressComponent(components, 'country');

    const streetValue =
      [streetNumber && streetNumber.long_name, route && route.long_name]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      place.name ||
      streetInput.value ||
      '';

    if (els.address) els.address.value = streetValue;
    if (els.city) els.city.value = locality && locality.long_name ? locality.long_name : '';
    if (els.province) els.province.value = normalizeProvinceName(province && province.long_name ? province.long_name : '');
    if (els.postalCode) els.postalCode.value = postalCode && postalCode.long_name ? postalCode.long_name : '';
    if (els.country) els.country.value = country && country.long_name ? country.long_name : 'South Africa';
    if (els.fullAddress) els.fullAddress.value = place.formatted_address || getFullAddressFromForm();

    if (place.geometry && place.geometry.location) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      if (els.latitude) els.latitude.value = lat;
      if (els.longitude) els.longitude.value = lng;
      if (map) map.setView([lat, lng], 15, { animate: true });
      clearBox(els.addressHelp);
    }
  });
}

window.initGoogleAddress = function initGoogleAddress() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAddressAutocomplete, { once: true });
  } else {
    initAddressAutocomplete();
  }
};

async function geocodeAddress(fullAddress) {
  const address = String(fullAddress || '').trim();
  if (!address) return null;

  if (window.google && google.maps && google.maps.Geocoder) {
    const geocoder = new google.maps.Geocoder();
    return new Promise((resolve) => {
      geocoder.geocode({ address, componentRestrictions: { country: 'ZA' } }, (results, status) => {
        if (status === 'OK' && results && results[0] && results[0].geometry && results[0].geometry.location) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng(), source: 'google' });
        } else {
          resolve(null);
        }
      });
    });
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', address);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'za');
  const response = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
  });
  if (!response.ok) return null;
  const results = await response.json();
  if (!Array.isArray(results) || !results.length) return null;
  return {
    lat: Number(results[0].lat),
    lng: Number(results[0].lon),
    source: 'osm',
  };
}

function autoMapMode() {
  state.currentMapView = 'markers';
  if (els.mapMode) els.mapMode.value = 'pins';
}

function buildTileLayer(url, options = {}) {
  return L.tileLayer(url, {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
    ...options,
  });
}

function attachTileFallbacks() {
  if (!baseLayer || !map) return;
  let fallbackUsed = false;
  baseLayer.on('tileerror', () => {
    if (fallbackUsed || !map) return;
    fallbackUsed = true;
    if (map.hasLayer(baseLayer)) map.removeLayer(baseLayer);
    baseLayer = buildTileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    });
    baseLayer.addTo(map);
  });
}

function refreshMapSize() {
  if (map) map.invalidateSize();
}

function initMap() {
  const mapEl = document.getElementById('map');
  if (!mapEl || typeof L === 'undefined') return;

  const southAfricaBounds = [
    [-35.5, 16.0],
    [-22.0, 33.5],
  ];

  map = L.map('map', {
    preferCanvas: true,
    zoomControl: true,
    scrollWheelZoom: true,
    maxBounds: southAfricaBounds,
    maxBoundsViscosity: 1.0,
  });
  map.scrollWheelZoom.enable();

  map.fitBounds(southAfricaBounds);
  baseLayer = buildTileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
  baseLayer.addTo(map);
  attachTileFallbacks();

  markerLayer = L.layerGroup();
  clusterLayer = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 60,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
  });

  if (els.mapMode) {
    els.mapMode.addEventListener('change', () => {
      const value = els.mapMode.value;
      if (value === 'heatmap') state.currentMapView = 'heat';
      else if (value === 'clusters') state.currentMapView = 'clusters';
      else if (value === 'churches') state.currentMapView = 'churches';
      else state.currentMapView = 'markers';
      renderMap();
    });
  }

  els.heatRadius?.addEventListener('input', renderMap);
  els.pinRadius?.addEventListener('input', renderMap);

  window.addEventListener('load', () => setTimeout(refreshMapSize, 300));
  window.addEventListener('resize', () => setTimeout(refreshMapSize, 150));
  window.addEventListener('orientationchange', () => setTimeout(refreshMapSize, 300));
  setTimeout(refreshMapSize, 300);
}

function clearMapLayers() {
  if (!map) return;
  if (heatLayer && map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
  if (markerLayer && map.hasLayer(markerLayer)) map.removeLayer(markerLayer);
  if (clusterLayer && map.hasLayer(clusterLayer)) map.removeLayer(clusterLayer);
  heatLayer = null;
  markerLayer?.clearLayers();
  clusterLayer?.clearLayers();
}


function getChurchCoveragePoints(records) {
  const groups = new Map();
  records.forEach((record) => {
    const lat = Number(record.latitude);
    const lng = Number(record.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const churchName = String(record.churchName || '').trim();
    const churchAddress = String(record.churchAddress || '').trim();
    if (!churchName && !churchAddress) return;
    const key = `${churchName.toLowerCase()}|${churchAddress.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        churchName: churchName || 'Unnamed church',
        churchAddress: churchAddress || '-',
        pastorName: record.pastorName || '-',
        count: 0,
        latSum: 0,
        lngSum: 0,
        towns: new Set(),
      });
    }
    const item = groups.get(key);
    item.count += 1;
    item.latSum += lat;
    item.lngSum += lng;
    if (record.city) item.towns.add(record.city);
    if ((!item.pastorName || item.pastorName === '-') && record.pastorName) item.pastorName = record.pastorName;
  });
  return Array.from(groups.values()).map((item) => ({
    ...item,
    latitude: item.latSum / item.count,
    longitude: item.lngSum / item.count,
    townsLabel: Array.from(item.towns).slice(0, 4).join(', '),
  }));
}

function churchCoveragePopup(item) {
  const googleMapsHref = Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
    ? `https://www.google.com/maps?q=${item.latitude},${item.longitude}`
    : '';

  return `
    <div class="popup-grid">
      <strong>${escapeHtml(item.churchName || 'Church coverage')}</strong>
      <div><b>Pastor:</b> ${escapeHtml(item.pastorName || '-')}</div>
      <div><b>Church Address:</b> ${escapeHtml(item.churchAddress || '-')}</div>
      <div><b>Covered records:</b> ${escapeHtml(item.count)}</div>
      <div><b>Towns:</b> ${escapeHtml(item.townsLabel || '-')}</div>
      ${googleMapsHref ? `<div><a href="${googleMapsHref}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a></div>` : ''}
    </div>
  `;
}

function renderMap() {
  if (!map || !markerLayer || !clusterLayer) return;
  clearMapLayers();

  const mapped = state.filtered.filter((r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)));
  if (!mapped.length) {
    map.fitBounds([[-35.5, 16.0], [-22.0, 33.5]]);
    return;
  }

  refreshMapSize();
  const heatRadius = parseInt(els.heatRadius?.value || '25', 10);
  const pinRadius = parseInt(els.pinRadius?.value || '6', 10);
  const heatData = [];
  const bounds = [];

  mapped.forEach((record) => {
    const lat = Number(record.latitude);
    const lng = Number(record.longitude);
    heatData.push([lat, lng, Number(record.weight || 1)]);
    bounds.push([lat, lng]);
    const popup = popupHtml(record);
    markerLayer.addLayer(L.circleMarker([lat, lng], {
      radius: pinRadius,
      weight: 1,
      opacity: 0.95,
      fillOpacity: 0.85,
    }).bindPopup(popup));
    clusterLayer.addLayer(L.marker([lat, lng]).bindPopup(popup));
  });

  if (state.currentMapView === 'churches') {
    const churches = getChurchCoveragePoints(mapped);
    churches.forEach((item) => {
      const lat = Number(item.latitude);
      const lng = Number(item.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const radius = Math.max(pinRadius + 2, Math.min(pinRadius + item.count, 18));
      markerLayer.addLayer(L.circleMarker([lat, lng], {
        radius,
        weight: 2,
        opacity: 0.95,
        fillOpacity: 0.75,
      }).bindPopup(churchCoveragePopup(item)));
    });
    markerLayer.addTo(map);
  } else if (state.currentMapView === 'heat' && mapped.length > 20) {
    heatLayer = L.heatLayer(heatData, {
      radius: heatRadius,
      blur: 25,
      maxZoom: 12,
      max: 1.0,
      gradient: {
        0.2: 'blue',
        0.4: 'lime',
        0.6: 'yellow',
        0.8: 'orange',
        1.0: 'red',
      },
    }).addTo(map);
  } else if (state.currentMapView === 'clusters' && mapped.length > 1) {
    clusterLayer.addTo(map);
  } else {
    markerLayer.addTo(map);
  }

  if (bounds.length === 1) map.setView(bounds[0], 10);
  else map.fitBounds(bounds, { padding: [24, 24] });
}

function focusSavedRecordOnMap(record) {
  if (!map || !record || !markerLayer || !clusterLayer) return;
  const lat = Number(record.latitude);
  const lng = Number(record.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const popup = popupHtml(record);
  clearMapLayers();
  const pinRadius = parseInt(els.pinRadius?.value || '6', 10);
  const circle = L.circleMarker([lat, lng], {
    radius: pinRadius,
    weight: 1,
    opacity: 0.95,
    fillOpacity: 0.85,
  }).bindPopup(popup);
  markerLayer.addLayer(circle);
  clusterLayer.addLayer(L.marker([lat, lng]).bindPopup(popup));
  markerLayer.addTo(map);
  circle.openPopup();
  map.setView([lat, lng], 16, { animate: true });
}

function getSelectedUserName() {
  if (!state.selectedUserId) return '';
  const selected = state.availableUsers.find((user) => String(user.id) === String(state.selectedUserId));
  return selected ? selected.name : '';
}

function populateUserFilter(users) {
  if (!els.userFilter) return;
  state.availableUsers = Array.isArray(users) ? users : [];
  const defaultLabel = appContext.previewMode ? 'Choose user' : 'All users combined';
  const options = [`<option value="">${defaultLabel}</option>`].concat(
    state.availableUsers.map((user) => `
      <option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} (${escapeHtml(user.email)})</option>
    `)
  );
  els.userFilter.innerHTML = options.join('');

  const selectedExists = state.availableUsers.some((user) => String(user.id) === String(state.selectedUserId));
  if (state.selectedUserId && !selectedExists) state.selectedUserId = '';

  if (appContext.previewMode && !state.selectedUserId && state.availableUsers.length) {
    state.selectedUserId = String(state.availableUsers[0].id);
  }

  els.userFilter.value = state.selectedUserId || '';
}

function updateSummary() {
  const mapped = state.filtered.filter((r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude))).length;
  if (els.totalRows) els.totalRows.textContent = state.filtered.length;
  if (els.mappedRows) els.mappedRows.textContent = mapped;
  if (els.unmappedRows) els.unmappedRows.textContent = state.filtered.length - mapped;

  if (els.scopeValue) {
    if (appContext.previewMode) {
      els.scopeValue.textContent = getSelectedUserName() || 'Choose user';
    } else if (appContext.isAdmin) {
      els.scopeValue.textContent = getSelectedUserName() || 'All users combined';
    } else {
      els.scopeValue.textContent = 'My data only';
    }
  }
}

function renderTable() {
  if (!els.recordsTable) return;
  const columnCount = (appContext.showOwnerColumn ? 1 : 0) + (appContext.readOnly ? 6 : 7);
  if (!state.filtered.length) {
    els.recordsTable.innerHTML = `<tr><td colspan="${columnCount}">No records found.</td></tr>`;
    return;
  }

  els.recordsTable.innerHTML = state.filtered.map((record) => `
    <tr class="${(!record.latitude || !record.longitude) ? 'warning-row' : ''}">
      <td>${escapeHtml(record.mfFile || '')}</td>
      <td>${escapeHtml(record.deceasedName || '')} ${escapeHtml(record.deceasedSurname || '')}</td>
      ${appContext.showOwnerColumn ? `<td>${escapeHtml(record.owner || '')}</td>` : ''}
      <td>${escapeHtml(record.city || '')}</td>
      <td>${escapeHtml(record.province || '')}</td>
      <td>${escapeHtml(record.fullAddress || record.address || '')}</td>
      <td>${escapeHtml(record.contactNumber || '')}</td>
      ${appContext.readOnly ? '' : `
      <td class="action-cell">
        <button class="small-btn" data-action="edit" data-id="${record.id}">Edit</button>
        <button class="small-btn danger-btn" data-action="delete" data-id="${record.id}">Delete</button>
      </td>`}
    </tr>
  `).join('');
}

function applyFilters() {
  const q = (els.townFilter?.value || '').trim().toLowerCase();
  const province = els.provinceFilter?.value || '';
  state.filtered = state.records.filter((record) => {
    const townMatch = !q || (record.city || '').toLowerCase().includes(q);
    const provinceMatch = !province || record.province === province;
    return townMatch && provinceMatch;
  });
  updateSummary();
  renderTable();
  renderMap();
  renderAnalytics();
}

function fillForm(record) {
  if (els.recordId) els.recordId.value = record.id || '';
  if (els.mfFile) els.mfFile.value = record.mfFile || '';
  if (els.dod) els.dod.value = record.dod || '';
  if (els.deceasedName) els.deceasedName.value = record.deceasedName || '';
  if (els.deceasedSurname) els.deceasedSurname.value = record.deceasedSurname || '';
  if (els.deceasedAddress) els.deceasedAddress.value = record.deceasedAddress || record.address || '';
  if (els.churchName) els.churchName.value = record.churchName || '';
  if (els.churchAddress) els.churchAddress.value = record.churchAddress || '';
  if (els.pastorName) els.pastorName.value = record.pastorName || '';
  if (els.address) els.address.value = record.address || '';
  if (els.city) els.city.value = record.city || '';
  if (els.province) els.province.value = record.province || '';
  if (els.postalCode) els.postalCode.value = record.postalCode || '';
  if (els.country) els.country.value = record.country || 'South Africa';
  if (els.fullAddress) els.fullAddress.value = record.fullAddress || '';
  if (els.latitude) els.latitude.value = record.latitude ?? '';
  if (els.longitude) els.longitude.value = record.longitude ?? '';
  if (els.weight) els.weight.value = record.weight ?? 1;
  if (els.nextOfKinName) els.nextOfKinName.value = record.nextOfKinName || '';
  if (els.nextOfKinSurname) els.nextOfKinSurname.value = record.nextOfKinSurname || '';
  if (els.relationship) els.relationship.value = record.relationship || '';
  if (els.contactNumber) els.contactNumber.value = record.contactNumber || '';
}

function clearFormValidation() {
  if (!els.recordForm) return;
  els.recordForm.querySelectorAll('label').forEach((label) => {
    label.classList.remove('field-error', 'field-valid', 'field-required');
  });
}

function clearForm() {
  els.recordForm?.reset();
  if (els.country) els.country.value = 'South Africa';
  if (els.weight) els.weight.value = 1;
  if (els.recordId) els.recordId.value = '';
  if (els.latitude) els.latitude.value = '';
  if (els.longitude) els.longitude.value = '';
  if (els.fullAddress) els.fullAddress.value = '';
  if (els.contactNumber) els.contactNumber.setCustomValidity('');
  clearFormValidation();
  clearBox(els.formStatus);
  clearBox(els.addressHelp);
}

function setFieldState(field, triedSubmit) {
  const label = field.closest('label');
  if (!label) return;
  const isRequired = field.hasAttribute('required');
  const value = (field.value || '').trim();
  const hasError = (isRequired && !value) || (value !== '' && !field.checkValidity());
  label.classList.toggle('field-required', isRequired);
  label.classList.toggle('field-error', triedSubmit && hasError);
  label.classList.toggle('field-valid', triedSubmit && !hasError && value !== '');
}

async function loadData() {
  const url = state.selectedUserId
    ? `/api/records?user_id=${encodeURIComponent(state.selectedUserId)}`
    : '/api/records';
  const res = await fetch(url);
  const data = await res.json();
  state.records = data.records || [];
  populateUserFilter(data.summary?.availableUsers || []);
  autoMapMode();
  applyFilters();
  if (!appContext.readOnly) queueMissingGeocodes();
}

async function geocodePayloadIfNeeded(payload) {
  if (payload.latitude && payload.longitude) return payload;
  const fullAddress = String(payload.fullAddress || getFullAddressFromForm()).trim();
  if (!fullAddress) return payload;

  const point = await geocodeAddress(fullAddress);
  if (!point) {
    setBox(els.addressHelp, 'Could not geocode this address. Check the street, town, and province.', true);
    return payload;
  }

  payload.fullAddress = fullAddress;
  payload.latitude = point.lat;
  payload.longitude = point.lng;
  clearBox(els.addressHelp);
  return payload;
}

async function saveRecord(event) {
  event.preventDefault();
  clearBox(els.formStatus);
  clearBox(els.addressHelp);

  const payload = {
    id: els.recordId?.value,
    mfFile: els.mfFile?.value?.trim(),
    dod: els.dod?.value,
    deceasedName: els.deceasedName?.value?.trim(),
    deceasedSurname: els.deceasedSurname?.value?.trim(),
    deceasedAddress: els.deceasedAddress?.value?.trim(),
    churchName: els.churchName?.value?.trim(),
    churchAddress: els.churchAddress?.value?.trim(),
    pastorName: els.pastorName?.value?.trim(),
    address: els.address?.value?.trim(),
    city: els.city?.value?.trim(),
    province: els.province?.value,
    postalCode: els.postalCode?.value?.trim(),
    country: els.country?.value?.trim() || 'South Africa',
    fullAddress: (els.fullAddress?.value || getFullAddressFromForm()).trim(),
    latitude: els.latitude?.value,
    longitude: els.longitude?.value,
    weight: els.weight?.value || 1,
    nextOfKinName: els.nextOfKinName?.value?.trim(),
    nextOfKinSurname: els.nextOfKinSurname?.value?.trim(),
    relationship: els.relationship?.value?.trim(),
    contactNumber: els.contactNumber?.value?.trim(),
  };

  payload.province = normalizeProvinceName(payload.province);
  if (!payload.fullAddress) payload.fullAddress = getFullAddressFromForm();
  await geocodePayloadIfNeeded(payload);

  const res = await fetch('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    setBox(els.formStatus, data.error || 'Could not save record.', true);
    return;
  }

  setBox(els.formStatus, data.message || 'Record saved.');
  await loadData();
  if (data.record) {
    fillForm(data.record);
    focusSavedRecordOnMap(data.record);
  } else {
    clearForm();
  }
}

async function deleteRecord(id) {
  const res = await fetch(`/api/records/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Could not delete record.');
    return;
  }
  await loadData();
}

function showMarkers() {
  state.currentMapView = 'markers';
  if (els.mapMode) els.mapMode.value = 'pins';
  renderMap();
}

function showClusters() {
  state.currentMapView = 'clusters';
  if (els.mapMode) els.mapMode.value = 'clusters';
  renderMap();
}

function showHeat() {
  state.currentMapView = 'heat';
  if (els.mapMode) els.mapMode.value = 'heatmap';
  renderMap();
}

function showChurchCoverage() {
  state.currentMapView = 'churches';
  if (els.mapMode) els.mapMode.value = 'churches';
  renderMap();
}

function destroyChart(instance) {
  if (instance && typeof instance.destroy === 'function') instance.destroy();
}

function parseRecordDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  return null;
}

function getChartScopedRecords() {
  const fromValue = els.chartFromDate?.value || '';
  const toValue = els.chartToDate?.value || '';
  const fromDate = fromValue ? new Date(`${fromValue}T00:00:00`) : null;
  const toDate = toValue ? new Date(`${toValue}T23:59:59`) : null;
  return state.filtered.filter((record) => {
    const parsed = parseRecordDate(record.dod);
    if (fromDate && (!parsed || parsed < fromDate)) return false;
    if (toDate && (!parsed || parsed > toDate)) return false;
    return true;
  });
}

function limitEntries(entries) {
  const limitValue = els.chartLimitFilter?.value || 'all';
  if (limitValue === 'all') return entries;
  const limit = parseInt(limitValue, 10);
  if (!Number.isFinite(limit) || limit <= 0) return entries;
  return entries.slice(0, limit);
}

function buildComparisonData(records) {
  const fromValue = els.chartFromDate?.value || '';
  const toValue = els.chartToDate?.value || '';
  if (!fromValue || !toValue) {
    return {
      labels: [],
      datasets: [],
      type: 'line',
      summary: 'Choose From date and To date to compare one period with the previous period.',
    };
  }

  const currentCounts = new Map();
  const previousCounts = new Map();
  const from = new Date(`${fromValue}T00:00:00`);
  const to = new Date(`${toValue}T23:59:59`);
  const spanDays = Math.max(1, Math.round((to - from) / 86400000) + 1);
  const prevTo = new Date(from.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - ((spanDays - 1) * 86400000));

  records.forEach((record) => {
    const date = parseRecordDate(record.dod);
    if (!date) return;
    const iso = date.toISOString().slice(0, 10);
    if (date >= from && date <= to) currentCounts.set(iso, (currentCounts.get(iso) || 0) + 1);
    if (date >= prevFrom && date <= prevTo) previousCounts.set(iso, (previousCounts.get(iso) || 0) + 1);
  });

  const labels = [];
  const currentData = [];
  const previousData = [];
  for (let i = 0; i < spanDays; i += 1) {
    const currentDate = new Date(from.getTime() + (i * 86400000));
    const previousDate = new Date(prevFrom.getTime() + (i * 86400000));
    labels.push(currentDate.toISOString().slice(5, 10));
    currentData.push(currentCounts.get(currentDate.toISOString().slice(0, 10)) || 0);
    previousData.push(previousCounts.get(previousDate.toISOString().slice(0, 10)) || 0);
  }

  return {
    labels,
    datasets: [
      {
        label: `${fromValue} to ${toValue}`,
        data: currentData,
        borderColor: '#8d6fd1',
        backgroundColor: 'rgba(141, 111, 209, 0.18)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
      },
      {
        label: `${prevFrom.toISOString().slice(0, 10)} to ${prevTo.toISOString().slice(0, 10)}`,
        data: previousData,
        borderColor: '#c8a2c8',
        backgroundColor: 'rgba(200, 162, 200, 0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
      }
    ],
    type: 'line',
    summary: `Comparing ${spanDays} day${spanDays === 1 ? '' : 's'} against the previous ${spanDays} day${spanDays === 1 ? '' : 's'}.`,
  };
}

function buildCountData(records, field, labelText) {
  const counts = new Map();
  records.forEach((record) => {
    const key = String(record[field] || '').trim();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const entries = limitEntries(Array.from(counts.entries()).sort((a, b) => b[1] - a[1]));
  return {
    labels: entries.map(([key]) => key),
    datasets: [{
      label: labelText,
      data: entries.map(([, value]) => value),
      backgroundColor: '#c8a2c8',
      borderColor: '#c8a2c8',
      borderWidth: 1,
      borderRadius: 10,
      maxBarThickness: 42,
    }],
    type: 'bar',
    summary: `Showing ${entries.length || 0} result${entries.length === 1 ? '' : 's'} from ${records.length} filtered record${records.length === 1 ? '' : 's'}.`,
  };
}

function renderAnalytics() {
  const canvas = document.getElementById('mainChart');
  if (!canvas || typeof Chart === 'undefined') return;
  const records = getChartScopedRecords();
  const view = els.chartViewFilter?.value || 'comparison';
  let config;

  if (view === 'province') config = buildCountData(records, 'province', 'Deaths per Province');
  else if (view === 'city') config = buildCountData(records, 'city', 'Deaths per City');
  else if (view === 'church') config = buildCountData(records, 'churchName', 'Deaths per Church');
  else config = buildComparisonData(state.filtered);

  destroyChart(mainChartInstance);

  const sharedChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 700, easing: 'easeOutQuart' },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: '#5b4a7d',
          usePointStyle: true,
          boxWidth: 10,
          padding: 16,
        },
      },
      tooltip: {
        backgroundColor: '#ffffff',
        titleColor: '#5b4a7d',
        bodyColor: '#6f6288',
        borderColor: '#eadff3',
        borderWidth: 1,
        cornerRadius: 12,
      },
    },
    scales: {
      x: {
        ticks: { color: '#7a6b95', maxRotation: 0, autoSkip: true },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#7a6b95', precision: 0 },
        grid: { color: 'rgba(91, 74, 125, 0.08)' },
      },
    },
  };

  mainChartInstance = new Chart(canvas, {
    type: config.type || 'bar',
    data: { labels: config.labels || [], datasets: config.datasets || [] },
    options: sharedChartOptions,
  });

  if (els.chartSummary) els.chartSummary.textContent = config.summary || 'Showing current records.';
}

async function updateRecordGeocode(record, point) {
  const payload = {
    ...record,
    latitude: point.lat,
    longitude: point.lng,
    fullAddress: record.fullAddress || [record.address, record.city, record.province, record.country || 'South Africa'].filter(Boolean).join(', '),
  };

  try {
    await fetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('Could not persist geocode update', error);
  }
}

async function queueMissingGeocodes() {
  if (geocodeQueueActive) return;
  const missing = state.records.filter((record) => {
    const hasLat = Number.isFinite(Number(record.latitude));
    const hasLng = Number.isFinite(Number(record.longitude));
    const fullAddress = String(record.fullAddress || record.address || '').trim();
    return !hasLat && !hasLng && fullAddress;
  }).slice(0, 10);

  if (!missing.length) return;
  geocodeQueueActive = true;
  for (const record of missing) {
    const fullAddress = String(record.fullAddress || [record.address, record.city, record.province, record.country || 'South Africa'].filter(Boolean).join(', ')).trim();
    try {
      const point = await geocodeAddress(fullAddress);
      if (point) {
        record.latitude = point.lat;
        record.longitude = point.lng;
        await updateRecordGeocode(record, point);
      }
    } catch (error) {
      console.warn('Background geocode failed', error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  geocodeQueueActive = false;
  applyFilters();
}

window.showMarkers = showMarkers;
window.showClusters = showClusters;
window.showHeat = showHeat;
window.showChurchCoverage = showChurchCoverage;

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  if (window.google && google.maps && google.maps.places) initAddressAutocomplete();
  clearForm();
  loadData();
  renderAnalytics();

  let triedSubmit = false;
  const fields = Array.from(document.querySelectorAll('#recordForm input, #recordForm select, #recordForm textarea')).filter((field) => field.type !== 'hidden');
  fields.forEach((field) => {
    ['input', 'change', 'blur'].forEach((eventName) => {
      field.addEventListener(eventName, () => setFieldState(field, triedSubmit));
    });
  });

  if (els.contactNumber) {
    els.contactNumber.addEventListener('input', function onInput() {
      const digits = this.value.replace(/\D/g, '').slice(0, 10);
      if (digits.length <= 3) this.value = digits;
      else if (digits.length <= 6) this.value = `${digits.slice(0, 3)} ${digits.slice(3)}`;
      else this.value = `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
      this.setCustomValidity('');
    });

    els.contactNumber.addEventListener('blur', function onBlur() {
      const digits = this.value.replace(/\D/g, '');
      if (digits && digits.length !== 10) {
        this.setCustomValidity('Enter a valid South African phone number with 10 digits.');
      } else {
        this.setCustomValidity('');
      }
      setFieldState(this, triedSubmit);
    });
  }

  els.recordForm?.addEventListener('submit', async (event) => {
    if (appContext.readOnly) {
      event.preventDefault();
      return;
    }
    triedSubmit = true;
    let firstInvalid = null;
    fields.forEach((field) => {
      setFieldState(field, triedSubmit);
      const value = (field.value || '').trim();
      const hasError = (field.hasAttribute('required') && !value) || (value !== '' && !field.checkValidity());
      if (hasError && !firstInvalid) firstInvalid = field;
    });
    if (firstInvalid) {
      event.preventDefault();
      firstInvalid.focus();
      return;
    }
    await saveRecord(event);
  });

  els.clearFormBtn?.addEventListener('click', clearForm);
  els.townFilter?.addEventListener('input', applyFilters);
  els.provinceFilter?.addEventListener('change', applyFilters);
  els.userFilter?.addEventListener('change', async () => {
    state.selectedUserId = els.userFilter.value || '';
    await loadData();
    renderAnalytics();
  });
  [els.chartViewFilter, els.chartFromDate, els.chartToDate, els.chartLimitFilter].forEach((field) => {
    field?.addEventListener('change', renderAnalytics);
    field?.addEventListener('input', renderAnalytics);
  });

  [els.address, els.city, els.province, els.postalCode, els.country].forEach((field) => {
    field?.addEventListener('input', () => {
      if (els.fullAddress) els.fullAddress.value = getFullAddressFromForm();
    });
    field?.addEventListener('change', () => {
      if (els.fullAddress) els.fullAddress.value = getFullAddressFromForm();
    });
  });

  els.recordsTable?.addEventListener('click', (event) => {
    if (appContext.readOnly) return;
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const record = state.records.find((item) => item.id === id);
    if (!record) return;

    if (btn.dataset.action === 'edit') {
      fillForm(record);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (btn.dataset.action === 'delete' && confirm(`Delete ${record.mfFile}?`)) {
      deleteRecord(id);
    }
  });
});
