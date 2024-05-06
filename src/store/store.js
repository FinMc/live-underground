import { configureStore } from "@reduxjs/toolkit";
import trainReducer from "../reducers/trainReducer"; // Assuming your reducer is in reducers/trainReducer.js

const store = configureStore({
  reducer: {
    trains: trainReducer, // Add your reducer(s) here
  },
});

export default store;
