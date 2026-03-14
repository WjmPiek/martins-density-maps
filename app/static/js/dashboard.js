const state = {
  records: [],
  filtered: [],
  currentMapView: 'markers',
};

const els = {
  totalRows: document.getElementById('totalRows'),
  mappedRows: document.getElementById('mappedRows'),
  unmappedRows: document.getElementById('unmappedRows'),
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
};

let map = null;
let infoWindow = null;
let heatmapLayer = null;
let markerCluster = null;
let googleMarkers = [];
let provinceChartInstance = null;
let cityChartInstance = null;
let monthlyChartInstance = null;
let geocodeQueueActive = false;
let dashboardBooted = false;

const SOUTH_AFRICA_CENTER = { lat: -29.0, lng: 24.0 };
const SOUTH_AFRICA_BOUNDS = {
  north: -22.0,
  south: -35.5,
  west: 16.0,
  east: 33.5,
};

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
      if (map) {
        map.panTo({ lat, lng });
        map.setZoom(15);
      }
      clearBox(els.addressHelp);
    }
  });
}

function hasGoogleMaps() {
  return Boolean(window.google && google.maps);
}

function showMapUnavailableMessage(message) {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;
  mapEl.innerHTML = `<div style="padding:24px;text-align:center;color:#5b6475;">${escapeHtml(message)}</div>`;
}

function ensureInfoWindow() {
  if (!hasGoogleMaps()) return null;
  if (!infoWindow) {
    infoWindow = new google.maps.InfoWindow();
  }
  return infoWindow;
}

function buildMarkerIcon(pinRadius) {
  const scale = Math.max(5, Math.min(14, Number(pinRadius || 6)));
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: '#6b2fa3',
    fillOpacity: 0.9,
    strokeColor: '#ffffff',
    strokeWeight: 1.5,
  };
}

function clearMapLayers() {
  googleMarkers.forEach((marker) => marker.setMap(null));
  googleMarkers = [];

  if (markerCluster) {
    markerCluster.clearMarkers();
    markerCluster.setMap(null);
    markerCluster = null;
  }

  if (heatmapLayer) {
    heatmapLayer.setMap(null);
    heatmapLayer = null;
  }
}

function initMap() {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  if (!hasGoogleMaps()) {
    showMapUnavailableMessage('Google Maps could not load. Check GOOGLE_MAPS_API_KEY, billing, referrer restrictions, and enabled APIs.');
    return;
  }

  if (map) return;

  map = new google.maps.Map(mapEl, {
    center: SOUTH_AFRICA_CENTER,
    zoom: 5.5,
    mapTypeId: 'roadmap',
    streetViewControl: false,
    fullscreenControl: true,
    mapTypeControl: true,
    restriction: {
      latLngBounds: SOUTH_AFRICA_BOUNDS,
      strictBounds: false,
    },
  });

  ensureInfoWindow();

  if (els.mapMode) {
    els.mapMode.addEventListener('change', () => {
      const value = els.mapMode.value;
      if (value === 'heatmap') state.currentMapView = 'heat';
      else if (value === 'clusters') state.currentMapView = 'clusters';
      else state.currentMapView = 'markers';
      renderMap();
    });
  }

  els.heatRadius?.addEventListener('input', renderMap);
  els.pinRadius?.addEventListener('input', renderMap);
}

function renderMap() {
  if (!map || !hasGoogleMaps()) return;
  clearMapLayers();

  const mapped = state.filtered.filter((r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)));
  if (!mapped.length) {
    map.setCenter(SOUTH_AFRICA_CENTER);
    map.setZoom(5.5);
    return;
  }

  const heatRadius = parseInt(els.heatRadius?.value || '25', 10);
  const pinRadius = parseInt(els.pinRadius?.value || '6', 10);
  const bounds = new google.maps.LatLngBounds();
  const popup = ensureInfoWindow();

  googleMarkers = mapped.map((record) => {
    const position = { lat: Number(record.latitude), lng: Number(record.longitude) };
    bounds.extend(position);
    const marker = new google.maps.Marker({
      position,
      title: `${record.deceasedName || ''} ${record.deceasedSurname || ''}`.trim() || (record.mfFile || 'Record'),
      icon: buildMarkerIcon(pinRadius),
    });
    
    marker.addListener('click', () => {
      popup.setContent(popupHtml(record));
      popup.open({ map, anchor: marker });
    });
    return marker;
  });

  if (state.currentMapView === 'heat' && mapped.length > 1 && google.maps.visualization) {
    heatmapLayer = new google.maps.visualization.HeatmapLayer({
      data: mapped.map((record) => ({
        location: new google.maps.LatLng(Number(record.latitude), Number(record.longitude)),
        weight: Number(record.weight || 1),
      })),
      radius: heatRadius,
      opacity: 0.75,
    });
    heatmapLayer.setMap(map);
  } else if (state.currentMapView === 'clusters' && googleMarkers.length > 1 && window.markerClusterer?.MarkerClusterer) {
    markerCluster = new markerClusterer.MarkerClusterer({
      map,
      markers: googleMarkers,
    });
  } else {
    googleMarkers.forEach((marker) => marker.setMap(map));
  }

  if (mapped.length === 1) {
    map.setCenter(bounds.getCenter());
    map.setZoom(11);
  } else {
    map.fitBounds(bounds, 48);
  }
}

