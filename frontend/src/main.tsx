import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { BackendStatusGate } from "./components/BackendStatusGate";
import "./index.css";

    createRoot(document.getElementById("root")!).render(<StrictMode><BackendStatusGate><App /></BackendStatusGate></StrictMode>);