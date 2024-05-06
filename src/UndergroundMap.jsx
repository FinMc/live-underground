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
      // maxBounds={bounds}
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
                fillOpacity: 60,
                stroke: true,
                fillColor: "#796D9E",
              }}
            />
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
    },
  });
};
