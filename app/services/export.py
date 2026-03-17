import os
from io import BytesIO

from flask import current_app
from openpyxl import Workbook
from sqlalchemy.orm import joinedload
from werkzeug.utils import secure_filename

from ..constants import EXPORT_COLUMNS
from ..models import Record, User


def build_workbook(records):
    wb = Workbook()
    ws = wb.active
    ws.title = 'Data'
    ws.append(EXPORT_COLUMNS)

    for record in records:
        ws.append(
            [
                record.mf_file,
                record.deceased_name,
                record.deceased_surname,
                record.dod,
                record.address,
                record.city,
                record.province,
                record.postal_code,
                record.country,
                record.full_address,
                record.latitude,
                record.longitude,
                record.weight,
                record.church_name,
                record.church_address,
                record.pastor_name,
                record.next_of_kin_name,
                record.next_of_kin_surname,
                record.relationship,
                record.contact_number,
            ]
        )

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max(max_len + 2, 12), 28)

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream


def workbook_path_for_filename(filename, user_id):
    safe_name = secure_filename(filename or '')
    stem, ext = os.path.splitext(safe_name)
    if not stem:
        stem = f'user_{user_id}'
    if ext.lower() != '.xlsx':
        ext = '.xlsx'
    return os.path.join(current_app.config['DATA_DIR'], f'{stem}{ext}')


def write_records_to_disk(user, original_filename=None):
    user_records = Record.query.filter_by(user_id=user.id).order_by(Record.city.asc(), Record.mf_file.asc()).all()
    branch_path = workbook_path_for_filename(original_filename or f'{user.name}.xlsx', user.id)
    with open(branch_path, 'wb') as fh:
        fh.write(build_workbook(user_records).getvalue())

    all_records = (
        Record.query.options(joinedload(Record.user))
        .join(User)
        .order_by(User.name.asc(), Record.city.asc(), Record.mf_file.asc())
        .all()
    )
    with open(current_app.config['CENTRAL_XLSX_PATH'], 'wb') as fh:
        fh.write(build_workbook(all_records).getvalue())

    return branch_path
