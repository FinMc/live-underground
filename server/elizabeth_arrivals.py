from flask import Flask, jsonify
from flask_cors import CORS
import requests
import json

app = Flask(__name__)

def load_station_locations():
    with open('elizabeth_station_locations.json', 'r') as file:
        station_locations = json.load(file)
    return {station['stationId']: (station['lat'], station['lang']) for station in station_locations}


station_locations = load_station_locations()
CORS(app)
@app.route('/tfl/arrivals/elizabeth')
def get_elizabeth_arrivals():
    # Get the latest data for TFL arrivals on the elizabeth line
    response = requests.get('https://api.tfl.gov.uk/Line/elizabeth/Arrivals')
    arrivals = response.json()

    # Group arrivals by vehicle ID
    grouped_arrivals = {}
    for arrival in arrivals:
        vehicle_id = arrival['vehicleId']
        naptan_id = arrival['naptanId']
        station_name = arrival['stationName']
        time_to_station = arrival['timeToStation']
        lat, lang = station_locations.get(naptan_id, (None, None))

        if vehicle_id not in grouped_arrivals:
            grouped_arrivals[vehicle_id] = {'currentLocation': [], 'points': [], "currentTime": 0}
        
        grouped_arrivals[vehicle_id]['points'].append({
            'naptanId': naptan_id,
            'stationName': station_name,
            'timeToStation': time_to_station,
            'lat': lat,
            'lang': lang
        })

    # Sort stations by timeToStation
    for vehicle_id in grouped_arrivals:
        grouped_arrivals[vehicle_id]['points'] = sorted(grouped_arrivals[vehicle_id]['points'], key=lambda x: x['timeToStation'])
        grouped_arrivals[vehicle_id]['currentLocation'] = [grouped_arrivals[vehicle_id]['points'][0]['lat'], grouped_arrivals[vehicle_id]['points'][0]['lang']]

    # Return the grouped and sorted arrivals as JSON
    return jsonify(grouped_arrivals)

if __name__ == '__main__':
    app.run()