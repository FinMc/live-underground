import sys
import ijson
import json

out_file_name = sys.argv[2]
outfile = []

with open(sys.argv[1], "rb") as f:
    out = ijson.items(f, "item")
    for line in out:
        for station in line:
            outfile.append({"id": station['id'],"station": station['commonName']})

for i in range(len(outfile)):
    print("LatLang for " + outfile[i]['station'] + ": ")
    contents = []
    while True:
        line = input()
        contents.append(line)
        if (line == "}"):
            break
    latLang = "\n".join(contents)
    lat = json.loads(latLang)["lat"]
    lang = json.loads(latLang)["lng"]
    outfile[i]['lat'] = lat
    outfile[i]['lang'] = lang
with open(out_file_name, 'w', encoding='utf-8') as f:
    json.dump(outfile, f, indent=4)