# Martins Density Map CRM

This package is a deployable Flask website for Martins address management and mapping.

## Features
- One Excel file only: `data/martins_density_map_data.xlsx`
- In-browser address editor for add, edit, and delete
- Province filter and town search
- Heatmap, clusters, and marker modes
- Hover details on each pin and full popup on click
- Automatic Google geocoding for rows missing Latitude/Longitude
- Geocoding cache saved in `data/geocode_cache.json`
- Workbook upload validation and download of current workbook
- Render blueprint updated for a persistent disk

## Folder structure
- `app.py` — Flask backend and workbook API
- `static/index.html` — UI
- `static/app.js` — map logic and CRM actions
- `static/styles.css` — styling
- `data/martins_density_map_data.xlsx` — workbook to maintain
- `data/geocode_cache.json` — geocode cache
- `requirements.txt` — Python dependencies
- `render.yaml` — Render Blueprint config
- `Procfile` — fallback start config

## Local run
1. Open a terminal in this folder.
2. Install dependencies:
   ```bash
   python -m pip install -r requirements.txt
   ```
3. Add your Google Maps Geocoding API key:
   - Windows PowerShell:
     ```powershell
     $env:GOOGLE_MAPS_API_KEY="YOUR_KEY"
     ```
   - macOS / Linux:
     ```bash
     export GOOGLE_MAPS_API_KEY="YOUR_KEY"
     ```
4. Start the app:
   ```bash
   python app.py
   ```
5. Open:
   ```text
   http://127.0.0.1:5000
   ```

## Deploy on Render
1. Create a GitHub repo and upload this folder.
2. In Render, create a new Blueprint or Web Service from the repo.
3. Keep the persistent disk mount at `/opt/render/project/src/data` so workbook edits and geocode cache survive restarts.
4. Add `GOOGLE_MAPS_API_KEY` in environment variables.
5. Deploy and open the public URL.

## How the CRM works
- Uploading a workbook replaces `data/martins_density_map_data.xlsx`.
- The website validates workbook structure and warns about duplicate or incomplete rows.
- Editing, adding, or deleting an address updates the workbook directly.
- When a row has a usable address but no coordinates, the backend checks the saved cache first and then Google Geocoding if needed.
- New coordinates are written back into the workbook and cache automatically.

## Required workbook columns
The first sheet must include these columns:
- MF File
- Deceased Name
- Deceased Surname
- DOD
- Address
- City
- Province
- Country
- Full Address
- Latitude
- Longitude
- Weight
- Next of Kin Name
- Next of Kin Surname
- Relationship
- Contact Number
