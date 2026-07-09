import { configureStore } from "@reduxjs/toolkit";
import trainReducer from "../reducers/trainReducer";
import lineStatusReducer from "../reducers/lineStatusReducer";

const store = configureStore({
  reducer: {
    trains: trainReducer,
    lineStatus: lineStatusReducer,
  },
});

export default store;
