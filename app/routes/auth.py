from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user
from sqlalchemy import func

from ..extensions import db
from ..models import User
from ..utils.helpers import normalize_text

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))

    if request.method == "POST":
        name = normalize_text(request.form.get("name"))
        email = normalize_text(request.form.get("email")).lower()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm_password", "")

        if not name or not email or not password:
            flash("Name, email, and password are required.", "danger")
        elif password != confirm:
            flash("Passwords do not match.", "danger")
        elif User.query.filter(func.lower(User.email) == email).first():
            flash("An account with that email already exists.", "warning")
        else:
            user = User(name=name, email=email, role="user", is_active=True)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
            login_user(user)
            flash("Welcome to Martins Density Map.", "success")
            return redirect(url_for("main.dashboard"))

    return render_template("register.html")


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))

    if request.method == "POST":
        email = normalize_text(request.form.get("email")).lower()
        password = request.form.get("password", "")
        user = User.query.filter(func.lower(User.email) == email).first()

        if user and user.check_password(password):
            if not user.is_active:
                flash("Your account has been deactivated. Please contact an administrator.", "danger")
            else:
                login_user(user, remember=True)
                flash("Signed in successfully.", "success")
                next_url = request.args.get("next")
                return redirect(next_url or url_for("main.dashboard"))
        else:
            flash("Invalid email or password.", "danger")

    return render_template("login.html")


@auth_bp.route("/reset-password", methods=["GET", "POST"])
def reset_password():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))

    if request.method == "POST":
        email = normalize_text(request.form.get("email")).lower()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm_password", "")
        user = User.query.filter(func.lower(User.email) == email).first()

        if not user:
            flash("No account was found for that email address.", "danger")
        elif password != confirm:
            flash("Passwords do not match.", "danger")
        elif not password:
            flash("A new password is required.", "danger")
        else:
            user.set_password(password)
            db.session.commit()
            flash("Password reset successfully. You can now log in.", "success")
            return redirect(url_for("auth.login"))

    return render_template("reset_password.html")


@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("auth.login"))
