from flask import Blueprint, flash, redirect, render_template, send_file, url_for
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Record, Upload, User
from ..services.export import build_workbook
from ..utils.decorators import admin_required

admin_bp = Blueprint('admin', __name__)


@admin_bp.route('/admin')
@login_required
@admin_required
def admin():
    user_count = User.query.count()
    record_count = Record.query.count()
    upload_count = Upload.query.count()
    latest_uploads = Upload.query.order_by(Upload.created_at.desc()).limit(10).all()

    return render_template(
        'admin.html',
        user_count=user_count,
        record_count=record_count,
        upload_count=upload_count,
        latest_uploads=latest_uploads,
    )


@admin_bp.route('/admin/users')
@login_required
@admin_required
def admin_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return render_template('admin_users.html', users=users)


@admin_bp.route('/admin/users/preview')
@login_required
@admin_required
def user_dashboard_preview():
    sample_user = User.query.filter_by(role='user').order_by(User.created_at.asc()).first()
    if sample_user is None:
        flash('No normal user exists yet to preview.', 'warning')
        return redirect(url_for('admin.admin_users'))
    return redirect(url_for('main.dashboard'))


@admin_bp.route('/admin/users/<int:user_id>/deactivate', methods=['POST'])
@login_required
@admin_required
def deactivate_user(user_id):
    user = User.query.get_or_404(user_id)
    if user.id == current_user.id:
        flash('You cannot deactivate your own account.', 'danger')
    else:
        user.is_active = False
        db.session.commit()
        flash(f'{user.name} has been deactivated.', 'success')
    return redirect(url_for('admin.admin_users'))


@admin_bp.route('/admin/users/<int:user_id>/activate', methods=['POST'])
@login_required
@admin_required
def activate_user(user_id):
    user = User.query.get_or_404(user_id)
    user.is_active = True
    db.session.commit()
    flash(f'{user.name} has been activated.', 'success')
    return redirect(url_for('admin.admin_users'))


@admin_bp.route('/admin/users/<int:user_id>/delete', methods=['POST'])
@login_required
@admin_required
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    if user.id == current_user.id:
        flash('You cannot delete your own account.', 'danger')
    else:
        db.session.delete(user)
        db.session.commit()
        flash(f'{user.name} has been deleted.', 'success')
    return redirect(url_for('admin.admin_users'))


@admin_bp.route('/admin/download/central.xlsx')
@login_required
@admin_required
def download_central():
    records = Record.query.join(User).order_by(User.name.asc(), Record.city.asc(), Record.mf_file.asc()).all()
    stream = build_workbook(records)
    return send_file(
        stream,
        as_attachment=True,
        download_name='martins_density_map_data.xlsx',
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
