import sys
import ijson
import json
import requests


outfile = []

line = sys.argv[1]
out_file_name = "%s_station_locations.json" % line

response = requests.get('https://api.tfl.gov.uk/line/%s/stoppoints' % line)
out = response.json()
for station in out:
    outfile.append({"stationId": station['id'],"station": station['commonName']})

for i in range(len(outfile)):
    print("LatLang for " + outfile[i]['station'] + ": ")
    contents = []
    inputted = False
    while not(inputted):
        try:
            latLang = input()
            lat = json.loads(latLang)["lat"]
            lang = json.loads(latLang)["lng"]
            outfile[i]['lat'] = lat
            outfile[i]['lang'] = lang
        except:
            print("Invalid input, please try again")
        else:
            inputted = True
with open(out_file_name, 'w', encoding='utf-8') as f:
    json.dump(outfile, f, indent=4)