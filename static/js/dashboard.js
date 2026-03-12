const state = { records: [], filtered: [], map: null, heatLayer: null, markerLayer: null };

const els = {
  totalRows: document.getElementById('totalRows'),
  mappedRows: document.getElementById('mappedRows'),
  unmappedRows: document.getElementById('unmappedRows'),
  townFilter: document.getElementById('townFilter'),
  provinceFilter: document.getElementById('provinceFilter'),
  fileInput: document.getElementById('fileInput'),
  uploadForm: document.getElementById('uploadForm'),
  uploadStatus: document.getElementById('uploadStatus'),
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
};

function setBox(el, message, isError = false) {
  el.textContent = message;
  el.classList.remove('hidden');
  el.classList.toggle('error', isError);
}

function clearBox(el) {
  el.textContent = '';
  el.classList.add('hidden');
  el.classList.remove('error');
}

function openGoogleMapsForRecord(record) {
  if (record.latitude && record.longitude) {
    window.open(`https://www.google.com/maps?q=${record.latitude},${record.longitude}`, '_blank');
  }
}

fetch('/api/records', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(res => res.json())
.then(record => {
  showStatus('formStatus', 'Record saved successfully.');
  loadMapData();
  openGoogleMapsForRecord(record);
});

function initAddressAutocomplete() {
  const input = document.getElementById('fullAddress');
  if (!input || !window.google || !google.maps || !google.maps.places) return;

  const autocomplete = new google.maps.places.Autocomplete(input, {
    fields: ['formatted_address', 'geometry', 'address_components', 'name']
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place) return;

    if (place.formatted_address) {
      input.value = place.formatted_address;
    }

    if (place.geometry && place.geometry.location) {
      document.getElementById('latitude').value = place.geometry.location.lat();
      document.getElementById('longitude').value = place.geometry.location.lng();
    }

    const components = place.address_components || [];

    let city = '';
    let province = '';
    let country = '';
    let streetNumber = '';
    let route = '';

    components.forEach(c => {
      if (c.types.includes('locality')) city = c.long_name;
      if (c.types.includes('administrative_area_level_1')) province = c.long_name;
      if (c.types.includes('country')) country = c.long_name;
      if (c.types.includes('street_number')) streetNumber = c.long_name;
      if (c.types.includes('route')) route = c.long_name;
    });

    const addressLine = [streetNumber, route].filter(Boolean).join(' ');

    document.getElementById('address').value = addressLine;
    document.getElementById('city').value = city;
    document.getElementById('province').value = province;
    document.getElementById('country').value = country;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initAddressAutocomplete();
});

let map;
let heatLayer;
let markerLayer;

function initMap() {
  map = L.map('map').setView([-28.5, 24.5], 5);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);

  loadMapData();

  document.getElementById('mapMode')?.addEventListener('change', loadMapData);
  document.getElementById('heatRadius')?.addEventListener('input', loadMapData);
  document.getElementById('pinRadius')?.addEventListener('input', loadMapData);
}

function loadMapData() {
  fetch('/api/locations')
    .then(res => res.json())
    .then(data => renderMapData(data));
}

function renderMapData(data) {
  const mode = document.getElementById('mapMode')?.value || 'heatmap';
  const heatRadius = parseInt(document.getElementById('heatRadius')?.value || '25', 10);
  const pinRadius = parseInt(document.getElementById('pinRadius')?.value || '6', 10);

  if (heatLayer) {
    map.removeLayer(heatLayer);
  }

  markerLayer.clearLayers();

  const heatPoints = data.map(point => [point.lat, point.lng, point.weight || 1]);

  if (mode === 'heatmap' || mode === 'both') {
    heatLayer = L.heatLayer(heatPoints, {
      radius: heatRadius,
      blur: 20,
      maxZoom: 10
    }).addTo(map);
  }

  if (mode === 'pins' || mode === 'both') {
    data.forEach(point => {
      const popupHtml = `
        <div class="popup-grid">
          <strong>${point.deceased_name} ${point.deceased_surname}</strong>
          <div><b>MF File:</b> ${point.mf_file}</div>
          <div><b>DOD:</b> ${point.dod}</div>
          <div><b>Address:</b> ${point.full_address || point.address}</div>
          <div><b>City:</b> ${point.city}</div>
          <div><b>Province:</b> ${point.province}</div>
          <div><b>Contact:</b> ${point.contact_number}</div>
          <div><a href="https://www.google.com/maps?q=${point.lat},${point.lng}" target="_blank">Open in Google Maps</a></div>
        </div>
      `;

      L.circleMarker([point.lat, point.lng], {
        radius: pinRadius,
        weight: 1,
        opacity: 0.95,
        fillOpacity: 0.85
      })
      .bindPopup(popupHtml)
      .addTo(markerLayer);
    });
  }
}

