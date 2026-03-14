from functools import wraps

from flask import flash, redirect, url_for
from flask_login import current_user


def admin_required(view_func):
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            flash("Admin access required.", "danger")
            return redirect(url_for("main.dashboard"))
        return view_func(*args, **kwargs)

    return wrapped
