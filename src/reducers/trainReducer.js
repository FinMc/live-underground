import { FETCH_TRAINS, UPDATE_TRAIN_LOCATIONS } from "../actions/trainActions";

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

function updateLocation(train) {
  const nextStation = train.points.find(
    (station) => station.timeToStation > train.currentTime
  );
  // debugger;
  if (nextStation) {
    const timeBetweenStations = nextStation.timeToStation - train.currentTime;
    const xDistance =
      (nextStation.lat - train.currentLocation[0]) / timeBetweenStations;
    const yDistance =
      (nextStation.lang - train.currentLocation[1]) / timeBetweenStations;
    return [
      train.currentLocation[0] + xDistance,
      train.currentLocation[1] + yDistance,
    ];
  } else {
    return train.currentLocation;
  }
}
