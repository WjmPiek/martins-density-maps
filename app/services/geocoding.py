import os

import requests
from flask import current_app


def geocode_address(address):
    api_key = current_app.config.get('GOOGLE_MAPS_API_KEY') or os.getenv('GOOGLE_MAPS_API_KEY', '')
    if not address or not api_key:
        return None, None

    try:
        response = requests.get(
            'https://maps.googleapis.com/maps/api/geocode/json',
            params={'address': address, 'key': api_key},
            timeout=8,
        )
        response.raise_for_status()
        data = response.json()
        if data.get('status') == 'OK' and data.get('results'):
            loc = data['results'][0]['geometry']['location']
            return loc.get('lat'), loc.get('lng')
    except Exception as exc:
        current_app.logger.warning('Geocode error for %s: %s', address, exc)

    return None, None
