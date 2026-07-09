"""
Extracts each tube/DLR/Elizabeth line's route geometry from public/new-map.svg
and writes src/line-geometry.json, in the same lat/lng space as the hand-clicked
station coordinates in server/*_station_locations.json.

The map SVG draws each line as several disconnected stroked <path> subpaths in
that line's colour (confirmed by isolating each colour and comparing its shape
against the real tube network - see plan). This script:

  1. Finds every stroked path whose colour matches one of the 12 lines we
     animate trains for, and flattens its path data (M/L/H/V/C/S/A, abs+rel)
     into polylines in raw SVG coordinate space.
  2. Fits a single global affine transform (independent scale/offset per axis,
     no rotation) from SVG space to lat/lng, calibrated against the existing
     hand-clicked station points via iterative closest point - this sidesteps
     having to reason analytically about the SVG's internal letterboxing
     (viewBox aspect ratio != declared width/height) composed with Leaflet's
     ImageOverlay stretch and Mercator projection; ICP absorbs all of it.
  3. Writes the transformed polylines to src/line-geometry.json and prints a
     fit-quality report (distance from each clicked station to its nearest
     point on the extracted geometry) so misfits are visible before use.
"""
import glob
import json
import math
import os
import re
from xml.etree import ElementTree as ET

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG_PATH = os.path.join(BASE_DIR, "public", "new-map.svg")
STATIONS_GLOB = os.path.join(BASE_DIR, "server", "*_station_locations.json")
OUT_PATH = os.path.join(BASE_DIR, "src", "line-geometry.json")
DEBUG_STATIONS_OUT_PATH = os.path.join(BASE_DIR, "src", "line-geometry-debug-stations.json")

# Line colours as drawn in new-map.svg, confirmed by rasterising each colour
# in isolation and comparing its shape against the real tube network.
LINE_COLOURS = {
    "bakerloo": "#b06010",
    "central": "#ee3124",
    "circle": "#ffd200",
    "district": "#00853f",
    "dlr": "#00b1b0",
    "elizabeth": "#634ea0",
    "hammersmith-city": "#f386a1",
    "jubilee": "#949ca1",
    "metropolitan": "#97005e",
    "northern": "#000",
    "piccadilly": "#1c3f94",
    "victoria": "#009ddc",
}
COLOUR_TO_LINE = {v: k for k, v in LINE_COLOURS.items()}

# Curve/arc sampling density - the source curves are simple single corners,
# so this is generous rather than tuned tight.
CURVE_STEPS = 16

# ICP calibration settings.
ICP_ITERATIONS = 8
OUTLIER_REPORT_METRES = 150


# ---------------------------------------------------------------------------
# SVG path data parsing -> flattened polylines in SVG user-space coordinates.
# ---------------------------------------------------------------------------

_NUMBER_RE = re.compile(r"[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?")
_COMMAND_LETTERS = set("MmLlHhVvCcSsQqTtAaZz")


def _tokenize(d):
    """Yields (command_letter_or_None, value) tokens; flags for A/a are
    emitted as raw single-char numeric tokens ('0'/'1'), same as any other
    number - the caller pulls the right count/kind of args per command."""
    i, n = 0, len(d)
    tokens = []
    while i < n:
        c = d[i]
        if c.isspace() or c == ",":
            i += 1
            continue
        if c in _COMMAND_LETTERS:
            tokens.append(("cmd", c))
            i += 1
            continue
        m = _NUMBER_RE.match(d, i)
        if not m or m.end() == i:
            raise ValueError("Bad path data at %d in %r" % (i, d[max(0, i - 20):i + 20]))
        tokens.append(("num", float(m.group(0))))
        i = m.end()
    return tokens


ARG_COUNTS = {
    "M": 2, "L": 2, "H": 1, "V": 1,
    "C": 6, "S": 4, "Q": 4, "T": 2,
    "A": 7, "Z": 0,
}


