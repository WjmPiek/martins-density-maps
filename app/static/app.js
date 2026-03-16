const state = {
  allFeatures: [],
  filtered: [],
  mode: "heat",
  radius: 24,
  map: null,
  heatLayer: null,
  markerLayer: null,
};

const els = {
  totalRows: document.getElementById("totalRows"),
  mappedRows: document.getElementById("mappedRows"),
  warningCount: document.getElementById("warningCount"),
  visibleRows: document.getElementById("visibleRows"),
  townFilter: document.getElementById("townFilter"),
  townSelect: document.getElementById("townSelect"),
  provinceSelect: document.getElementById("provinceSelect"),
  radiusRange: document.getElementById("radiusRange"),
  status: document.getElementById("status"),
  emptyState: document.getElementById("emptyState"),
  validationBox: document.getElementById("validationBox"),
  fileInput: document.getElementById("fileInput"),
  uploadForm: document.getElementById("uploadForm"),
  editorForm: document.getElementById("editorForm"),
  addressTableBody: document.getElementById("addressTableBody"),
  modeButtons: Array.from(document.querySelectorAll(".seg")),
  resetBtn: document.getElementById("resetBtn"),
  fields: {
    rowNumber: document.getElementById("rowNumber"),
    mfFile: document.getElementById("mfFile"),
    dod: document.getElementById("dod"),
    deceasedName: document.getElementById("deceasedName"),
    deceasedSurname: document.getElementById("deceasedSurname"),
    address: document.getElementById("address"),
    city: document.getElementById("city"),
    province: document.getElementById("province"),
    country: document.getElementById("country"),
    contactNumber: document.getElementById("contactNumber"),
    relationship: document.getElementById("relationship"),
    nextOfKinName: document.getElementById("nextOfKinName"),
    nextOfKinSurname: document.getElementById("nextOfKinSurname"),
    weight: document.getElementById("weight"),
    latitude: document.getElementById("latitude"),
    longitude: document.getElementById("longitude"),
  },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle("error", isError);
}

