export const FETCH_TRAINS = "FETCH_TRAINS";
export const UPDATE_TRAIN_LOCATIONS = "UPDATE_TRAIN_LOCATIONS";

export const fetchTrains = () => async (dispatch) => {
  try {
    const response = await fetch(
      "http://127.0.0.1:5000/tfl/arrivals/elizabeth"
    );
    const data = await response.json();
    dispatch({ type: FETCH_TRAINS, payload: data });
  } catch (error) {
    console.error(error);
  }
};

export const updateTrainLocations = (trains) => ({
  type: UPDATE_TRAIN_LOCATIONS,
  payload: trains,
});
