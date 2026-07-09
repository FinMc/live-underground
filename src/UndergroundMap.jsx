import React, { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  ImageOverlay,
  MapContainer,
  useMapEvents,
  Circle,
  CircleMarker,
  Polyline,
  Tooltip,
} from "react-leaflet";
import { useDispatch, useSelector } from "react-redux";
import { fetchTrains, updateTrainLocations } from "./actions/trainActions";
import { fetchLineStatus } from "./actions/lineStatusActions";
const bounds = [
  [50, -1],
  [51, 1],
];

const LINE_STATUS_POLL_MS = 60000;

const colours = {
  bakerloo: "#b06010",
  circle: "#fbd200",
  central: "#e64e20",
  elizabeth: "#796d9e",
  district: "#4a8740",
  dlr: "#5bb3b0",
  hammersmith_city: "#e984a1",
  jubilee: "#949ca1",
  metropolitan: "#9a3e5e",
  northern: "#000000",
  piccadilly: "#1c3f94",
  victoria: "#419edc",
};

const lineColour = (lineId) => colours[lineId.replace("-", "_")];

// TfL sometimes returns destination names in ALL CAPS ("ALL SAINTS") and
// sometimes in normal case ("Ealing Broadway") - normalise for display.
const formatStationName = (name) => {
  if (!name) return null;
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};

const getNextStation = (train) =>
  train.points.find((station) => station.timeToStation > train.currentTime);

const severityColour = (statusSeverity) => {
  if (statusSeverity >= 10) return "#2e8540";
  if (statusSeverity >= 9) return "#c9822c";
  return "#d4351c";
};

const LineStatusPanel = ({ lineStatus }) => {
  const disrupted = Object.entries(lineStatus).filter(
    ([, status]) => status.statusSeverity < 10
  );

  return (
    <div className="line-status-panel">
      {disrupted.length === 0 ? (
        <div className="line-status-row line-status-good">
          All lines: Good Service
        </div>
      ) : (
        disrupted.map(([lineId, status]) => (
          <div
            key={lineId}
            className="line-status-row"
            title={status.reason ? status.reason.trim() : status.statusSeverityDescription}
          >
            <span
              className="line-status-dot"
              style={{ backgroundColor: lineColour(lineId) }}
            />
            <span className="line-status-name">{status.name}</span>
            <span
              className="line-status-desc"
              style={{ color: severityColour(status.statusSeverity) }}
            >
              {status.statusSeverityDescription}
            </span>
          </div>
        ))
      )}
    </div>
  );
};

const TrainTooltip = ({ train, lineStatus }) => {
  const status = lineStatus[train.line];
  const nextStation = getNextStation(train);
  const eta = nextStation
    ? Math.max(0, nextStation.timeToStation - train.currentTime)
    : null;

  return (
    <Tooltip>
      <div className="train-tooltip">
        <div className="train-tooltip-line">
          {status?.name || train.line}
          {status && status.statusSeverity < 10
            ? ` — ${status.statusSeverityDescription}`
            : ""}
        </div>
        <div>To {formatStationName(train.destinationName) || "Unknown"}</div>
        {nextStation && (
          <div>
            Next: {nextStation.stationName} ({eta}s)
          </div>
        )}
      </div>
    </Tooltip>
  );
};

// Renders the SVG-extracted line geometry (see scripts/extract_line_geometry.py)
// on top of the map so it can be visually checked against the drawn lines
// before it's used to drive train movement. Enable with ?debug=paths.
const DebugPathsOverlay = () => {
  const [geometry, setGeometry] = useState(null);
  const [stations, setStations] = useState(null);

  useEffect(() => {
    import("./line-geometry.json").then((m) => setGeometry(m.default));
    import("./line-geometry-debug-stations.json").then((m) => setStations(m.default));
  }, []);

  if (!geometry) return null;

  return (
    <>
      {Object.entries(geometry).map(([lineId, polylines]) =>
        polylines.map((polyline, i) => (
          <React.Fragment key={`${lineId}-${i}`}>
            <Polyline
              positions={polyline}
              pathOptions={{ color: "#fff", weight: 6, opacity: 0.9 }}
            />
            <Polyline
              positions={polyline}
              pathOptions={{ color: lineColour(lineId), weight: 3, opacity: 1 }}
            />
          </React.Fragment>
        ))
      )}
      {stations &&
        stations.map((station, i) => (
          <CircleMarker
            key={i}
            center={station.snapped}
            radius={3}
            pathOptions={{
              color: "#000",
              weight: 1,
              fillColor: station.distanceMetres > 150 ? "#ff00ff" : "#fff",
              fillOpacity: 1,
            }}
          >
            <Tooltip>
              {station.name} ({station.distanceMetres}m)
            </Tooltip>
          </CircleMarker>
        ))}
    </>
  );
};

export const UndergroundMap = () => {
  const debugPaths =
    new URLSearchParams(window.location.search).get("debug") === "paths";
  const mapRef = useRef(null);
  const dispatch = useDispatch();
  const trains = useSelector((state) => state.trains);
  const lineStatus = useSelector((state) => state.lineStatus);
  const onReady = (e) => {
    mapRef.current = e.target;
    e.target.fitBounds(bounds);
  };

  useEffect(() => {
    const intervalId = setInterval(() => {
      dispatch(updateTrainLocations(trains));
    }, 1000); // Update every second

    return () => clearInterval(intervalId);
  }, [dispatch, trains]);

  useEffect(() => {
    dispatch(fetchTrains());
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchLineStatus());
    // Unlike train positions (predicted once from a route plan), line status
    // is genuinely live and worth keeping fresh over a long session.
    const statusIntervalId = setInterval(() => {
      dispatch(fetchLineStatus());
    }, LINE_STATUS_POLL_MS);

    return () => clearInterval(statusIntervalId);
  }, [dispatch]);

  return (
    <>
      <LineStatusPanel lineStatus={lineStatus} />
      <MapContainer
        bounds={bounds}
        boundsOptions={{
          padding: [0, 0],
        }}
        zoom={3}
        maxZoom={13}
        minZoom={10}
        maxBounds={bounds}
        scrollWheelZoom={true}
        zoomSnap={0}
        style={{ height: "100%", minHeight: "100%" }}
        whenReady={onReady}
      >
        {Object.keys(trains).map((trainKey) => {
          const currTrain = trains[trainKey];
          return (
            currTrain.currentLocation[0] && (
              <Circle
                key={trainKey}
                center={currTrain.currentLocation}
                radius={500}
                pathOptions={{
                  color: "black",
                  fillOpacity: 0.6,
                  stroke: true,
                  fillColor: lineColour(currTrain.line),
                }}
              >
                <TrainTooltip train={currTrain} lineStatus={lineStatus} />
              </Circle>
            )
          );
        })}
        <ImageOverlay url="/new-map.svg" bounds={bounds} zIndex={-1} />
        {debugPaths && <DebugPathsOverlay />}
        <Locator />
      </MapContainer>
    </>
  );
};

const Locator = () => {
  useMapEvents({
    click: (e) => {
      console.log(e.latlng);
      navigator.clipboard.writeText(JSON.stringify(e.latlng));
    },
  });
};
