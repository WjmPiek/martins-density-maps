import os
import requests


def geocode_address(address: str) -> dict:
    address = (address or "").strip()
    if not address:
        return {
            "place_id": "",
            "formatted_address": "",
            "latitude": None,
            "longitude": None,
            "geocode_status": "EMPTY_ADDRESS",
        }

    api_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    if not api_key:
        return {
            "place_id": "",
            "formatted_address": address,
            "latitude": None,
            "longitude": None,
            "geocode_status": "NO_API_KEY",
        }

    try:
        response = requests.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={
                "address": address,
                "key": api_key,
                "components": "country:ZA",
            },
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()

        status = data.get("status", "ERROR")
        results = data.get("results", [])

        if status == "OK" and results:
            result = results[0]
            location = result.get("geometry", {}).get("location", {})
            return {
                "place_id": result.get("place_id", ""),
                "formatted_address": result.get("formatted_address", address),
                "latitude": location.get("lat"),
                "longitude": location.get("lng"),
                "geocode_status": "OK",
            }

        return {
            "place_id": "",
            "formatted_address": address,
            "latitude": None,
            "longitude": None,
            "geocode_status": status,
        }

    except Exception:
        return {
            "place_id": "",
            "formatted_address": address,
            "latitude": None,
            "longitude": None,
            "geocode_status": "ERROR",
        }