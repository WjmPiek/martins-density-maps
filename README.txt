Included files:
- updated backend model and API/service files for church fields
- updated dashboard HTML and JS for church fields and church coverage map
- constants patch with church columns for import/export templates
- SQL migration to add the three new database columns

Important:
1. Run the SQL migration (or equivalent Flask-Migrate migration) before starting the app.
2. Merge constants_church_patch.py into your existing constants.py so template download and import/export use the new columns.
3. Replace your dashboard.js and templates/dashboard.html with the updated copies.
4. Replace models.py, routes/api.py, services/records.py, services/excel.py, and services/export.py with the updated copies.


2026-03-17 patch:
- fixed reserved PostgreSQL table-name migration issue by using quoted ALTER TABLE statements in app/schema.py
- added missing is_active field to User model and login/admin flows
- removed duplicate broken route/service code blocks that were shadowing the working implementation
- restored record support for postal code and church fields across model/api/import/export
- added reset-password route so the login page link works