function showValidation(summary) {
  if (!summary) {
    els.validationBox.classList.add("hidden");
    els.validationBox.innerHTML = "";
    return;
  }
  const warnings = summary.warnings || [];
  const html = [`<strong>Validation:</strong> ${summary.validRows || 0} valid rows, ${summary.warningCount || 0} warnings.`];
  if (warnings.length) {
    html.push(`<ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
  }
  els.validationBox.innerHTML = html.join("");
  els.validationBox.classList.remove("hidden");
}

function initMap() {
  state.map = L.map("map", { zoomControl: true }).setView([-29.0, 24.0], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.map);

  state.markerLayer = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 44 });
}

function featurePopup(feature) {
  const rows = [
    ["MF File", feature.mfFile || feature.id || "-"],
    ["Name", feature.name || "-"],
    ["Address", feature.fullAddress || "-"],
    ["Town", feature.city || "-"],
    ["Province", feature.province || "-"],
    ["DOD", feature.dod || "-"],
    ["Next of kin", feature.nextOfKin || "-"],
    ["Relationship", feature.relationship || "-"],
    ["Contact", feature.contactNumber || "-"],
    ["Coordinates", Number.isFinite(feature.lat) && Number.isFinite(feature.lng) ? `${feature.lat.toFixed(6)}, ${feature.lng.toFixed(6)}` : "-"],
  ];
  const body = rows.map(([label, value]) =>
    `<div class="popup-row"><strong>${escapeHtml(label)}:</strong> <span>${escapeHtml(value)}</span></div>`
  ).join("");
  return `${body}<div class="popup-actions"><a href="${escapeHtml(feature.googleMapsUrl)}" target="_blank" rel="noreferrer">Open in Google Maps</a></div>`;
}

function featureTooltip(feature) {
  const line1 = escapeHtml(feature.name || "Unknown address");
  const line2 = escapeHtml(feature.fullAddress || feature.hoverSummary || "No address details");
  const line3 = escapeHtml([feature.contactNumber, feature.relationship].filter(Boolean).join(" | "));
  return `<div class="marker-hover"><strong>${line1}</strong><div>${line2}</div>${line3 ? `<div>${line3}</div>` : ""}</div>`;
}

function renderLayers() {
  const mapped = state.filtered.filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng));

  if (state.heatLayer) {
    state.map.removeLayer(state.heatLayer);
    state.heatLayer = null;
  }
  state.markerLayer.clearLayers();
  if (state.map.hasLayer(state.markerLayer)) {
    state.map.removeLayer(state.markerLayer);
  }

  if (!mapped.length) {
    els.emptyState.classList.remove("hidden");
    return;
  }
  els.emptyState.classList.add("hidden");

  const heatData = [];
  const bounds = [];
  mapped.forEach((feature) => {
    bounds.push([feature.lat, feature.lng]);
    heatData.push([feature.lat, feature.lng, Number(feature.weight || 1)]);
    const marker = L.marker([feature.lat, feature.lng]);
    marker.bindPopup(featurePopup(feature), { maxWidth: 360 });
    marker.bindTooltip(featureTooltip(feature), {
      direction: "top",
      sticky: true,
      opacity: 0.98,
      className: "hover-tooltip",
      offset: [0, -10],
    });
    marker.on("mouseover", () => marker.openTooltip());
    marker.on("mouseout", () => marker.closeTooltip());
    state.markerLayer.addLayer(marker);
  });

  if (state.mode === "heat") {
    state.heatLayer = L.heatLayer(heatData, { radius: state.radius, blur: 18, maxZoom: 12 }).addTo(state.map);
  } else {
    state.markerLayer.addTo(state.map);
  }

  state.map.fitBounds(bounds, { padding: [30, 30] });
}

function populateSelect(selectEl, values, label) {
  selectEl.innerHTML = `<option value="">All ${label}</option>`;
  values.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    selectEl.appendChild(opt);
  });
}

function renderTable() {
  const rows = state.filtered.slice().sort((a, b) => String(a.city).localeCompare(String(b.city)) || String(a.name).localeCompare(String(b.name)));
  if (!rows.length) {
    els.addressTableBody.innerHTML = '<tr><td colspan="8" class="muted empty-row">No addresses match the current filter.</td></tr>';
    return;
  }
  els.addressTableBody.innerHTML = rows.map((feature) => `
    <tr>
      <td>${escapeHtml(feature.mfFile || "-")}</td>
      <td>${escapeHtml(feature.name || "-")}</td>
      <td>${escapeHtml(feature.city || "-")}</td>
      <td>${escapeHtml(feature.province || "-")}</td>
      <td>${escapeHtml(feature.fullAddress || feature.address || "-")}</td>
      <td>${escapeHtml(feature.contactNumber || "-")}</td>
      <td>${Number.isFinite(feature.lat) && Number.isFinite(feature.lng) ? "Ready" : "Missing"}</td>
      <td>
        <div class="row-actions">
          <button class="ghost mini" type="button" data-edit="${feature.rowNumber}">Edit</button>
          <button class="ghost mini danger" type="button" data-delete="${feature.rowNumber}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function updateStats(payload = {}) {
  els.totalRows.textContent = String(state.allFeatures.length);
  els.mappedRows.textContent = String(state.allFeatures.filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng)).length);
  els.visibleRows.textContent = String(state.filtered.length);
  els.warningCount.textContent = String(payload.warningCount ?? 0);
}

function applyFilters() {
  const search = els.townFilter.value.trim().toLowerCase();
  const selectedTown = els.townSelect.value.trim().toLowerCase();
  const selectedProvince = els.provinceSelect.value.trim().toLowerCase();

  state.filtered = state.allFeatures.filter((feature) => {
    const town = String(feature.city || "").trim().toLowerCase();
    const province = String(feature.province || "").trim().toLowerCase();
    if (selectedTown && town !== selectedTown) return false;
    if (selectedProvince && province !== selectedProvince) return false;
    if (search && !(town.includes(search) || province.includes(search) || String(feature.fullAddress || "").toLowerCase().includes(search))) return false;
    return true;
  });

  updateStats();
  renderLayers();
  renderTable();
}

function fillEditor(feature) {
  els.fields.rowNumber.value = feature.rowNumber || "";
  els.fields.mfFile.value = feature.mfFile || "";
  els.fields.dod.value = feature.dod || "";
  els.fields.deceasedName.value = feature.deceasedName || "";
  els.fields.deceasedSurname.value = feature.deceasedSurname || "";
  els.fields.address.value = feature.address || "";
  els.fields.city.value = feature.city || "";
  els.fields.province.value = feature.province || "";
  els.fields.country.value = feature.country || "South Africa";
  els.fields.contactNumber.value = feature.contactNumber || "";
  els.fields.relationship.value = feature.relationship || "";
  els.fields.nextOfKinName.value = feature.nextOfKinName || "";
  els.fields.nextOfKinSurname.value = feature.nextOfKinSurname || "";
  els.fields.weight.value = feature.weight || 1;
  els.fields.latitude.value = Number.isFinite(feature.lat) ? feature.lat : "";
  els.fields.longitude.value = Number.isFinite(feature.lng) ? feature.lng : "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearEditor() {
  els.editorForm.reset();
  els.fields.rowNumber.value = "";
  els.fields.country.value = "South Africa";
  els.fields.weight.value = 1;
}

