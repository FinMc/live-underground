import React, { useContext, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  ImageOverlay,
  MapContainer,
  useMapEvents,
  Circle,
  Tooltip,
} from "react-leaflet";
import { TrainContext } from "./TrainContext";
const bounds = [
  [50, -1],
  [51, 1],
];

const calculateTrainLocation = (
  lastStationCoords,
  nextStationCoords,
  nextStationEstimatedArrivalTime,
  departureTimeAtLastStation
) => {
  const currentTime = new Date();

  // Calculate the time difference between the current time and the departure time at the last station
  const timeDifferenceFromLastDeparture =
    currentTime - departureTimeAtLastStation;

  // Calculate the total journey time from the last station to the next station
  const totalJourneyDuration =
    nextStationEstimatedArrivalTime - departureTimeAtLastStation;

  // Calculate the progress ratio based on the time difference
  const progressRatio = timeDifferenceFromLastDeparture / totalJourneyDuration;

  // Calculate the distance between the last station and the next station
  const distance = Math.sqrt(
    Math.pow(nextStationCoords[0] - lastStationCoords[0], 2) +
      Math.pow(nextStationCoords[1] - lastStationCoords[1], 2)
  );

  // Estimate the distance the train has traveled
  const distanceTraveled = distance * progressRatio;

  // Estimate the train's current location
  const xDistance =
    (nextStationCoords[0] - lastStationCoords[0]) * progressRatio;
  const yDistance =
    (nextStationCoords[1] - lastStationCoords[1]) * progressRatio;
  const trainLocation = [
    lastStationCoords[0] + xDistance,
    lastStationCoords[1] + yDistance,
  ];
  console.log(trainLocation);
  return trainLocation;
};
const farringdon = [50.56732028807225, 0.07364273071289062];
const liverpoolStreet = [50.56710221885822, 0.18007278442382815];
const arrivalFarringdon = new Date();
arrivalFarringdon.setSeconds(arrivalFarringdon.getSeconds() - 30);
const arrivalLiverpoolStreet = new Date();
arrivalLiverpoolStreet.setSeconds(arrivalLiverpoolStreet.getSeconds() + 100);

export const UndergroundMap = () => {
  const mapRef = useRef(null);
  const { trains } = useContext(TrainContext);
  const onReady = (e) => {
    mapRef.current = e.target;
    e.target.fitBounds(bounds);
  };

  const [trainCoords, setTrainCoords] = useState(farringdon);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTrainCoords(
        calculateTrainLocation(
          farringdon,
          liverpoolStreet,
          arrivalLiverpoolStreet,
          arrivalFarringdon
        )
      );
    }, 1000);

    // Clean up the interval when the component unmounts
    return () => clearInterval(intervalId);
  }, []);

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
        const currTrain = trains[trainKey][0];
        return (
          currTrain.lat && (
            <>
              <Circle
                key={trainKey}
                center={[trains[trainKey][0].lat, trains[trainKey][0].lang]}
                radius={500}
                pathOptions={{ color: "yellow", fillOpacity: 100 }}
              />
            </>
          )
        );
      })}
      <Circle
        id="202405057179368"
        center={trainCoords}
        radius={500}
        pathOptions={{ color: "yellow", fillOpacity: 100 }}
      />
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
