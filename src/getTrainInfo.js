export const getAllLineInfo = async () => {
  const url =
    "https://api.tfl.gov.uk/Line/Mode/tube,overground,dlr,elizabeth-line/status";
  const response = await fetch(url);
  const data = await response.json();
  return data;
};

// https://api.tfl.gov.uk/line/elizabeth/stoppoints
export const getStationsForLine = async (lineId) => {
  const url = `https://api.tfl.gov.uk/line/${lineId}/stoppoints`;
  const response = await fetch(url);
  const data = await response.json();
  return data.stations;
};

// https://api.tfl.gov.uk/StopPoint/910GCANWHRF/Arrivals
// https://api.tfl.gov.uk/Line/elizabeth/Arrivals
export const getStopPointArrivals = async (stopPointId) => {
  const url = `https://api.tfl.gov.uk/StopPoint/${stopPointId}/Arrivals`;
  const response = await fetch(url);
  const data = await response.json();
  return data;
};