document.addEventListener('DOMContentLoaded', initMap);

function popupHtml(record) {
  return `
    <div class="popup-grid">
      <strong>${record.mfFile}</strong>
      <div>${record.deceasedName || ''} ${record.deceasedSurname || ''}</div>
      <div>${record.fullAddress || record.address || '-'}</div>
      <div>${record.contactNumber || '-'}</div>
      ${record.owner ? `<div class="muted">Owner: ${record.owner}</div>` : ''}
    </div>
  `;
}

function applyFilters() {
  const q = (els.townFilter.value || '').trim().toLowerCase();
  const province = els.provinceFilter.value;
  state.filtered = state.records.filter((r) => {
    const townMatch = !q || (r.city || '').toLowerCase().includes(q);
    const provinceMatch = !province || r.province === province;
    return townMatch && provinceMatch;
  });
  updateSummary();
  renderTable();
  renderMap();
}

function updateSummary() {
  const mapped = state.filtered.filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude)).length;
  els.totalRows.textContent = state.filtered.length;
  els.mappedRows.textContent = mapped;
  els.unmappedRows.textContent = state.filtered.length - mapped;
}

function renderMap() {
  if (state.heatLayer) {
    state.map.removeLayer(state.heatLayer);
    state.heatLayer = null;
  }
  state.markerLayer.clearLayers();
  if (state.map.hasLayer(state.markerLayer)) state.map.removeLayer(state.markerLayer);

  const mapped = state.filtered.filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
  if (!mapped.length) return;

  const heatData = [];
  const bounds = [];
  mapped.forEach((record) => {
    heatData.push([record.latitude, record.longitude, Number(record.weight || 1)]);
    bounds.push([record.latitude, record.longitude]);
    const marker = L.marker([record.latitude, record.longitude]);
    marker.bindPopup(popupHtml(record));
    state.markerLayer.addLayer(marker);
  });
  state.heatLayer = L.heatLayer(heatData, { radius: 24, blur: 18, maxZoom: 12 }).addTo(state.map);
  state.markerLayer.addTo(state.map);
  state.map.fitBounds(bounds, { padding: [24, 24] });
}

function renderTable() {
  if (!state.filtered.length) {
    els.recordsTable.innerHTML = '<tr><td colspan="7">No records found.</td></tr>';
    return;
  }
  els.recordsTable.innerHTML = state.filtered.map((record) => `
    <tr>
      <td>${record.mfFile}</td>
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
  els.recordForm.reset();
  els.country.value = 'South Africa';
  els.weight.value = 1;
  els.recordId.value = '';
  clearBox(els.formStatus);
}

async function loadData() {
  const res = await fetch('/api/records');
  const data = await res.json();
  state.records = data.records || [];
  applyFilters();
}

async function uploadWorkbook(event) {
  event.preventDefault();
  clearBox(els.uploadStatus);
  const formData = new FormData();
  if (!els.fileInput.files[0]) {
    setBox(els.uploadStatus, 'Choose an Excel file first.', true);
    return;
  }
  formData.append('file', els.fileInput.files[0]);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) {
    setBox(els.uploadStatus, data.error || 'Upload failed.', true);
    return;
  }
  const warningText = data.warnings && data.warnings.length ? ` Warnings: ${data.warnings.join(' | ')}` : '';
  setBox(els.uploadStatus, `${data.message}${warningText}`);
  els.uploadForm.reset();
  await loadData();
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
  clearForm();
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

els.uploadForm.addEventListener('submit', uploadWorkbook);
els.recordForm.addEventListener('submit', saveRecord);
els.clearFormBtn.addEventListener('click', clearForm);
els.townFilter.addEventListener('input', applyFilters);
els.provinceFilter.addEventListener('change', applyFilters);
els.recordsTable.addEventListener('click', (event) => {
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

initMap();
clearForm();
loadData();
