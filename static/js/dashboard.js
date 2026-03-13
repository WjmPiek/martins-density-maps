const state = {
  records: [],
  filtered: [],
  currentMapView: 'clusters',
};

const els = {
  totalRows: document.getElementById('totalRows'),
  mappedRows: document.getElementById('mappedRows'),
  unmappedRows: document.getElementById('unmappedRows'),
  townFilter: document.getElementById('townFilter'),
  provinceFilter: document.getElementById('provinceFilter'),
  formStatus: document.getElementById('formStatus'),
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

let map;
let heatLayer = null;
let markerLayer = null;
let clusterLayer = null;

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

function focusSavedRecordOnMap(record) {
  if (!map || !record) return;

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

  const clusterMarker = L.marker([lat, lng]).bindPopup(popup);

  markerLayer.addLayer(circle);
  clusterLayer.addLayer(clusterMarker);

  if (state.currentMapView === 'heat') {
    heatLayer = L.heatLayer([[lat, lng, Number(record.weight || 1)]], {
      radius: parseInt(els.heatRadius?.value || '25', 10),
      blur: 20,
      maxZoom: 10,
    }).addTo(map);
  } else if (state.currentMapView === 'markers') {
    markerLayer.addTo(map);
    circle.openPopup();
  } else {
    clusterLayer.addTo(map);
    clusterMarker.openPopup();
  }

  map.setView([lat, lng], 16, { animate: true });
}

function initAddressAutocomplete() {
  const streetInput = document.getElementById('address');
  const help = document.getElementById('addressHelp');

  if (!streetInput) return;

  if (!window.google || !google.maps || !google.maps.places) {
    if (help && window.APP_CONTEXT && !window.APP_CONTEXT.googleMapsApiKey) {
      help.textContent = 'Google Places API key is missing, so address autocomplete is disabled.';
      help.classList.remove('hidden');
      help.classList.add('error-text');
    }
    return;
  }

  const provinceMap = {
    'eastern cape': 'Eastern Cape',
    'free state': 'Free State',
    'gauteng': 'Gauteng',
    'kwazulu-natal': 'KwaZulu-Natal',
    'kwa-zulu natal': 'KwaZulu-Natal',
    'limpopo': 'Limpopo',
    'mpumalanga': 'Mpumalanga',
    'north west': 'North West',
    'northern cape': 'Northern Cape',
    'western cape': 'Western Cape',
  };

  const normalizeProvince = (value) => {
    const key = String(value || '').trim().toLowerCase();
    return provinceMap[key] || value || '';
  };

  const getComponent = (place, type) => (place.address_components || []).find((component) =>
    component.types && component.types.includes(type)
  );

  const setHelp = (message, isError = false) => {
    if (!help) return;
    help.textContent = message || '';
    help.classList.toggle('hidden', !message);
    help.classList.toggle('error-text', !!isError);
  };

  const autocomplete = new google.maps.places.Autocomplete(streetInput, {
    fields: ['address_components', 'formatted_address', 'geometry', 'name'],
    types: ['address'],
    componentRestrictions: { country: 'za' },
  });

  streetInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.preventDefault();
  });

  streetInput.addEventListener('input', () => {
    if (els.latitude) els.latitude.value = '';
    if (els.longitude) els.longitude.value = '';
    if (els.fullAddress) els.fullAddress.value = '';
    if (els.city) els.city.value = '';
    if (els.province) els.province.value = '';
    const postal = document.getElementById('postalCode');
    if (postal) postal.value = '';
    if (els.country) els.country.value = 'South Africa';
    setHelp('Choose an address from the South Africa suggestions list.');
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place || !place.address_components) {
      setHelp('Select a valid address from the suggestions list.', true);
      return;
    }

    const country = getComponent(place, 'country');
    const countryCode = country && country.short_name ? country.short_name.toUpperCase() : '';
    if (countryCode && countryCode !== 'ZA') {
      if (els.country) els.country.value = 'South Africa';
      setHelp('Please choose an address in South Africa.', true);
      return;
    }

    const streetNumber = getComponent(place, 'street_number');
    const route = getComponent(place, 'route');
    const suburb = getComponent(place, 'sublocality_level_1') || getComponent(place, 'sublocality');
    const locality = getComponent(place, 'locality') || getComponent(place, 'postal_town') || getComponent(place, 'administrative_area_level_2');
    const province = getComponent(place, 'administrative_area_level_1');
    const postalCode = getComponent(place, 'postal_code');

    const streetAddress = [streetNumber && streetNumber.long_name, route && route.long_name].filter(Boolean).join(' ').trim() || (place.name || streetInput.value || '');

    if (els.address) els.address.value = streetAddress;
    if (els.fullAddress) els.fullAddress.value = place.formatted_address || '';
    if (els.city) els.city.value = locality && locality.long_name ? locality.long_name : '';
    if (els.province) els.province.value = normalizeProvince(province && province.long_name ? province.long_name : '');
    if (els.country) els.country.value = 'South Africa';
    const postal = document.getElementById('postalCode');
    if (postal) postal.value = postalCode && postalCode.long_name ? postalCode.long_name : '';

    if (place.geometry && place.geometry.location) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      if (els.latitude) els.latitude.value = String(lat);
      if (els.longitude) els.longitude.value = String(lng);
      if (map) map.setView([lat, lng], 15, { animate: true });
    }

    setHelp(suburb && suburb.long_name ? `Suburb: ${suburb.long_name}` : 'South Africa address selected.');
  });
}