def parse_path_to_polylines(d):
    """Returns a list of polylines (each a list of (x, y) tuples)."""
    tokens = _tokenize(d)
    idx = 0
    n = len(tokens)

    polylines = []
    current = []
    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    cmd = None
    prev_cubic_ctrl = None  # for S/s reflection

    def flush_point(p):
        current.append(p)

    def read_num():
        nonlocal idx
        kind, val = tokens[idx]
        assert kind == "num", "expected number, got %r at %d" % (tokens[idx], idx)
        idx += 1
        return val

    def sample_cubic(p0, p1, p2, p3, steps=CURVE_STEPS):
        pts = []
        for s in range(1, steps + 1):
            t = s / steps
            mt = 1 - t
            x = (mt ** 3) * p0[0] + 3 * (mt ** 2) * t * p1[0] + 3 * mt * (t ** 2) * p2[0] + (t ** 3) * p3[0]
            y = (mt ** 3) * p0[1] + 3 * (mt ** 2) * t * p1[1] + 3 * mt * (t ** 2) * p2[1] + (t ** 3) * p3[1]
            pts.append((x, y))
        return pts

    def sample_arc(p0, rx, ry, x_rot_deg, large_arc, sweep, p1, steps=CURVE_STEPS):
        # Standard SVG endpoint-to-center arc parameterisation (spec appendix F.6).
        if rx == 0 or ry == 0 or p0 == p1:
            return [p1]
        phi = math.radians(x_rot_deg)
        cos_phi, sin_phi = math.cos(phi), math.sin(phi)
        dx2, dy2 = (p0[0] - p1[0]) / 2.0, (p0[1] - p1[1]) / 2.0
        x1p = cos_phi * dx2 + sin_phi * dy2
        y1p = -sin_phi * dx2 + cos_phi * dy2

        rx, ry = abs(rx), abs(ry)
        lam = (x1p ** 2) / (rx ** 2) + (y1p ** 2) / (ry ** 2)
        if lam > 1:
            scale = math.sqrt(lam)
            rx, ry = rx * scale, ry * scale

        sign = -1 if large_arc == sweep else 1
        num = (rx ** 2) * (ry ** 2) - (rx ** 2) * (y1p ** 2) - (ry ** 2) * (x1p ** 2)
        den = (rx ** 2) * (y1p ** 2) + (ry ** 2) * (x1p ** 2)
        co = sign * math.sqrt(max(0.0, num / den)) if den != 0 else 0.0
        cxp = co * (rx * y1p) / ry
        cyp = -co * (ry * x1p) / rx

        cx = cos_phi * cxp - sin_phi * cyp + (p0[0] + p1[0]) / 2.0
        cy = sin_phi * cxp + cos_phi * cyp + (p0[1] + p1[1]) / 2.0

        def angle(ux, uy, vx, vy):
            dot = ux * vx + uy * vy
            length = math.sqrt((ux ** 2 + uy ** 2) * (vx ** 2 + vy ** 2))
            a = math.acos(max(-1.0, min(1.0, dot / length)))
            return a if (ux * vy - uy * vx) >= 0 else -a

        theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        dtheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        if not sweep and dtheta > 0:
            dtheta -= 2 * math.pi
        elif sweep and dtheta < 0:
            dtheta += 2 * math.pi

        pts = []
        for s in range(1, steps + 1):
            t = theta1 + dtheta * (s / steps)
            x = cx + rx * math.cos(t) * cos_phi - ry * math.sin(t) * sin_phi
            y = cy + rx * math.cos(t) * sin_phi + ry * math.sin(t) * cos_phi
            pts.append((x, y))
        return pts

    while idx < n:
        kind, val = tokens[idx]
        if kind == "cmd":
            cmd = val
            idx += 1
            if cmd in ("Z", "z"):
                if current:
                    current.append(start)
                continue
            # Fall through to argument parsing below on the *next* loop
            # iteration (implicit-repeat handled by re-entering with same cmd).
            continue

        is_rel = cmd.islower()
        C = cmd.upper()

        if C == "M":
            x, y = read_num(), read_num()
            if is_rel:
                x, y = cur[0] + x, cur[1] + y
            if current:
                polylines.append(current)
            current = []
            cur = (x, y)
            start = cur
            flush_point(cur)
            prev_cubic_ctrl = None
            # After the first coordinate pair, subsequent pairs under an M
            # are implicit L - SVG spec.
            cmd = "l" if is_rel else "L"
            continue

        if C == "L":
            x, y = read_num(), read_num()
            if is_rel:
                x, y = cur[0] + x, cur[1] + y
            cur = (x, y)
            flush_point(cur)
            prev_cubic_ctrl = None
            continue

        if C == "H":
            x = read_num()
            x = cur[0] + x if is_rel else x
            cur = (x, cur[1])
            flush_point(cur)
            prev_cubic_ctrl = None
            continue

        if C == "V":
            y = read_num()
            y = cur[1] + y if is_rel else y
            cur = (cur[0], y)
            flush_point(cur)
            prev_cubic_ctrl = None
            continue

        if C == "C":
            x1, y1, x2, y2, x, y = (read_num() for _ in range(6))
            if is_rel:
                x1, y1 = cur[0] + x1, cur[1] + y1
                x2, y2 = cur[0] + x2, cur[1] + y2
                x, y = cur[0] + x, cur[1] + y
            for p in sample_cubic(cur, (x1, y1), (x2, y2), (x, y)):
                flush_point(p)
            prev_cubic_ctrl = (x2, y2)
            cur = (x, y)
            continue

        if C == "S":
            x2, y2, x, y = (read_num() for _ in range(4))
            if is_rel:
                x2, y2 = cur[0] + x2, cur[1] + y2
                x, y = cur[0] + x, cur[1] + y
            if prev_cubic_ctrl:
                x1, y1 = 2 * cur[0] - prev_cubic_ctrl[0], 2 * cur[1] - prev_cubic_ctrl[1]
            else:
                x1, y1 = cur
            for p in sample_cubic(cur, (x1, y1), (x2, y2), (x, y)):
                flush_point(p)
            prev_cubic_ctrl = (x2, y2)
            cur = (x, y)
            continue

        if C == "A":
            rx, ry, rot = read_num(), read_num(), read_num()
            large_arc, sweep = int(read_num()), int(read_num())
            x, y = read_num(), read_num()
            if is_rel:
                x, y = cur[0] + x, cur[1] + y
            for p in sample_arc(cur, rx, ry, rot, large_arc, sweep, (x, y)):
                flush_point(p)
            cur = (x, y)
            prev_cubic_ctrl = None
            continue

        raise ValueError("Unsupported path command %r" % cmd)

    if current:
        polylines.append(current)
    return polylines


