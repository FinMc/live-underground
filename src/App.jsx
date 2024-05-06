import { Provider, useDispatch } from "react-redux";
import "./App.css";
import { UndergroundMap } from "./UndergroundMap";
import store from "./store/store";

const App = () => {
  return (
    <div className="App">
      <Provider store={store}>
        <UndergroundMap />
      </Provider>
    </div>
  );
};

export default App;
