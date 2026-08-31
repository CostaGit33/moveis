import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import Home from "../Home";
import "../index.css";

const PRODUCTION_WEBHOOK = "https://webhook.novaagencian8n.online/webhook/criar-cena-v2";
const HERO_SOURCE = "/manus-storage/moveis-planejados-hero_39ac0328.jpg";
const HERO_FALLBACK = "/IMG-20260824-WA0028.jpg";

type GeneratedImage = {
  src: string;
  mimeType: string;
  size?: string;
};

let generatedImage: GeneratedImage | null = null;

function normalizeGeneratedImage(payload: unknown): GeneratedImage | null {
  if (!payload || typeof payload !== "object") return null;

  const root = payload as Record<string, unknown>;
  const image = root.imagem && typeof root.imagem === "object"
    ? root.imagem as Record<string, unknown>
    : null;

  if (!image) return null;

  const mimeType = typeof image.mimeType === "string" && image.mimeType.startsWith("image/")
    ? image.mimeType
    : "image/png";

  if (typeof image.url === "string" && image.url.trim()) {
    return {
      src: image.url.trim(),
      mimeType,
      size: typeof root.metadata === "object" && root.metadata && typeof (root.metadata as Record<string, unknown>).tamanho_saida === "string"
        ? (root.metadata as Record<string, unknown>).tamanho_saida as string
        : undefined,
    };
  }

  if (typeof image.base64 === "string" && image.base64.trim()) {
    const raw = image.base64.trim();
    const src = raw.startsWith("data:image/")
      ? raw
      : `data:${mimeType};base64,${raw}`;

    return {
      src,
      mimeType,
      size: typeof root.metadata === "object" && root.metadata && typeof (root.metadata as Record<string, unknown>).tamanho_saida === "string"
        ? (root.metadata as Record<string, unknown>).tamanho_saida as string
        : undefined,
    };
  }

  return null;
}

function ensureGeneratedImageStyles() {
  if (document.getElementById("generated-image-styles")) return;

  const style = document.createElement("style");
  style.id = "generated-image-styles";
  style.textContent = `
    .generated-image-result {
      margin: 28px 0 32px;
      padding: 20px;
      border: 1px solid rgba(45, 39, 31, .12);
      border-radius: 20px;
      background: #fff;
      box-shadow: 0 12px 36px rgba(45, 39, 31, .08);
    }
    .generated-image-result__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
    }
    .generated-image-result__eyebrow {
      margin: 0 0 4px;
      font-size: 11px;
      letter-spacing: .14em;
      text-transform: uppercase;
      opacity: .58;
    }
    .generated-image-result__title {
      margin: 0;
      font-size: 20px;
      line-height: 1.15;
    }
    .generated-image-result__badge {
      flex: 0 0 auto;
      padding: 7px 10px;
      border-radius: 999px;
      background: rgba(45, 39, 31, .06);
      font-size: 11px;
      white-space: nowrap;
    }
    .generated-image-result__frame {
      overflow: hidden;
      border-radius: 14px;
      background: #f3f0eb;
      line-height: 0;
    }
    .generated-image-result__image {
      display: block;
      width: 100%;
      height: auto;
      max-height: 760px;
      object-fit: contain;
      margin: 0 auto;
    }
    .generated-image-result__note {
      margin: 12px 2px 0;
      font-size: 12px;
      line-height: 1.5;
      opacity: .58;
    }
    @media (max-width: 640px) {
      .generated-image-result { padding: 14px; margin: 20px 0 24px; }
      .generated-image-result__header { align-items: flex-start; }
      .generated-image-result__title { font-size: 17px; }
      .generated-image-result__badge { font-size: 10px; }
    }
  `;
  document.head.appendChild(style);
}

function renderGeneratedImage() {
  if (!generatedImage) return;

  const resultContent = document.querySelector<HTMLElement>("#result .result-content");
  if (!resultContent) return;

  ensureGeneratedImageStyles();

  let card = document.getElementById("generated-image-result") as HTMLElement | null;

  if (!card) {
    card = document.createElement("section");
    card.id = "generated-image-result";
    card.className = "generated-image-result";
    card.innerHTML = `
      <div class="generated-image-result__header">
        <div>
          <p class="generated-image-result__eyebrow">Resultado visual</p>
          <h3 class="generated-image-result__title">Imagem gerada a partir do rascunho</h3>
        </div>
        <span class="generated-image-result__badge"></span>
      </div>
      <div class="generated-image-result__frame">
        <img class="generated-image-result__image" alt="Imagem final gerada a partir do rascunho do móvel planejado" />
      </div>
      <p class="generated-image-result__note">A imagem acima foi retornada pelo workflow criar-cena-v2 e usa o rascunho enviado como referência visual.</p>
    `;

    const overview = resultContent.querySelector(".scene-overview");
    resultContent.insertBefore(card, overview || resultContent.firstChild);
  }

  const image = card.querySelector<HTMLImageElement>(".generated-image-result__image");
  const badge = card.querySelector<HTMLElement>(".generated-image-result__badge");

  if (image && image.src !== generatedImage.src) {
    image.src = generatedImage.src;
  }

  if (badge) {
    badge.textContent = generatedImage.size || generatedImage.mimeType.toUpperCase();
  }
}

function installWebhookImageBridge() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    try {
      const requestUrl = typeof args[0] === "string"
        ? args[0]
        : args[0] instanceof Request
          ? args[0].url
          : args[0]?.url || "";

      if (requestUrl.includes("/webhook/criar-cena-v2")) {
        const cloned = response.clone();
        cloned.json().then((payload) => {
          const image = normalizeGeneratedImage(payload);
          if (image) {
            generatedImage = image;
            renderGeneratedImage();
          }
        }).catch(() => {
          // O Home.tsx continua responsável pelo tratamento normal da resposta.
        });
      }
    } catch {
      // Não interfere no fluxo principal caso a captura da resposta falhe.
    }

    return response;
  };
}

function App() {
  useEffect(() => {
    const fixAssets = () => {
      document.querySelectorAll<HTMLImageElement>(`img[src="${HERO_SOURCE}"]`).forEach((img) => {
        img.src = HERO_FALLBACK;
      });

      renderGeneratedImage();
    };

    installWebhookImageBridge();
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
