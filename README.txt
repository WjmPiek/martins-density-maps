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