function collectEditorPayload() {
  return {
    rowNumber: els.fields.rowNumber.value,
    "MF File": els.fields.mfFile.value,
    DOD: els.fields.dod.value,
    "Deceased Name": els.fields.deceasedName.value,
    "Deceased Surname": els.fields.deceasedSurname.value,
    Address: els.fields.address.value,
    City: els.fields.city.value,
    Province: els.fields.province.value,
    Country: els.fields.country.value,
    "Contact Number": els.fields.contactNumber.value,
    Relationship: els.fields.relationship.value,
    "Next of Kin Name": els.fields.nextOfKinName.value,
    "Next of Kin Surname": els.fields.nextOfKinSurname.value,
    Weight: els.fields.weight.value,
    Latitude: els.fields.latitude.value,
    Longitude: els.fields.longitude.value,
  };
}

function updateFromPayload(payload) {
  state.allFeatures = payload.features || [];
  populateSelect(els.townSelect, payload.towns || [], "towns");
  populateSelect(els.provinceSelect, payload.provinces || [], "provinces");
  updateStats(payload);
  showValidation(payload);
  applyFilters();
}

async function loadData() {
  setStatus("Loading address data...");
  try {
    const response = await fetch("/api/data");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load data.");
    updateFromPayload(payload);

    let msg = `${payload.mappedCount} of ${payload.count} rows mapped.`;
    if (payload.filledFromCache) msg += ` ${payload.filledFromCache} rows filled from cache.`;
    if (payload.geocodedThisRun) msg += ` ${payload.geocodedThisRun} rows geocoded with Google.`;
    if (payload.unresolved) msg += ` ${payload.unresolved} rows still need a better address.`;
    if (!payload.googleGeocodingEnabled) msg += " Add GOOGLE_MAPS_API_KEY on the server to auto-geocode missing coordinates.";
    setStatus(msg);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Something went wrong.", true);
  }
}

async function uploadWorkbook(event) {
  event.preventDefault();
  const file = els.fileInput.files[0];
  if (!file) {
    setStatus("Choose an .xlsx file first.", true);
    return;
  }
  const formData = new FormData();
  formData.append("file", file);
  setStatus("Uploading workbook and validating addresses...");
  try {
    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const payload = await response.json();
    if (!response.ok) throw new Error((payload.errors || []).join(" ") || payload.error || "Upload failed.");
    showValidation(payload);
    let msg = payload.message || "Workbook uploaded.";
    if (payload.filledFromCache) msg += ` ${payload.filledFromCache} rows matched from cache.`;
    if (payload.geocodedThisRun) msg += ` ${payload.geocodedThisRun} rows geocoded with Google.`;
    if (payload.unresolved) msg += ` ${payload.unresolved} rows still need a better address.`;
    setStatus(msg);
    await loadData();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Upload failed.", true);
  }
}

async function saveAddress(event) {
  event.preventDefault();
  const payload = collectEditorPayload();
  setStatus(payload.rowNumber ? "Updating address..." : "Saving new address...");
  try {
    const response = await fetch("/api/rows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error((body.errors || []).join(" ") || body.error || "Could not save address.");
    updateFromPayload(body);
    clearEditor();
    setStatus(body.message || "Address saved.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not save address.", true);
  }
}

async function deleteAddress(rowNumber) {
  if (!window.confirm("Delete this address from the workbook?")) return;
  setStatus("Deleting address...");
  try {
    const response = await fetch(`/api/rows/${rowNumber}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not delete address.");
    updateFromPayload(payload);
    clearEditor();
    setStatus(payload.message || "Address deleted.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not delete address.", true);
  }
}

function attachEvents() {
  els.townFilter.addEventListener("input", applyFilters);
  els.townSelect.addEventListener("change", applyFilters);
  els.provinceSelect.addEventListener("change", applyFilters);
  els.radiusRange.addEventListener("input", (event) => {
    state.radius = Number(event.target.value || 24);
    if (state.mode === "heat") renderLayers();
  });
  els.uploadForm.addEventListener("submit", uploadWorkbook);
  els.editorForm.addEventListener("submit", saveAddress);
  els.resetBtn.addEventListener("click", clearEditor);

  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      els.modeButtons.forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      state.mode = button.dataset.mode;
      renderLayers();
    });
  });

  els.addressTableBody.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-edit]");
    if (editBtn) {
      const rowNumber = Number(editBtn.dataset.edit);
      const feature = state.allFeatures.find((item) => item.rowNumber === rowNumber);
      if (feature) fillEditor(feature);
      return;
    }
    const deleteBtn = event.target.closest("[data-delete]");
    if (deleteBtn) {
      deleteAddress(Number(deleteBtn.dataset.delete));
    }
  });
}

initMap();
attachEvents();
loadData();
