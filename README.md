# Martins Density Map - Complete Backend Build

This package includes a modular Flask backend and the existing templates/static files.

## Folder structure
- `app.py` - Render/Gunicorn entrypoint
- `app/` - backend package
  - `config.py` - app config
  - `extensions.py` - SQLAlchemy and LoginManager
  - `models.py` - User, Upload, Record models
  - `routes/` - auth, main, admin, api, web upload routes
  - `services/` - geocoding, Excel import, exports, record logic
  - `utils/` - helpers and decorators
- `templates/` - Jinja templates
- `static/` - JS/CSS/assets
- `uploads/`, `data/`, `instance/` - runtime folders

## Environment variables
- `SECRET_KEY`
- `DATABASE_URL`
- `GOOGLE_MAPS_API_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`

## Deploy
Render start command:
`gunicorn app:app`

## Endpoints
- `/dashboard`
- `/api/records`
- `/api/records/<id>`
- `/api/upload`
- `/api/analytics`
- `/download-template`
- `/download/my-data.xlsx`
- `/admin`
