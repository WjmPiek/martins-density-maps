from flask_login import login_user
from app.models import User
from flask import Blueprint, request, redirect, session
import jwt

sso_bp = Blueprint("sso", __name__)

JWT_SECRET = "egLS7HpNKDeZp3P2ALBEZuEKh7pzXvHaTrUsPbf69lA="


@sso_bp.route("/central-login")
def central_login():

    token = request.args.get("token")

    if not token:
        return "Missing token", 400

    try:

        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=["HS256"],
            audience="density",
            issuer="central-portal"
        )

        print("SSO EMAIL:", payload.get("email"))

        user = User.query.filter_by(
            email=payload.get("email")
        ).first()

        print("SSO USER:", user)

        if not user:
            return "SSO user not found in Density", 403

        login_user(user, remember=True)

        print("IS AUTHENTICATED:", user.is_authenticated)

        session["user_email"] = payload.get("email")
        session["user_name"] = payload.get("name")
        session["user_role"] = payload.get("role")
        session["sso_logged_in"] = True

        return redirect("/")

    except Exception as e:
        return f"SSO failed: {str(e)}", 401