import "./App.css";
import { TrainProvider } from "./TrainContext";
import { UndergroundMap } from "./UndergroundMap";

const App = () => {
  return (
    <div className="App">
      <TrainProvider>
        <UndergroundMap />
      </TrainProvider>
    </div>
  );
};

export default App;