function focusSavedRecordOnMap(record) {
  if (!map || !record) return;
  const lat = Number(record.latitude);
  const lng = Number(record.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  state.currentMapView = 'markers';
  if (els.mapMode) els.mapMode.value = 'pins';
  renderMap();

  const targetMarker = googleMarkers.find((marker) => {
    const pos = marker.getPosition();
    return pos && Math.abs(pos.lat() - lat) < 0.000001 && Math.abs(pos.lng() - lng) < 0.000001;
  });

  map.panTo({ lat, lng });
  map.setZoom(16);

  if (targetMarker) {
    const popup = ensureInfoWindow();
    popup.setContent(popupHtml(record));
    popup.open({ map, anchor: targetMarker });
  }
}

function updateSummary() {
  const mapped = state.filtered.filter((r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude))).length;
  if (els.totalRows) els.totalRows.textContent = state.filtered.length;
  if (els.mappedRows) els.mappedRows.textContent = mapped;
  if (els.unmappedRows) els.unmappedRows.textContent = state.filtered.length - mapped;
}

function renderTable() {
  if (!els.recordsTable) return;
  if (!state.filtered.length) {
    els.recordsTable.innerHTML = '<tr><td colspan="7">No records found.</td></tr>';
    return;
  }

  els.recordsTable.innerHTML = state.filtered.map((record) => `
    <tr class="${(!record.latitude || !record.longitude) ? 'warning-row' : ''}">
      <td>${escapeHtml(record.mfFile || '')}</td>
      <td>${escapeHtml(record.deceasedName || '')} ${escapeHtml(record.deceasedSurname || '')}</td>
      <td>${escapeHtml(record.city || '')}</td>
      <td>${escapeHtml(record.province || '')}</td>
      <td>${escapeHtml(record.fullAddress || record.address || '')}</td>
      <td>${escapeHtml(record.contactNumber || '')}</td>
      <td class="action-cell">
        <button class="small-btn" data-action="edit" data-id="${record.id}">Edit</button>
        <button class="small-btn danger-btn" data-action="delete" data-id="${record.id}">Delete</button>
      </td>
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
}

function fillForm(record) {
  if (els.recordId) els.recordId.value = record.id || '';
  if (els.mfFile) els.mfFile.value = record.mfFile || '';
  if (els.dod) els.dod.value = record.dod || '';
  if (els.deceasedName) els.deceasedName.value = record.deceasedName || '';
  if (els.deceasedSurname) els.deceasedSurname.value = record.deceasedSurname || '';
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
  const res = await fetch('/api/records');
  const data = await res.json();
  state.records = data.records || [];
  autoMapMode();
  applyFilters();
  queueMissingGeocodes();
}

async function geocodeAddress(fullAddress) {
  const address = String(fullAddress || '').trim();
  if (!address) return null;

  if (hasGoogleMaps() && google.maps.Geocoder) {
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
  const response = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
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

function destroyChart(instance) {
  if (instance && typeof instance.destroy === 'function') instance.destroy();
}

async function loadAnalytics() {
  const provinceCanvas = document.getElementById('provinceChart');
  const cityCanvas = document.getElementById('cityChart');
  const monthlyCanvas = document.getElementById('monthlyChart');
  if (!provinceCanvas || !cityCanvas || !monthlyCanvas || typeof Chart === 'undefined') return;

  const res = await fetch('/api/analytics');
  if (!res.ok) return;
  const data = await res.json();

  destroyChart(provinceChartInstance);
  destroyChart(cityChartInstance);
  destroyChart(monthlyChartInstance);

  provinceChartInstance = new Chart(provinceCanvas, {
    type: 'bar',
    data: {
      labels: Object.keys(data.province || {}),
      datasets: [{ label: 'Deaths per Province', data: Object.values(data.province || {}) }],
    },
  });
  cityChartInstance = new Chart(cityCanvas, {
    type: 'bar',
    data: {
      labels: Object.keys(data.cities || {}),
      datasets: [{ label: 'Top Cities', data: Object.values(data.cities || {}) }],
    },
  });
  monthlyChartInstance = new Chart(monthlyCanvas, {
    type: 'line',
    data: {
      labels: Object.keys(data.months || {}),
      datasets: [{ label: 'Monthly Trend', data: Object.values(data.months || {}) }],
    },
  });
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

function bootstrapDashboard() {
  if (dashboardBooted) return;
  dashboardBooted = true;

  initMap();
  if (hasGoogleMaps() && google.maps.places) initAddressAutocomplete();
  clearForm();
  loadData();
  loadAnalytics();

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
  [els.address, els.city, els.province, els.postalCode, els.country].forEach((field) => {
    field?.addEventListener('input', () => {
      if (els.fullAddress) els.fullAddress.value = getFullAddressFromForm();
    });
    field?.addEventListener('change', () => {
      if (els.fullAddress) els.fullAddress.value = getFullAddressFromForm();
    });
  });

  els.recordsTable?.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const record = state.records.find((item) => item.id === id);
    if (!record) return;

    if (btn.dataset.action === 'edit') {
      fillForm(record);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      focusSavedRecordOnMap(record);
    }

    if (btn.dataset.action === 'delete' && confirm(`Delete ${record.mfFile}?`)) {
      deleteRecord(id);
    }
  });
}

window.showMarkers = showMarkers;
window.showClusters = showClusters;
window.showHeat = showHeat;
window.initGoogleAddress = function initGoogleAddress() {
  initMap();
  initAddressAutocomplete();
  renderMap();
};

document.addEventListener('DOMContentLoaded', bootstrapDashboard);
