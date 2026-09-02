import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import Home from "../Home";
import "./styles-futuristic.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Elemento #root não encontrado.");

createRoot(rootElement).render(
  <React.StrictMode>
    <Home />
    <Toaster position="bottom-right" richColors theme="dark" />
  </React.StrictMode>,
);
