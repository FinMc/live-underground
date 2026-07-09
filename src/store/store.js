import { configureStore } from "@reduxjs/toolkit";
import trainReducer from "../reducers/trainReducer";
import lineStatusReducer from "../reducers/lineStatusReducer";

const store = configureStore({
  reducer: {
    trains: trainReducer,
    lineStatus: lineStatusReducer,
  },
});

if (typeof window !== "undefined") window.__store = store;

export default store;
