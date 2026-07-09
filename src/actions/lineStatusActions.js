export const FETCH_LINE_STATUS = "FETCH_LINE_STATUS";

export const fetchLineStatus = () => async (dispatch) => {
  try {
    const response = await fetch("/tfl/line-status");
    const data = await response.json();
    dispatch({ type: FETCH_LINE_STATUS, payload: data });
  } catch (error) {
    console.error(error);
  }
};
