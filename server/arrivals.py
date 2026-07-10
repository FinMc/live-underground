from concurrent.futures import ThreadPoolExecutor, as_completed

from flask import Flask, jsonify
from flask_cors import CORS
import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_station_locations(line):
    path = os.path.join(BASE_DIR, '%s_station_locations.json' % line)
    with open(path, 'r') as file:
        station_locations = json.load(file)
    return {station['stationId']: (station['lat'], station['lang']) for station in station_locations}

lines = ["bakerloo","central", "circle", "district", "dlr", "elizabeth", "hammersmith-city", "jubilee", "metropolitan", "northern", "piccadilly", "victoria"]

# Each line's JSON file lists that line's own stations, clicked at that line's
# position on the schematic map. Interchanges (e.g. Tottenham Court Road, Bank)
# therefore appear in several files under the same naptanId but at *different*
# coordinates - each on its own line's drawn route.
#
# Keep the per-line lookups separate and prefer a stop's own line, so a Central
# train's Tottenham Court Road resolves to the Central platform rather than
# whichever file happened to be merged last. A flat merge is still built as a
# fallback for the occasional stop a train calls at that isn't in its own line's
# file (shared track), where any on-map position is better than none.
STATION_LOCATIONS_BY_LINE = {_line: load_station_locations(_line) for _line in lines}
STATION_LOCATIONS = {}
for _line in lines:
    STATION_LOCATIONS.update(STATION_LOCATIONS_BY_LINE[_line])

def locate_station(line, naptan_id):
    own = STATION_LOCATIONS_BY_LINE.get(line)
    if own and naptan_id in own:
        return own[naptan_id]
    return STATION_LOCATIONS.get(naptan_id, (None, None))

# A train needs at least 2 predicted stops to have anywhere to move towards -
# a single-point "route" starts and ends at the same place, so it never moves.
MIN_POINTS_TO_ANIMATE = 2

tfl_app_key = os.getenv('TFL_APP_KEY')
tfl_params = {'app_key': tfl_app_key} if tfl_app_key else {}

cors = CORS(app, resources={r"/tfl/*": {"origins": ['http://localhost:3000','https://live-underground.vercel.app']}})

def fetch_line_arrivals(line):
    response = requests.get(
        'https://api.tfl.gov.uk/Line/%s/Arrivals' % line,
        params=tfl_params,
        timeout=8,
    )
    response.raise_for_status()
    return response.json()

@app.route('/tfl/arrivals')
def get_arrivals():
    # Group arrivals by vehicle ID
    grouped_arrivals = {}

    # Fetch all lines concurrently so one slow/failed line doesn't stall the rest
    with ThreadPoolExecutor(max_workers=len(lines)) as executor:
        futures = [executor.submit(fetch_line_arrivals, line) for line in lines]
        for future in as_completed(futures):
            try:
                arrivals = future.result()
            except requests.RequestException as error:
                app.logger.warning('Failed to fetch TfL arrivals: %s', error)
                continue

            for arrival in arrivals:
                naptan_id = arrival['naptanId']
                lat, lang = locate_station(arrival['lineId'], naptan_id)
                if lat is None or lang is None:
                    # Unknown station location - skip rather than let a null
                    # coordinate become an interpolation target on the client.
                    continue

                vehicle_id = "%s-%s" % (arrival['vehicleId'], arrival.get("destinationNaptanId", "0"))
                station_name = arrival['stationName']
                time_to_station = arrival['timeToStation']
                lineId = arrival['lineId']

                if vehicle_id not in grouped_arrivals:
                    grouped_arrivals[vehicle_id] = {
                        'currentLocation': [],
                        'points': [],
                        "currentTime": 0,
                        "line": lineId,
                        "destinationName": arrival.get('destinationName') or None,
                    }

                grouped_arrivals[vehicle_id]['points'].append({
                    'naptanId': naptan_id,
                    'stationName': station_name,
                    'timeToStation': time_to_station,
                    'lat': lat,
                    'lang': lang,
                })

    # Sort stations by timeToStation, and drop vehicles that don't have enough
    # stops left to animate (see MIN_POINTS_TO_ANIMATE above).
    for vehicle_id in list(grouped_arrivals.keys()):
        points = sorted(grouped_arrivals[vehicle_id]['points'], key=lambda x: x['timeToStation'])
        if len(points) < MIN_POINTS_TO_ANIMATE:
            del grouped_arrivals[vehicle_id]
            continue
        grouped_arrivals[vehicle_id]['points'] = points
        grouped_arrivals[vehicle_id]['currentLocation'] = [points[0]['lat'], points[0]['lang']]

    # Return the grouped and sorted arrivals as JSON
    return jsonify(grouped_arrivals)

@app.route('/tfl/line-status')
def get_line_status():
    response = requests.get(
        'https://api.tfl.gov.uk/Line/%s/Status' % ','.join(lines),
        params=tfl_params,
        timeout=8,
    )
    response.raise_for_status()

    statuses = {}
    for line in response.json():
        line_statuses = line.get('lineStatuses', [])
        if not line_statuses:
            continue
        # A line can have several concurrent statuses (e.g. good service on
        # one branch, part suspended on another) - surface the worst one.
        worst = min(line_statuses, key=lambda status: status['statusSeverity'])
        statuses[line['id']] = {
            'name': line['name'],
            'statusSeverity': worst['statusSeverity'],
            'statusSeverityDescription': worst['statusSeverityDescription'],
            'reason': worst.get('reason'),
        }

    return jsonify(statuses)

if __name__ == '__main__':
    app.run()
