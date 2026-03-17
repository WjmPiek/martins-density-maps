Martins Density Map - fixed package

What was fixed:
- removed duplicate/overriding route and service code that broke /api/records and imports
- restored the full API: records list/save/delete, analytics, and upload
- added missing auth reset-password route used by the login page
- added missing admin features: users list, user preview, activate/deactivate, delete
- added inactive-user support and blocked inactive logins
- added missing record fields used by the dashboard UI:
  - church_name
  - church_address
  - pastor_name
  - postal_code
- updated Excel import/export/template columns to include the newer church/postal fields
- made Excel import backward-compatible with the older workbook format too
- added startup schema compatibility patch so existing databases can add the new columns
- ensured runtime folders are created automatically
- kept admin dashboards read-only so admins do not accidentally overwrite user data

Validation completed:
- Flask app imports successfully
- routes render successfully
- user login/save/delete/upload flows tested
- admin dashboard/users/preview flows tested
- Python files compile successfully

Main files updated:
- app/config.py
- app/constants.py
- app/factory.py
- app/models.py
- app/schema.py
- app/routes/admin.py
- app/routes/api.py
- app/routes/auth.py
- app/routes/main.py
- app/services/excel.py
- app/services/export.py
- app/services/geocoding.py
- app/services/records.py
- app/utils/helpers.py
