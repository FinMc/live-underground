import React, { useRef } from "react";
import "leaflet/dist/leaflet.css";
import {
  ImageOverlay,
  MapContainer,
  useMapEvents,
  Circle,
} from "react-leaflet";
const bounds = [
  [50, -1],
  [51, 1],
];
export const UndergroundMap = () => {
  const mapRef = useRef(null);
  const onReady = (e) => {
    mapRef.current = e.target;
    e.target.fitBounds(bounds);
  };

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
      <Circle
        center={[50.5, 0]}
        radius={500}
        pathOptions={{ color: "red", fillOpacity: 100 }}
      />
      <ImageOverlay url="/status-map.svg" bounds={bounds} zIndex={-1} />
      <Locator />
    </MapContainer>
  );
};

const Locator = () => {
  const map = useMapEvents({
    click: () => {
      console.log(map.locate());
    },
  });
};
