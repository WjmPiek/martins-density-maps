Martins Density Map v2 (Portable)

Included
- heatmap.html / index.html
- martins_density_map_data.xlsx  <- the single Excel file to maintain
- serve_https.py
- run_https_windows.ps1

What changed
- Reads one Excel file only: martins_density_map_data.xlsx
- Auto-loads the packaged Excel file after login
- Auto-geocodes rows that are missing Latitude / Longitude
- Shows density heatmap plus a cluster view
- Adds town search/filter buttons
- Supports direct Excel drag-and-drop replacement
- Download button always exports the current map data back to Excel

How to run
1) Extract the ZIP
2) Start the HTTPS server:
   powershell -ExecutionPolicy Bypass -File .\run_https_windows.ps1
   or:
   python serve_https.py
3) Open:
   https://localhost:8443/heatmap.html
4) Accept the local certificate warning the first time

Which Excel file to update
- Update only: martins_density_map_data.xlsx

Notes
- The page password is still 1234
- Google Maps internet access is required for the base map and any geocoding
- If xlsx.full.min.js is blocked from CDN on a PC, place a local copy next to heatmap.html as xlsx.full.min.js