window.initAddressAutocomplete = initAddressAutocomplete;

function initMap() {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  map = L.map('map', { preferCanvas: true }).setView([-28.5, 24.5], 5);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
  }).addTo(map);

  markerLayer = L.layerGroup();
  clusterLayer = L.markerClusterGroup();

  els.mapMode?.addEventListener('change', () => {
    const value = els.mapMode.value;
    if (value === 'pins') state.currentMapView = 'markers';
    else if (value === 'heatmap') state.currentMapView = 'heat';
    else state.currentMapView = 'clusters';
    renderMap();
  });

  els.heatRadius?.addEventListener('input', renderMap);
  els.pinRadius?.addEventListener('input', renderMap);
}

function popupHtml(record) {
  return `
    <div class="popup-grid">
      <strong>${record.deceasedName || ''} ${record.deceasedSurname || ''}</strong>
      <div><b>MF File:</b> ${record.mfFile || '-'}</div>
      <div><b>DOD:</b> ${record.dod || '-'}</div>
      <div><b>Address:</b> ${record.fullAddress || record.address || '-'}</div>
      <div><b>City:</b> ${record.city || '-'}</div>
      <div><b>Province:</b> ${record.province || '-'}</div>
      <div><b>Contact:</b> ${record.contactNumber || '-'}</div>
      <div><a href="https://www.google.com/maps?q=${record.latitude},${record.longitude}" target="_blank">Open in Google Maps</a></div>
    </div>
  `;
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

function renderMap() {
  if (!map || !markerLayer || !clusterLayer) return;

  clearMapLayers();

  const mapped = state.filtered.filter(
    (r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude))
  );

  if (!mapped.length) return;

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

    const circle = L.circleMarker([lat, lng], {
      radius: pinRadius,
      weight: 1,
      opacity: 0.95,
      fillOpacity: 0.85,
    }).bindPopup(popup);

    const clusterMarker = L.marker([lat, lng]).bindPopup(popup);

    markerLayer.addLayer(circle);
    clusterLayer.addLayer(clusterMarker);
  });

  if (state.currentMapView === 'heat') {
    heatLayer = L.heatLayer(heatData, {
      radius: heatRadius,
      blur: 20,
      maxZoom: 10,
    }).addTo(map);
  } else if (state.currentMapView === 'markers') {
    markerLayer.addTo(map);
  } else {
    clusterLayer.addTo(map);
  }

  map.fitBounds(bounds, { padding: [24, 24] });
}

