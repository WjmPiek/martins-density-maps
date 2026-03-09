
  (() => {
    if (window.__MARTINS_HEATMAP_APP__) return;
    window.__MARTINS_HEATMAP_APP__ = true;

    const $ = (id)=>document.getElementById(id);
    const LS_POINTS_KEY = "martins_density_points_v2";
    const LS_FILE_KEY   = "martins_density_filename_v2";
    const LS_RADIUS_KEY = "martins_density_radius_v2";
    const GATE_OK_KEY   = "martins_gate_ok";
    const GATE_EXP_KEY  = "martins_gate_exp";
    const HEADERS = ["MF File","Deceased Name","Deceased Surname","DOD","Address","City","Province","Country","Full Address","Latitude","Longitude","Weight","Next of Kin Name","Next of Kin Surname","Relationship","Contact Number"];

    let map = null, infoWindow = null;
    let markers = [], densityCircles = [], clusterMarkers = [];
    let points = [], loadedExcelName = "", displayMode = "density", currentTownFilter = "";
    let needsAutoFit = false, appStarted = false;
    let resolveMapsReady;
    const mapsReady = new Promise(r=>resolveMapsReady=r);

    const sleep = (ms) => new Promise(r=>setTimeout(r, ms));
    const toNum = (v) => {
      if (typeof v === "number") return v;
      const s = String(v ?? "").trim().replace(/\s+/g, "").replace(",", ".");
      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    };
    const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
    const makeFullAddress = (a,c,p,co) => [a,c,p,co].map(v=>(v||"").trim()).filter(Boolean).join(", ");
    const normalizeTown = (s) => String(s || "").trim().toLowerCase();

    function setStatus(msg){ $("status").textContent = msg || ""; }
    function normalizePw(s){ return (s || "").trim(); }

    function rowToPoint(r){
      const address = String(r["Address"] ?? "").trim();
      const city = String(r["City"] ?? "").trim();
      const province = String(r["Province"] ?? "").trim();
      const country = String(r["Country"] ?? "").trim() || "South Africa";
      const fullAddress = String(r["Full Address"] ?? "").trim() || makeFullAddress(address, city, province, country);
      const lat = toNum(r["Latitude"]);
      const lng = toNum(r["Longitude"]);
      const weightRaw = toNum(r["Weight"]);
      const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 1;
      return {
        mfFile: String(r["MF File"] ?? "").trim(),
        deceasedName: String(r["Deceased Name"] ?? "").trim(),
        deceasedSurname: String(r["Deceased Surname"] ?? "").trim(),
        dod: String(r["DOD"] ?? "").trim(),
        address, city, province, country, fullAddress,
        lat: Number.isFinite(lat) ? lat : NaN,
        lng: Number.isFinite(lng) ? lng : NaN,
        weight,
        nokName: String(r["Next of Kin Name"] ?? "").trim(),
        nokSurname: String(r["Next of Kin Surname"] ?? "").trim(),
        relationship: String(r["Relationship"] ?? "").trim(),
        contactNumber: String(r["Contact Number"] ?? "").trim()
      };
    }

    function pointToRow(p){
      return {
        "MF File": p.mfFile || "",
        "Deceased Name": p.deceasedName || "",
        "Deceased Surname": p.deceasedSurname || "",
        "DOD": p.dod || "",
        "Address": p.address || "",
        "City": p.city || "",
        "Province": p.province || "",
        "Country": p.country || "",
        "Full Address": p.fullAddress || "",
        "Latitude": Number.isFinite(Number(p.lat)) ? Number(p.lat) : "",
        "Longitude": Number.isFinite(Number(p.lng)) ? Number(p.lng) : "",
        "Weight": p.weight ?? 1,
        "Next of Kin Name": p.nokName || "",
        "Next of Kin Surname": p.nokSurname || "",
        "Relationship": p.relationship || "",
        "Contact Number": p.contactNumber || ""
      };
    }

    function persistAll(){
      try{
        localStorage.setItem(LS_POINTS_KEY, JSON.stringify(points));
        localStorage.setItem(LS_FILE_KEY, loadedExcelName || "");
        localStorage.setItem(LS_RADIUS_KEY, String(Number(CONFIG.DENSITY_RADIUS_METERS || 120)));
        $("savedState").textContent = points.length ? "Yes" : "No";
      }catch(e){
        console.warn(e);
      }
    }

    function loadPersisted(){
      try{
        const raw = localStorage.getItem(LS_POINTS_KEY);
        const fname = localStorage.getItem(LS_FILE_KEY) || "";
        const radius = Number(localStorage.getItem(LS_RADIUS_KEY) || "");
        if (Number.isFinite(radius) && radius > 0) CONFIG.DENSITY_RADIUS_METERS = radius;
        if (raw){
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length){
            points = arr;
            loadedExcelName = fname || CONFIG.DEFAULT_DATA_FILE;
          }
        }
      }catch(e){ console.warn(e); }
    }

    async function geocodeAddress(fullAddress){
      await mapsReady;
      if (!window.google?.maps || !fullAddress) return null;
      const geocoder = new google.maps.Geocoder();
      return new Promise((resolve)=>{
        geocoder.geocode({address: fullAddress}, (results, status)=>{
          if (status === "OK" && results && results[0]){
            const loc = results[0].geometry.location;
            resolve({lat: loc.lat(), lng: loc.lng()});
          } else {
            resolve(null);
          }
        });
      });
    }

    function activePoints(){
      if (!currentTownFilter) return points;
      return points.filter(p => normalizeTown(p.city).includes(currentTownFilter));
    }

    function updateTownUI(){
      const ap = activePoints();
      $("townMatches").textContent = currentTownFilter ? String(ap.length) : "All";
      const counts = new Map();
      for(const p of points){
        const town = (p.city || "").trim();
        if (!town) continue;
        counts.set(town, (counts.get(town) || 0) + 1);
      }
      const top = [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12);
      $("townList").innerHTML = top.map(([town,count]) => `<button class="townBtn" data-town="${escapeHtml(town)}">${escapeHtml(town)} (${count})</button>`).join("");
      [...$("townList").querySelectorAll("[data-town]")].forEach(btn=>{
        btn.addEventListener("click", ()=>{
          $("townSearch").value = btn.getAttribute("data-town");
          applyTownFilter();
        });
      });
    }

    function updateCounts(){
      $("countPts").textContent = String(points.length);
      $("loadedFile").textContent = loadedExcelName || "None";
      $("delayLabel").textContent = CONFIG.GEOCODE_DELAY_MS + "ms";
      $("savedState").textContent = points.length ? "Yes" : "No";
    }

    function updateRadiusUI(){
      $("radiusLabel").textContent = `${Number(CONFIG.DENSITY_RADIUS_METERS || 120)}m`;
      $("densityRadius").value = String(Number(CONFIG.DENSITY_RADIUS_METERS || 120));
    }

    function rebuildTable(){
      const data = activePoints();
      $("rows").innerHTML = data.map((p,i)=>`
        <tr>
          <td>${i+1}</td>
          <td>${escapeHtml(p.mfFile || "")}</td>
          <td>${escapeHtml(p.city || "")}</td>
          <td title="${escapeHtml(p.fullAddress || "")}">${escapeHtml((p.fullAddress || "").slice(0,54))}${(p.fullAddress || "").length>54 ? "…" : ""}</td>
          <td><button class="danger" style="width:auto;padding:6px 10px" data-row="${escapeHtml(p.mfFile || p.fullAddress || String(i))}">Del</button></td>
        </tr>`).join("");
      [...$("rows").querySelectorAll("[data-row]")].forEach((btn, i)=>{
        btn.addEventListener("click", ()=>{
          const target = data[i];
          const idx = points.indexOf(target);
          if (idx >= 0){ points.splice(idx,1); needsAutoFit = true; syncAll(true); }
        });
      });
    }

    function latLngToMercatorMeters(lat, lng){
      const R = 6378137;
      return {
        x: R * (lng * Math.PI/180),
        y: R * Math.log(Math.tan(Math.PI/4 + (lat * Math.PI/180)/2))
      };
    }

    function computeGridGroups(srcPoints, cellMeters){
      const buckets = new Map();
      for(const p of srcPoints){
        const lat = Number(p.lat), lng = Number(p.lng);
        if(!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const w = Number(p.weight ?? 1);
        const m = latLngToMercatorMeters(lat, lng);
        const gx = Math.floor(m.x / cellMeters);
        const gy = Math.floor(m.y / cellMeters);
        const key = gx + "," + gy;
        const cur = buckets.get(key) || {sumLat:0,sumLng:0,count:0,sumW:0};
        cur.sumLat += lat; cur.sumLng += lng; cur.count += 1; cur.sumW += (Number.isFinite(w)&&w>0)?w:1;
        buckets.set(key, cur);
      }
      return [...buckets.values()].map(b => ({
        lat: b.sumLat / b.count,
        lng: b.sumLng / b.count,
        count: b.count,
        weight: b.sumW
      })).sort((a,b)=>b.count-a.count);
    }

    function densityStyle(count, weight){
      const score = Math.max(0, Math.min(1, Math.log1p(count + 0.25*weight)/3.0));
      const r = Math.round(255 - 140 * score);
      return { color: `rgb(${r},0,0)`, fillOpacity: 0.20 + 0.70 * score, strokeOpacity: 0.30 + 0.50 * score };
    }

    function clearLayers(){
      for(const a of [markers, densityCircles, clusterMarkers]){
        for(const item of a) item.setMap && item.setMap(null);
        a.length = 0;
      }
    }

    function setMode(mode){
      displayMode = mode;
      $("modeLabel").textContent = ({
        density: "Density",
        clusters: "Clusters + Density",
        both: "Pins + Density",
        pins: "Pins"
      })[mode] || mode;
      $("mDensity").className = mode === "density" ? "primary" : "";
      $("mClusters").className = mode === "clusters" ? "primary" : "";
      $("mBoth").className = mode === "both" ? "primary" : "";
      $("mPins").className = mode === "pins" ? "primary" : "";
      rebuildMapLayers();
    }

    function rebuildMapLayers(){
      if (!map || !window.google?.maps) return;
      clearLayers();

      const src = activePoints();
      const bounds = new google.maps.LatLngBounds();
      let haveAny = false;
      const radius = Number(CONFIG.DENSITY_RADIUS_METERS || 120);

      for(const cell of computeGridGroups(src, Number(CONFIG.DENSITY_CELL_METERS || radius))){
        const center = new google.maps.LatLng(cell.lat, cell.lng);
        const st = densityStyle(cell.count, cell.weight);
        const circle = new google.maps.Circle({
          center, radius, strokeColor: st.color, strokeOpacity: st.strokeOpacity, strokeWeight: 1,
          fillColor: st.color, fillOpacity: st.fillOpacity,
          map: (displayMode === "density" || displayMode === "clusters" || displayMode === "both") ? map : null
        });
        circle.addListener("click", ()=>{
          infoWindow.setContent(`<div style="font-size:13px;line-height:1.35"><b>${radius}m density</b><br>Records: ${cell.count}<br>Total weight: ${Math.round(cell.weight*100)/100}</div>`);
          infoWindow.setPosition(center);
          infoWindow.open(map);
        });
        densityCircles.push(circle);
        haveAny = true;
        bounds.extend(center);
      }

      if (displayMode === "pins" || displayMode === "both"){
        for(const p of src){
          const lat = Number(p.lat), lng = Number(p.lng);
          if(!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          const ll = new google.maps.LatLng(lat, lng);
          const marker = new google.maps.Marker({position: ll, map, title: p.fullAddress || "Address"});
          marker.addListener("click", ()=>{
            const deceased = `${(p.deceasedName || "").trim()} ${(p.deceasedSurname || "").trim()}`.trim();
            const nok = `${(p.nokName || "").trim()} ${(p.nokSurname || "").trim()}`.trim();
            infoWindow.setContent(`<div style="font-size:13px;line-height:1.35"><div style="font-weight:700;margin-bottom:6px">${escapeHtml(p.fullAddress)}</div><div><b>MF File:</b> ${escapeHtml(p.mfFile)}</div><div><b>Deceased:</b> ${escapeHtml(deceased)}</div><div><b>DOD:</b> ${escapeHtml(p.dod)}</div><div><b>Town:</b> ${escapeHtml(p.city)}</div><div><b>Next of Kin:</b> ${escapeHtml(nok)}</div><div><b>Relationship:</b> ${escapeHtml(p.relationship)}</div><div><b>Contact:</b> ${escapeHtml(p.contactNumber)}</div></div>`);
            infoWindow.open(map, marker);
          });
          markers.push(marker);
          haveAny = true;
          bounds.extend(ll);
        }
      }

      if (displayMode === "clusters"){
        for(const group of computeGridGroups(src, Number(CONFIG.CLUSTER_CELL_METERS || 350))){
          const pos = new google.maps.LatLng(group.lat, group.lng);
          const marker = new google.maps.Marker({
            position: pos,
            map,
            label: {text: String(group.count), color: "#ffffff", fontWeight: "700"},
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: "#1f6feb",
              fillOpacity: 0.88,
              strokeColor: "#ffffff",
              strokeWeight: 1.5,
              scale: Math.max(16, Math.min(30, 12 + group.count))
            },
            title: `${group.count} records`
          });
          marker.addListener("click", ()=>{
            infoWindow.setContent(`<div style="font-size:13px;line-height:1.35"><b>Cluster</b><br>Records: ${group.count}<br>Total weight: ${Math.round(group.weight*100)/100}</div>`);
            infoWindow.open(map, marker);
          });
          clusterMarkers.push(marker);
          haveAny = true;
          bounds.extend(pos);
        }
      }

      if (haveAny && $("fitBounds").checked && needsAutoFit){
        map.fitBounds(bounds, 60);
        needsAutoFit = false;
      }
    }

    function buildWorkbookArrayBuffer(){
      const rows = points.map(pointToRow).map(row => {
        const out = {};
        for (const h of HEADERS) out[h] = row[h] ?? "";
        return out;
      });
      const ws = XLSX.utils.json_to_sheet(rows, {header: HEADERS});
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data");
      return XLSX.write(wb, {bookType: "xlsx", type: "array"});
    }

    async function exportUpdatedXlsx(){
      if (!window.XLSX){ setStatus("XLSX library not loaded."); return; }
      const filename = "martins_density_map_data.xlsx";
      const blob = new Blob([buildWorkbookArrayBuffer()], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      if (window.showSaveFilePicker){
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{description: "Excel Workbook", accept: {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"]}}]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setStatus("Saved updated Excel.");
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(a.href), 1200);
        setStatus("Downloaded updated Excel.");
      }
    }

    async function importWorkbookBuffer(buf, sourceName){
      if (!window.XLSX){ setStatus("XLSX library not loaded. Place xlsx.full.min.js next to this HTML or allow CDN."); return; }
      await mapsReady;
      setStatus("Reading Excel…");
      const wb = XLSX.read(buf, {type: "array"});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval: ""});
      const imported = [];
      let geocoded = 0, failed = 0;
      for (const row of rows){
        const p = rowToPoint(row);
        if (!p.fullAddress) { failed++; continue; }
        if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))){
          setStatus(`Geocoding: ${p.fullAddress}`);
          const res = await geocodeAddress(p.fullAddress);
          if (!res){ failed++; continue; }
          p.lat = res.lat; p.lng = res.lng; geocoded++;
          await sleep(Number(CONFIG.GEOCODE_DELAY_MS || 350));
        }
        imported.push(p);
      }
      points = imported;
      loadedExcelName = sourceName || CONFIG.DEFAULT_DATA_FILE;
      needsAutoFit = true;
      syncAll(true);
      setStatus(`Loaded ${imported.length} records.${geocoded ? " Geocoded " + geocoded + "." : ""}${failed ? " Failed " + failed + "." : ""}`);
    }

    async function handleFile(file){
      if (!file) return;
      const buf = await file.arrayBuffer();
      await importWorkbookBuffer(buf, file.name || CONFIG.DEFAULT_DATA_FILE);
    }

    async function autoLoadDefaultWorkbook(){
      if (points.length) return;
      try{
        const res = await fetch("./" + encodeURIComponent(CONFIG.DEFAULT_DATA_FILE), {cache: "no-store"});
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        await importWorkbookBuffer(buf, CONFIG.DEFAULT_DATA_FILE);
      }catch(e){
        console.warn("No packaged workbook auto-loaded.", e);
      }
    }

    function syncAll(persist){
      updateCounts();
      updateRadiusUI();
      updateTownUI();
      rebuildTable();
      rebuildMapLayers();
      if (persist) persistAll();
    }

    function applyTownFilter(){
      currentTownFilter = normalizeTown($("townSearch").value);
      needsAutoFit = true;
      syncAll(false);
      if (currentTownFilter) setStatus(`Filtered to towns matching "${$("townSearch").value.trim()}".`);
      else setStatus("Town filter cleared.");
    }

    function clearForm(){
      ["mfFile","decName","decSurname","dod","addr","city","prov","contact","nokName","nokSurname"].forEach(id => $(id).value = "");
      $("country").value = "South Africa";
      $("weight").value = "1";
    }

    async function addSingle(){
      const address = $("addr").value.trim();
      const city = $("city").value.trim();
      const province = $("prov").value.trim();
      const country = $("country").value.trim() || "South Africa";
      const fullAddress = makeFullAddress(address, city, province, country);
      if (!fullAddress){ alert("Please enter at least an address."); return; }
      await mapsReady;
      setStatus(`Geocoding: ${fullAddress}`);
      const geo = await geocodeAddress(fullAddress);
      if (!geo){ setStatus("Geocoding failed for this address."); return; }
      points.push({
        mfFile: $("mfFile").value.trim(),
        deceasedName: $("decName").value.trim(),
        deceasedSurname: $("decSurname").value.trim(),
        dod: $("dod").value.trim(),
        address, city, province, country, fullAddress,
        lat: geo.lat, lng: geo.lng,
        weight: Number($("weight").value || 1) || 1,
        nokName: $("nokName").value.trim(),
        nokSurname: $("nokSurname").value.trim(),
        relationship: "",
        contactNumber: $("contact").value.trim()
      });
      needsAutoFit = true;
      syncAll(true);
      clearForm();
      setStatus("Record added and saved.");
    }

    function applyRadius(){
      const r = Number($("densityRadius").value || 120);
      if (!Number.isFinite(r) || r <= 0){ alert("Enter a valid radius."); return; }
      CONFIG.DENSITY_RADIUS_METERS = r;
      CONFIG.DENSITY_CELL_METERS = r;
      CONFIG.CLUSTER_CELL_METERS = Math.max(r * 3, 300);
      needsAutoFit = true;
      syncAll(true);
      setStatus(`Density radius set to ${r}m.`);
    }

    function loadGoogleMaps(){
      if (window.google?.maps) return;
      const s = document.createElement("script");
      s.async = true; s.defer = true;
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(CONFIG.GOOGLE_MAPS_KEY) + "&callback=initMap&loading=async";
      s.onerror = () => setStatus("Failed to load Google Maps. Check key and internet access.");
      document.head.appendChild(s);
    }

    window.initMap = function(){
      map = new google.maps.Map($("map"), {
        center: {lat: -26.2041, lng: 28.0473},
        zoom: 8, gestureHandling: "greedy", mapTypeControl: false, streetViewControl: false, fullscreenControl: true
      });
      infoWindow = new google.maps.InfoWindow();
      resolveMapsReady(true);
      syncAll(false);
      if (points.length) { needsAutoFit = true; rebuildMapLayers(); }
    };

    function bumpGateExpiry(){
      sessionStorage.setItem(GATE_OK_KEY, "1");
      sessionStorage.setItem(GATE_EXP_KEY, String(Date.now() + Number(CONFIG.AUTO_LOCK_MINUTES || 30) * 60 * 1000));
    }
    function isGateValid(){
      return sessionStorage.getItem(GATE_OK_KEY) === "1" && Number(sessionStorage.getItem(GATE_EXP_KEY) || "0") > Date.now();
    }
    function lockNow(msg){
      sessionStorage.removeItem(GATE_OK_KEY);
      sessionStorage.removeItem(GATE_EXP_KEY);
      clearLayers();
      if (infoWindow) infoWindow.close();
      $("gate").classList.remove("hidden");
      $("gateMsg").textContent = msg || "Locked.";
    }
    function armAutoLock(){
      $("lockLabel").textContent = `${Number(CONFIG.AUTO_LOCK_MINUTES || 30)} minutes`;
      setInterval(()=>{ if (sessionStorage.getItem(GATE_OK_KEY)==="1" && !isGateValid()) lockNow("Session timed out. Please log in again."); }, 15000);
      ["mousemove","mousedown","keydown","touchstart","scroll"].forEach(evt=> window.addEventListener(evt, ()=>{ if (isGateValid()) bumpGateExpiry(); }, {passive:true}));
    }

    async function startAppOnce(){
      if (appStarted) return;
      appStarted = true;
      loadPersisted();
      syncAll(false);
      loadGoogleMaps();
      setStatus(points.length ? `Loaded ${points.length} saved records.` : "Ready. Packaged workbook will auto-load after unlock.");
      await autoLoadDefaultWorkbook();
    }

    // events
    $("mDensity").addEventListener("click", ()=>setMode("density"));
    $("mClusters").addEventListener("click", ()=>setMode("clusters"));
    $("mBoth").addEventListener("click", ()=>setMode("both"));
    $("mPins").addEventListener("click", ()=>setMode("pins"));
    $("xlsxFile").addEventListener("change", async e => { const f = e.target.files?.[0]; if (f) await handleFile(f); e.target.value=""; });
    $("downloadBtn").addEventListener("click", exportUpdatedXlsx);
    $("addBtn").addEventListener("click", addSingle);
    $("clearFormBtn").addEventListener("click", clearForm);
    $("applyRadiusBtn").addEventListener("click", applyRadius);
    $("clearTownBtn").addEventListener("click", ()=>{ $("townSearch").value = ""; applyTownFilter(); });
    $("townSearch").addEventListener("keydown", (e)=>{ if (e.key === "Enter") applyTownFilter(); });
    $("townSearch").addEventListener("change", applyTownFilter);
    $("clearAllBtn").addEventListener("click", ()=>{
      if (!confirm("Clear browser-saved copy and current map data?")) return;
      points = []; loadedExcelName = ""; currentTownFilter = "";
      [LS_POINTS_KEY, LS_FILE_KEY, LS_RADIUS_KEY].forEach(k => localStorage.removeItem(k));
      needsAutoFit = false; syncAll(false); setStatus("Cleared browser cache. Packaged workbook will load again on refresh.");
    });
    const drop = $("dropZone");
    ["dragenter","dragover"].forEach(evt => drop.addEventListener(evt, e=>{ e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave","drop"].forEach(evt => drop.addEventListener(evt, e=>{ e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", async e => { const file = e.dataTransfer?.files?.[0]; if (file) await handleFile(file); });

    $("unlockBtn").addEventListener("click", async ()=>{
      if (normalizePw($("pw").value) !== normalizePw(CONFIG.PAGE_PASSWORD)){ $("gateMsg").textContent = "Wrong password."; return; }
      $("pw").value = ""; $("gateMsg").textContent = ""; bumpGateExpiry(); $("gate").classList.add("hidden"); await startAppOnce();
    });
    $("logoutBtn").addEventListener("click", ()=>lockNow("Locked / logged out."));
    armAutoLock();
    if (isGateValid()){ $("gate").classList.add("hidden"); startAppOnce(); }
  })();
  