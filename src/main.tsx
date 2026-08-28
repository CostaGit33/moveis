import React from "react";
import { createRoot } from "react-dom/client";
import Home from "../Home";
import "../index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento #root não encontrado.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);
