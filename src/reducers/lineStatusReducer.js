import { FETCH_LINE_STATUS } from "../actions/lineStatusActions";

const initialState = {};

const lineStatusReducer = (state = initialState, action) => {
  switch (action.type) {
    case FETCH_LINE_STATUS:
      return action.payload;
    default:
      return state;
  }
};

export default lineStatusReducer;
