import React, { createContext, useState, useEffect } from "react";

export const TrainContext = createContext();

export const TrainProvider = ({ children }) => {
  const [trains, setTrains] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(
        "http://127.0.0.1:5000/tfl/arrivals/elizabeth"
      );
      const data = await response.json();
      setTrains(data);
    };

    fetchData();
  }, []);
  return (
    trains && (
      <TrainContext.Provider value={{ trains }}>
        {children}
      </TrainContext.Provider>
    )
  );
};
