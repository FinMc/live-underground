import { FETCH_TRAINS, UPDATE_TRAIN_LOCATIONS } from "../actions/trainActions";
import {
  snapToLine,
  routeBetween,
  pointAtFraction,
  MAX_PLAUSIBLE_SNAP_METRES,
} from "../lineGeometry";

const initialState = [];

const trainReducer = (state = initialState, action) => {
  switch (action.type) {
    case FETCH_TRAINS:
      return action.payload;
    case UPDATE_TRAIN_LOCATIONS:
      return Object.keys(state).map((trainKey) => {
        const train = state[trainKey];
        return {
          ...train,
          currentLocation: updateLocation(train),
          currentTime: train.currentTime + 1,
        };
      });
    default:
      return state;
  }
};

export default trainReducer;

function straightLineLerp(train, nextStation) {
  const timeBetweenStations = nextStation.timeToStation - train.currentTime;
  const xDistance =
    (nextStation.lat - train.currentLocation[0]) / timeBetweenStations;
  const yDistance =
    (nextStation.lang - train.currentLocation[1]) / timeBetweenStations;
  return [
    train.currentLocation[0] + xDistance,
    train.currentLocation[1] + yDistance,
  ];
}

function updateLocation(train) {
  const nextStation = train.points.find(
    (station) => station.timeToStation > train.currentTime
  );
  if (!nextStation) return train.currentLocation;

  // Before a train reaches its first reported stop there's no "previous"
  // station to route from - currentLocation is already anchored there
  // (see arrivals.py), so just hold position same as before.
  const prevStation = [...train.points]
    .reverse()
    .find((station) => station.timeToStation <= train.currentTime);
  if (!prevStation) return train.currentLocation;

  const snapPrev = snapToLine(train.line, prevStation.naptanId, [
    prevStation.lat,
    prevStation.lang,
  ]);
  const snapNext = snapToLine(train.line, nextStation.naptanId, [
    nextStation.lat,
    nextStation.lang,
  ]);

  const snapsUsable =
    snapPrev &&
    snapNext &&
    snapPrev.distanceMetres <= MAX_PLAUSIBLE_SNAP_METRES &&
    snapNext.distanceMetres <= MAX_PLAUSIBLE_SNAP_METRES;

  const route = snapsUsable
    ? routeBetween(
        train.line,
        prevStation.naptanId,
        snapPrev,
        nextStation.naptanId,
        snapNext
      )
    : null;

  if (route) {
    const fraction =
      (train.currentTime - prevStation.timeToStation) /
      (nextStation.timeToStation - prevStation.timeToStation);
    const point = pointAtFraction(route, fraction);
    if (point) return point;
  }

  // No usable drawn geometry for this hop (bad snap or disconnected graph) -
  // fall back to the original straight-line interpolation so the train
  // still moves sensibly instead of getting stuck or jumping.
  return straightLineLerp(train, nextStation);
}
