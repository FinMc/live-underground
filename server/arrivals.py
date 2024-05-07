from flask import Flask, jsonify
from flask_cors import CORS
import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

def load_station_locations(line):
    with open('%s_station_locations.json' % line, 'r') as file:
        station_locations = json.load(file)
    return {station['stationId']: (station['lat'], station['lang']) for station in station_locations}

lines = ["bakerloo","central", "circle", "district", "dlr", "elizabeth", "hammersmith-city", "jubilee", "metropolitan", "northern", "piccadilly", "victoria"]
excluded = []

app_id = os.getenv('APP_ID')

cors = CORS(app, resources={r"/tfl/*": {"origins": ['http://localhost:3000','https://live-underground.vercel.app']}})
@app.route('/tfl/arrivals')
def get_arrivals():
    # Group arrivals by vehicle ID
    grouped_arrivals = {}
    for line in lines:
        station_locations = load_station_locations(line)
    # Get the latest data for TFL arrivals on the lines
        response = requests.get('https://api.tfl.gov.uk/Line/%s/Arrivals?%s' % (line, app_id))
        arrivals = response.json()

    
        for arrival in arrivals:
            vehicle_id = "%s-%s" % (arrival['vehicleId'], arrival.get("destinationNaptanId", "0"))
            naptan_id = arrival['naptanId']
            station_name = arrival['stationName']
            time_to_station = arrival['timeToStation']
            lineId = arrival['lineId']
            lat, lang = station_locations.get(naptan_id, (None, None))

            if vehicle_id not in grouped_arrivals:
                grouped_arrivals[vehicle_id] = {'currentLocation': [], 'points': [], "currentTime": 0, "line": lineId}
            
            grouped_arrivals[vehicle_id]['points'].append({
                'naptanId': naptan_id,
                'stationName': station_name,
                'timeToStation': time_to_station,
                'lat': lat,
                'lang': lang,
            })

    # Sort stations by timeToStation
    for vehicle_id in grouped_arrivals:
        grouped_arrivals[vehicle_id]['points'] = sorted(grouped_arrivals[vehicle_id]['points'], key=lambda x: x['timeToStation'])
        grouped_arrivals[vehicle_id]['currentLocation'] = [grouped_arrivals[vehicle_id]['points'][0]['lat'], grouped_arrivals[vehicle_id]['points'][0]['lang']]

    # Return the grouped and sorted arrivals as JSON
    return jsonify(grouped_arrivals)

if __name__ == '__main__':
    app.run()