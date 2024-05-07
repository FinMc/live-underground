import React, { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import {
  ImageOverlay,
  MapContainer,
  useMapEvents,
  Circle,
  Tooltip,
} from "react-leaflet";
import { useDispatch, useSelector } from "react-redux";
import { fetchTrains, updateTrainLocations } from "./actions/trainActions";
const bounds = [
  [50, -1],
  [51, 1],
];

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

const getTrainNextStation = (train) => {
  const nextStation = train.points.find(
    (station) => station.timeToStation > train.currentTime
  );
  return nextStation?.stationName;
};
export const UndergroundMap = () => {
  const mapRef = useRef(null);
  const dispatch = useDispatch();
  const trains = useSelector((state) => state.trains);
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

  return (
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
                fillColor: colours[currTrain.line.replace("-", "_")],
              }}
            >
              <Tooltip>{`Train-${trainKey} to ${getTrainNextStation(
                currTrain
              )}`}</Tooltip>
            </Circle>
          )
        );
      })}
      <ImageOverlay url="/status-map.svg" bounds={bounds} zIndex={-1} />
      <Locator />
    </MapContainer>
  );
};

const Locator = () => {
  const map = useMapEvents({
    click: (e) => {
      console.log(e.latlng);
      navigator.clipboard.writeText(JSON.stringify(e.latlng));
    },
  });
};