function updateSummary() {
  const mapped = state.filtered.filter(
    (r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude))
  ).length;

  els.totalRows.textContent = state.filtered.length;
  els.mappedRows.textContent = mapped;
  els.unmappedRows.textContent = state.filtered.length - mapped;
}

function renderTable() {
  if (!state.filtered.length) {
    els.recordsTable.innerHTML = '<tr><td colspan="7">No records found.</td></tr>';
    return;
  }

  els.recordsTable.innerHTML = state.filtered.map((record) => `
    <tr>
      <td>${record.mfFile || ''}</td>
      <td>${record.deceasedName || ''} ${record.deceasedSurname || ''}</td>
      <td>${record.city || ''}</td>
      <td>${record.province || ''}</td>
      <td>${record.fullAddress || record.address || ''}</td>
      <td>${record.contactNumber || ''}</td>
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

  state.filtered = state.records.filter((r) => {
    const townMatch = !q || (r.city || '').toLowerCase().includes(q);
    const provinceMatch = !province || r.province === province;
    return townMatch && provinceMatch;
  });

  updateSummary();
  renderTable();
  renderMap();
}

function fillForm(record) {
  els.recordId.value = record.id || '';
  els.mfFile.value = record.mfFile || '';
  els.dod.value = record.dod || '';
  els.deceasedName.value = record.deceasedName || '';
  els.deceasedSurname.value = record.deceasedSurname || '';
  els.address.value = record.address || '';
  els.city.value = record.city || '';
  els.province.value = record.province || '';
  els.country.value = record.country || '';
  els.fullAddress.value = record.fullAddress || '';
  els.latitude.value = record.latitude ?? '';
  els.longitude.value = record.longitude ?? '';
  els.weight.value = record.weight ?? 1;
  els.nextOfKinName.value = record.nextOfKinName || '';
  els.nextOfKinSurname.value = record.nextOfKinSurname || '';
  els.relationship.value = record.relationship || '';
  els.contactNumber.value = record.contactNumber || '';
}

function clearForm() {
  els.recordForm?.reset();
  if (els.country) els.country.value = 'South Africa';
  if (els.weight) els.weight.value = 1;
  if (els.recordId) els.recordId.value = '';
  if (els.latitude) els.latitude.value = '';
  if (els.longitude) els.longitude.value = '';
  if (els.fullAddress) els.fullAddress.value = '';
  clearBox(els.formStatus);
}

async function loadData() {
  const res = await fetch('/api/records');
  const data = await res.json();
  state.records = data.records || [];
  applyFilters();
}

async function saveRecord(event) {
  event.preventDefault();
  clearBox(els.formStatus);

  const payload = {
    id: els.recordId.value,
    mfFile: els.mfFile.value,
    dod: els.dod.value,
    deceasedName: els.deceasedName.value,
    deceasedSurname: els.deceasedSurname.value,
    address: els.address.value,
    city: els.city.value,
    province: els.province.value,
    country: els.country.value,
    fullAddress: els.fullAddress.value,
    latitude: els.latitude.value,
    longitude: els.longitude.value,
    weight: els.weight.value,
    nextOfKinName: els.nextOfKinName.value,
    nextOfKinSurname: els.nextOfKinSurname.value,
    relationship: els.relationship.value,
    contactNumber: els.contactNumber.value,
  };

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
  renderMap();
}

function showClusters() {
  state.currentMapView = 'clusters';
  renderMap();
}

function showHeat() {
  state.currentMapView = 'heat';
  renderMap();
}

window.showMarkers = showMarkers;
window.showClusters = showClusters;
window.showHeat = showHeat;

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  clearForm();
  loadData();

  els.recordForm?.addEventListener('submit', saveRecord);
  els.clearFormBtn?.addEventListener('click', clearForm);
  els.townFilter?.addEventListener('input', applyFilters);
  els.provinceFilter?.addEventListener('change', applyFilters);

  els.recordsTable?.addEventListener('click', (event) => {
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