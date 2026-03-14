# Martins Density Map - Multi User Upgrade

This version upgrades the original single-workbook app into a multi-user Flask application with:

- user registration and login
- user-scoped uploads
- user dashboard with add, edit, and delete for the user's own records
- admin dashboard with central Excel export
- database-backed storage instead of a live shared workbook
- light grey and lilac theme
- PNG logo on the login page

## Stack

- Flask
- Flask-Login
- Flask-SQLAlchemy
- PostgreSQL on Render or SQLite locally
- OpenPyXL for workbook import/export
- Leaflet for map display

## Local setup

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

Then open `http://127.0.0.1:5000`.

## Admin bootstrapping

Set these environment variables before first run:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME` optional

The app creates the admin account automatically if it does not exist.

## Workbook template

Uploads must match the same Martins workbook layout. The included `martins_density_map_data.xlsx` file is the template.

## Permissions

- regular users can only see, upload, add, edit, and delete their own records
- admins can see all records and download the central Excel workbook

## Notes

This upgrade does not include live geocoding. It keeps the latitude and longitude fields user-editable and preserves the map/export workflow. If you want, the next pass can add Google geocoding back on top of the new user system.