# ---------------------------------------------------------------------------
# SVG traversal: find every path in a target line colour, resolving stroke
# color from the element itself, its class (style-tag lookup), or an
# ancestor <g>.
# ---------------------------------------------------------------------------

def strip_svg_namespaces(svg_text):
    text = re.sub(r'xmlns(:\w+)?="[^"]*"', "", svg_text)
    return text.replace("xlink:", "").replace("v:", "v-")


def build_class_stroke_map(svg_text):
    style_match = re.search(r"<style>.*?<!\[CDATA\[(.*?)\]\]>.*?</style>", svg_text, re.S)
    if not style_match:
        return {}
    css = style_match.group(1)
    mapping = {}
    for name, body in re.findall(r"\.(\S+?)\{([^}]*)\}", css):
        m = re.search(r"stroke\s*:\s*(#[0-9a-fA-F]+)", body)
        if m:
            mapping[name] = m.group(1).lower()
    return mapping


def extract_line_paths(svg_text):
    class_strokes = build_class_stroke_map(svg_text)
    root = ET.fromstring(strip_svg_namespaces(svg_text))

    def stroke_of(el, inherited):
        s = el.get("stroke")
        if s:
            return s.lower()
        for c in (el.get("class") or "").split():
            if c in class_strokes:
                return class_strokes[c]
        return inherited

    paths_by_line = {line: [] for line in LINE_COLOURS}

    def walk(el, inherited_stroke):
        stroke = stroke_of(el, inherited_stroke)
        tag = el.tag.split("}")[-1]
        if tag == "path" and stroke in COLOUR_TO_LINE:
            line = COLOUR_TO_LINE[stroke]
            d = el.get("d", "")
            if d:
                paths_by_line[line].extend(parse_path_to_polylines(d))
        for child in el:
            walk(child, stroke)

    walk(root, None)
    return paths_by_line


# ---------------------------------------------------------------------------
# Calibration: fit SVG-space -> lat/lng via ICP against hand-clicked stations.
# ---------------------------------------------------------------------------

def load_reference_stations():
    """Dedupes by stationId across all per-line files (interchanges repeat).
    Returns {stationId: {"name": str, "lat": float, "lng": float}}."""
    stations = {}
    for path in sorted(glob.glob(STATIONS_GLOB)):
        for row in json.load(open(path)):
            stations[row["stationId"]] = {
                "name": row["station"],
                "lat": row["lat"],
                "lng": row["lang"],
            }
    return stations


def all_path_points(paths_by_line):
    pts = []
    for polylines in paths_by_line.values():
        for polyline in polylines:
            pts.extend(polyline)
    return pts


def nearest_point(target, points):
    best, best_d2 = None, None
    for p in points:
        d2 = (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2
        if best_d2 is None or d2 < best_d2:
            best, best_d2 = p, d2
    return best


def fit_axis_affine(svg_vals, latlng_vals):
    """1D least squares: latlng = a * svg + b."""
    n = len(svg_vals)
    mean_x = sum(svg_vals) / n
    mean_y = sum(latlng_vals) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(svg_vals, latlng_vals))
    den = sum((x - mean_x) ** 2 for x in svg_vals)
    a = num / den
    b = mean_y - a * mean_x
    return a, b


