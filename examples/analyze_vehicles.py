import sys
import ijson
import json

out_file_name = sys.argv[2]
outfile = []

with open(sys.argv[1], "rb") as f:
    out = ijson.items(f, "items")
    for line in out:
        for arrival in line:
            if(arrival["vehicleId"] == "202405047180159"):
                 outfile.append(arrival)

with open(out_file_name, 'w', encoding='utf-8') as f:
    json.dump(outfile, f, indent=4)
