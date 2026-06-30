import { createRoot } from "react-dom/client";
import "./lib/api";
import { disableIosPageZoom } from "./lib/disableIosZoom";
import App from "./App";
import "./index.css";

disableIosPageZoom();

createRoot(document.getElementById("root")!).render(<App />);
