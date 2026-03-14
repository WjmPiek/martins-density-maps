import json
from urllib.parse import urlencode
from urllib.request import urlopen

from flask import current_app


def geocode_address(full_address):
    api_key = current_app.config.get("GOOGLE_MAPS_API_KEY", "")
    if not full_address or not api_key:
        return None, None

    try:
        params = urlencode({"address": full_address, "key": api_key})
        url = f"https://maps.googleapis.com/maps/api/geocode/json?{params}"
        with urlopen(url, timeout=8) as response:
            data = json.load(response)
        if data.get("status") == "OK" and data.get("results"):
            location = data["results"][0]["geometry"]["location"]
            return location.get("lat"), location.get("lng")
    except Exception as exc:
        current_app.logger.warning("Geocode error for %s: %s", full_address, exc)

    return None, None

# app/services/geocoding.py

import requests
import os

API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

def geocode_address(address):
    url = "https://maps.googleapis.com/maps/api/geocode/json"

    params = {
        "address": address,
        "key": API_KEY
    }

    r = requests.get(url, params=params)
    data = r.json()

    if data["results"]:
        loc = data["results"][0]["geometry"]["location"]
        return loc["lat"], loc["lng"]

    return None, None