def calibrate_transform(stations, path_points):
    xs = [p[0] for p in path_points]
    ys = [p[1] for p in path_points]
    svg_min_x, svg_max_x = min(xs), max(xs)
    svg_min_y, svg_max_y = min(ys), max(ys)

    lats = [s[0] for s in stations]
    lngs = [s[1] for s in stations]
    lat_min, lat_max = min(lats), max(lats)
    lng_min, lng_max = min(lngs), max(lngs)

    # Initial guess: stretch SVG bbox onto station bbox. SVG y grows downward,
    # latitude grows northward, so y maps to lat with a flipped (negative) slope.
    a_lat = (lat_min - lat_max) / (svg_max_y - svg_min_y)
    b_lat = lat_max - a_lat * svg_min_y
    a_lng = (lng_max - lng_min) / (svg_max_x - svg_min_x)
    b_lng = lng_min - a_lng * svg_min_x

    def transform(x, y):
        return (a_lat * y + b_lat, a_lng * x + b_lng)

    for _ in range(ICP_ITERATIONS):
        transformed_points = [transform(x, y) for x, y in path_points]
        matched_svg_y, matched_lat = [], []
        matched_svg_x, matched_lng = [], []
        for lat, lng in stations:
            best_idx, best_d2 = None, None
            for i, (tlat, tlng) in enumerate(transformed_points):
                d2 = (tlat - lat) ** 2 + (tlng - lng) ** 2
                if best_d2 is None or d2 < best_d2:
                    best_idx, best_d2 = i, d2
            sx, sy = path_points[best_idx]
            matched_svg_y.append(sy)
            matched_lat.append(lat)
            matched_svg_x.append(sx)
            matched_lng.append(lng)

        a_lat, b_lat = fit_axis_affine(matched_svg_y, matched_lat)
        a_lng, b_lng = fit_axis_affine(matched_svg_x, matched_lng)

    return transform


def haversine_metres(p1, p2):
    lat1, lng1 = p1
    lat2, lng2 = p2
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def report_fit(stations, transformed_points):
    """Also returns each station's snapped point + distance, for the debug overlay."""
    snapped = {}
    distances = []
    for station_id, station in stations.items():
        target = (station["lat"], station["lng"])
        nearest = nearest_point(target, transformed_points)
        d = haversine_metres(target, nearest)
        distances.append(d)
        snapped[station_id] = {"name": station["name"], "snapped": list(nearest), "distanceMetres": round(d, 1)}

    sorted_d = sorted(distances)
    n = len(sorted_d)
    mean = sum(sorted_d) / n
    print(f"Fit report over {n} stations: mean={mean:.1f}m median={sorted_d[n // 2]:.1f}m max={sorted_d[-1]:.1f}m")
    outliers = [d for d in sorted_d if d > OUTLIER_REPORT_METRES]
    if outliers:
        print(f"  {len(outliers)} stations further than {OUTLIER_REPORT_METRES}m from any extracted line "
              f"(mis-clicked station or a genuine gap in the drawn geometry) - worst: {outliers[-1]:.1f}m")
    return snapped


def main():
    svg_text = open(SVG_PATH, encoding="utf-8").read()
    paths_by_line = extract_line_paths(svg_text)

    for line, polylines in paths_by_line.items():
        total_points = sum(len(p) for p in polylines)
        print(f"{line:20} {len(polylines):3} subpaths, {total_points:5} points")

    stations = load_reference_stations()
    station_latlngs = [(s["lat"], s["lng"]) for s in stations.values()]
    path_points = all_path_points(paths_by_line)
    print(f"\nCalibrating against {len(stations)} reference stations and {len(path_points)} extracted path points...")
    transform = calibrate_transform(station_latlngs, path_points)

    geometry = {
        line: [[list(transform(x, y)) for x, y in polyline] for polyline in polylines]
        for line, polylines in paths_by_line.items()
    }

    transformed_points = [transform(x, y) for x, y in path_points]
    snapped_stations = report_fit(stations, transformed_points)

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(geometry, f)
    print(f"\nWrote {OUT_PATH}")

    with open(DEBUG_STATIONS_OUT_PATH, "w") as f:
        json.dump(list(snapped_stations.values()), f)
    print(f"Wrote {DEBUG_STATIONS_OUT_PATH}")


if __name__ == "__main__":
    main()
