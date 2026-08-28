import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import Home from "../Home";
import "../index.css";

const PRODUCTION_WEBHOOK = "https://webhook.novaagencian8n.online/webhook/criar-cena-v2";
const HERO_SOURCE = "/manus-storage/moveis-planejados-hero_39ac0328.jpg";
const HERO_FALLBACK = "/IMG-20260824-WA0028.jpg";

function App() {
  useEffect(() => {
    const fixAssets = () => {
      document.querySelectorAll<HTMLImageElement>(`img[src="${HERO_SOURCE}"]`).forEach((img) => {
        img.src = HERO_FALLBACK;
      });
    };

    fixAssets();
    const observer = new MutationObserver(fixAssets);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    return () => observer.disconnect();
  }, []);

  return <Home />;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Elemento #root não encontrado.");

if (!localStorage.getItem("moveis-planejados-webhook")) {
  localStorage.setItem("moveis-planejados-webhook", PRODUCTION_WEBHOOK);
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
