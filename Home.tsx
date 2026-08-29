import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Clipboard, Download, FileImage, History, ImagePlus, LoaderCircle, LockKeyhole, ScanSearch, Send, Settings2, Sparkles, WandSparkles, X } from "lucide-react";
import { toast } from "sonner";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const DEFAULT_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || "https://webhook.novaagencian8n.online/webhook/criar-cena-v2";
const HISTORY_KEY = "moveis-planejados-history";
type WorkflowPhase = "idle" | "uploading" | "analyzing" | "structuring" | "success" | "error";
type JsonObject = Record<string, unknown>;
type HistoryItem = { id: string; createdAt: string; fileName: string; brief: string; scene: JsonObject; raw: unknown };

function isObject(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
function displayText(value: unknown, fallback = "Não informado"): string {
  if (typeof value === "string") return value || fallback;
  if (Array.isArray(value)) return value.length ? value.map((item) => displayText(item)).join(", ") : fallback;
  if (isObject(value)) { const entries = Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ""); return entries.length ? entries.map(([key, item]) => `${key.replaceAll("_", " ")}: ${displayText(item)}`).join(" · ") : fallback; }
  if (value === null || value === undefined) return fallback;
  return String(value);
}
function getScene(payload: unknown): JsonObject | null {
  if (!isObject(payload)) return null;
  if (isObject(payload.cena)) return payload.cena;
  if (isObject(payload.data) && isObject(payload.data.cena)) return payload.data.cena;
  if (isObject(payload.output)) return getScene(payload.output) || payload.output;
  return payload;
}
function getErrorMessage(error: unknown) { return error instanceof Error ? error.message : "Não foi possível concluir a análise."; }
function SceneCard({ label, value, icon }: { label: string; value: unknown; icon: ReactNode }) { return <article className="scene-card"><div className="scene-card-icon">{icon}</div><div><span className="field-label">{label}</span><p>{displayText(value)}</p></div></article>; }
function SceneList({ label, value }: { label: string; value: unknown }) { const items = Array.isArray(value) ? value : []; return <div className="scene-list-block"><span className="field-label">{label}</span>{items.length ? <ul>{items.map((item, index) => <li key={`${label}-${index}`}>{displayText(item)}</li>)}</ul> : <p className="muted-copy">Nenhum item identificado.</p>}</div>; }

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [brief, setBrief] = useState("");
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem("moveis-planejados-webhook") || DEFAULT_WEBHOOK_URL);
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<WorkflowPhase>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftJson, setDraftJson] = useState("");
  const [editError, setEditError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const saved = localStorage.getItem(HISTORY_KEY); if (saved) { try { setHistory(JSON.parse(saved)); } catch { localStorage.removeItem(HISTORY_KEY); } } }, []);
  useEffect(() => { if (!file) { setPreviewUrl(""); return; } const url = URL.createObjectURL(file); setPreviewUrl(url); return () => URL.revokeObjectURL(url); }, [file]);

  const scene = useMemo(() => getScene(result), [result]);
  const isLoading = phase === "uploading" || phase === "analyzing" || phase === "structuring";
  const connectionReady = Boolean(webhookUrl.trim());
  const phaseLabel = { idle: "Pronto para analisar", uploading: "Enviando rascunho", analyzing: "Interpretando desenho", structuring: "Organizando cena", success: "Análise concluída", error: "Falha na conexão" }[phase];

  function saveWebhook(value: string) { setWebhookUrl(value); localStorage.setItem("moveis-planejados-webhook", value); }
  function handleFile(event: ChangeEvent<HTMLInputElement>) { const selected = event.target.files?.[0]; if (!selected) return; if (!selected.type.startsWith("image/")) { toast.error("Escolha uma imagem PNG, JPG ou WEBP."); event.target.value = ""; return; } if (selected.size > MAX_FILE_SIZE) { toast.error("A imagem precisa ter no máximo 10 MB."); event.target.value = ""; return; } setFile(selected); setResult(null); setError(""); setPhase("idle"); }
  function removeFile() { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
  function persistHistory(item: HistoryItem) { const next = [item, ...history.filter((entry) => entry.id !== item.id)].slice(0, 12); setHistory(next); localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); }

  async function submitWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!file) { toast.error("Adicione o rascunho do ambiente antes de continuar."); return; }
    const endpoint = webhookUrl.trim();
    if (!endpoint) { setError("Configure a URL do webhook n8n para conectar o site ao fluxo."); toast.error("A URL do webhook ainda não foi configurada."); document.getElementById("connection")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const formData = new FormData(); formData.append("data", file, file.name); if (brief.trim()) formData.append("pedido", brief.trim());
    setResult(null); setPhase("uploading");
    try {
      const headers: HeadersInit = {}; if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
      const response = await fetch(endpoint, { method: "POST", body: formData, headers });
      setPhase("analyzing"); const responseText = await response.text(); let payload: unknown = responseText;
      try { payload = responseText ? JSON.parse(responseText) : null; } catch { payload = responseText; }
      if (!response.ok) { const serverMessage = isObject(payload) && typeof payload.message === "string" ? payload.message : `O webhook respondeu com HTTP ${response.status}.`; throw new Error(serverMessage); }
      if (payload === null || payload === "" || (typeof payload === "object" && Object.keys(payload as object).length === 0)) {
        throw new Error("O webhook aceitou a imagem, mas não devolveu a estrutura da cena. Verifique se o nó 'Responder API' está conectado ao final do fluxo e se o campo Response Body está configurado como {{$json}}.");
      }
      setPhase("structuring"); setResult(payload); setPhase("success");
      const returnedScene = getScene(payload); if (returnedScene) persistHistory({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), fileName: file.name, brief, scene: returnedScene, raw: payload });
      toast.success("Estrutura de cena recebida e salva no histórico."); window.setTimeout(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (requestError) { const message = getErrorMessage(requestError); const friendlyMessage = message.includes("Failed to fetch") ? "Não foi possível acessar o webhook. Verifique a URL, o CORS do n8n e se o workflow está ativo." : message; setError(friendlyMessage); setPhase("error"); toast.error("A análise não foi concluída. Veja o detalhe abaixo."); }
  }

  function startEditing() { if (!scene) return; setDraftJson(JSON.stringify(scene, null, 2)); setEditError(""); setEditing(true); }
  function saveEditedStructure() { try { const parsed = JSON.parse(draftJson); if (!isObject(parsed)) throw new Error("A estrutura precisa ser um objeto JSON."); setResult(parsed); setEditing(false); setEditError(""); if (scene) persistHistory({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), fileName: file?.name || "estrutura-editada", brief, scene: parsed, raw: parsed }); toast.success("Estrutura editada e salva no histórico."); } catch (editException) { setEditError(editException instanceof Error ? editException.message : "JSON inválido. Revise a estrutura e tente novamente."); } }
  function loadHistory(item: HistoryItem) { setResult(item.raw); setBrief(item.brief); setPhase("success"); setEditing(false); window.setTimeout(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }
  function clearHistory() { setHistory([]); localStorage.removeItem(HISTORY_KEY); toast.success("Histórico limpo neste dispositivo."); }
  async function copyResult() { if (!result) return; await navigator.clipboard.writeText(JSON.stringify(result, null, 2)); setCopied(true); toast.success("Resultado copiado."); window.setTimeout(() => setCopied(false), 1800); }
  function exportPdf() { if (!scene) return; toast("A janela de impressão será aberta. Escolha 'Salvar como PDF'."); window.setTimeout(() => window.print(), 180); }

  return <div className="site-shell">
    <header className="topbar page-width"><a className="brand-lockup" href="#top" aria-label="Móveis Planejados, início"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span className="brand-wordmark"><small>MP / ESTÚDIO DIGITAL</small><strong>Móveis <em>Planejados</em></strong></span></a><div className="topbar-actions"><div className={`connection-status ${connectionReady ? "ready" : ""}`}><span className="status-dot" />{connectionReady ? "Fluxo conectado" : "Aguardando conexão"}</div><a className="text-link" href="#connection">Configuração <Settings2 size={15} /></a></div></header>
    <main id="top">
      <section className="hero page-width"><div className="hero-copy"><p className="eyebrow"><span>01</span> Do rascunho ao projeto</p><h1>Dê forma à<br /><em>sua ideia.</em></h1><p className="hero-description">Envie o desenho do ambiente. Nossa inteligência interpreta a composição, os módulos e os detalhes para transformar intenção em estrutura.</p><a className="hero-cta" href="#workspace">Começar análise <ArrowUpRight size={18} /></a><div className="hero-metrics"><div><strong>01</strong><span>imagem<br />por vez</span></div><div><strong>AI</strong><span>leitura<br />estrutural</span></div><div><strong>JSON</strong><span>resultado<br />organizado</span></div></div></div><div className="hero-visual"><img src="/manus-storage/moveis-planejados-hero_39ac0328.jpg" alt="Cozinha planejada contemporânea em madeira e laca" /><div className="hero-visual-shade" /><div className="visual-caption"><span className="caption-line" /><span>Referência visual<br /><strong>Matéria · função · detalhe</strong></span></div><div className="visual-stamp"><Sparkles size={16} /><span>feito para<br />imaginar melhor</span></div></div></section>
      <section className="workspace page-width" id="workspace"><div className="section-intro"><div><p className="eyebrow"><span>02</span> Entrada do projeto</p><h2>Envie o seu<br /><em>rascunho.</em></h2></div><p className="section-note">Quanto mais claro o desenho, melhor a leitura espacial. Anotações, setas e referências são bem-vindas.</p></div><form className="studio-form" onSubmit={submitWorkflow}><div className="upload-column"><label className={`dropzone ${file ? "has-file" : ""}`} htmlFor="drawing-upload"><input ref={fileInputRef} id="drawing-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} />{file && previewUrl ? <><img className="upload-preview" src={previewUrl} alt="Pré-visualização do rascunho" /><span className="preview-overlay"><Check size={16} /> Imagem selecionada</span><button className="remove-file" type="button" onClick={(event) => { event.preventDefault(); removeFile(); }} aria-label="Remover imagem"><X size={17} /></button></> : <span className="dropzone-empty"><span className="upload-icon"><ImagePlus size={28} strokeWidth={1.35} /></span><strong>Solte o rascunho aqui</strong><span>ou clique para escolher uma imagem</span><small>PNG, JPG ou WEBP · até 10 MB</small></span>}</label><div className="upload-footer"><span><FileImage size={14} /> Campo enviado ao fluxo: <b>data</b></span><span>Imagem única</span></div></div>
        <div className="brief-column"><div className="field-group"><label htmlFor="brief">O que você gostaria de preservar?</label><textarea id="brief" value={brief} onChange={(event) => setBrief(event.target.value.slice(0, 500))} placeholder="Ex.: manter a janela à direita, preservar os três módulos e considerar a anotação de sapateira..." rows={5} /><div className="field-hint"><span>Opcional</span><span>{brief.length}/500</span></div></div><div className="connection-card" id="connection"><div className="card-heading"><div><span className="mini-icon"><LockKeyhole size={15} /></span><div><span className="field-label">Conexão do workflow</span><strong>Webhook n8n</strong></div></div><span className={`mini-status ${connectionReady ? "ready" : ""}`}><i />{connectionReady ? "Ativo" : "Configurar"}</span></div><div className="connection-fields"><div className="input-with-label"><label htmlFor="webhook-url">URL do webhook</label><input id="webhook-url" type="url" value={webhookUrl} onChange={(event) => saveWebhook(event.target.value)} placeholder="https://seu-n8n.com/webhook/criar-cena" /></div><div className="input-with-label"><label htmlFor="webhook-token">Token <span>opcional</span></label><input id="webhook-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Bearer token, se necessário" autoComplete="off" /></div></div><p className="connection-hint"><LockKeyhole size={13} /> O navegador envia <code>data</code> + <code>pedido</code> em multipart/form-data. Não defina Content-Type manualmente.</p></div><button className="submit-button" type="submit" disabled={isLoading || !file}>{isLoading ? <><LoaderCircle size={18} className="spin" /> {phaseLabel}...</> : <><WandSparkles size={18} /> Interpretar rascunho <Send size={16} /></>}</button>{!file && <p className="button-note">Adicione uma imagem para habilitar a análise.</p>}{error && <div className="error-message" role="alert"><X size={17} /><div><strong>Não foi possível enviar.</strong><span>{error}</span><small>Confira se o workflow está ativo, se a URL corresponde ao ambiente de produção e se o CORS permite chamadas deste domínio.</small></div></div>}</div></form></section>
      <section className="history-section page-width" id="history"><div className="history-heading"><div><p className="eyebrow"><span>04</span> Memória do estúdio</p><h2>Suas <em>análises.</em></h2></div>{history.length > 0 && <button className="ghost-button" type="button" onClick={clearHistory}>Limpar histórico <X size={14} /></button>}</div>{history.length ? <div className="history-grid">{history.map((item) => <button className="history-item" type="button" key={item.id} onClick={() => loadHistory(item)}><span className="history-date"><History size={13} /> {new Date(item.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span><strong>{displayText(item.scene.tipo_ambiente, "Ambiente analisado")}</strong><span>{item.fileName}</span><ArrowUpRight size={15} /></button>)}</div> : <div className="history-empty"><History size={19} /><span>O histórico das análises fica salvo somente neste navegador.</span></div>}</section>
      <section className="result-section page-width" id="result"><div className="result-header"><div><p className="eyebrow"><span>03</span> Saída do workflow</p><h2>Leitura da <em>cena.</em></h2></div><div className={`result-status ${phase === "success" ? "success" : phase === "error" ? "failure" : ""}`}><span className="status-dot" />{phaseLabel}</div></div>{scene ? <div className="result-content"><div className="result-toolbar"><div><span className="result-kicker"><Check size={13} /> Estrutura recebida</span><p>Revise os campos antes de salvar ou exportar o projeto.</p></div><div className="result-actions"><button className="copy-button" type="button" onClick={startEditing}><WandSparkles size={15} /> Editar estrutura</button><button className="copy-button" type="button" onClick={exportPdf}><Download size={15} /> Exportar PDF</button><button className="copy-button" type="button" onClick={copyResult}>{copied ? <Check size={15} /> : <Clipboard size={15} />} {copied ? "Copiado" : "Copiar JSON"}</button></div></div>{editing && <div className="editor-panel"><div><span className="field-label">Editor da estrutura</span><p>Edite o JSON retornado. Salvar atualiza a leitura e cria uma nova versão no histórico.</p></div><textarea className="json-editor" value={draftJson} onChange={(event) => setDraftJson(event.target.value)} spellCheck={false} />{editError && <p className="editor-error">{editError}</p>}<div className="editor-actions"><button className="ghost-button" type="button" onClick={() => setEditing(false)}>Cancelar</button><button className="submit-button small" type="button" onClick={saveEditedStructure}><Check size={15} /> Salvar edição</button></div></div>}<div className="scene-overview"><div className="scene-lead"><span className="field-label">Tipo de ambiente</span><h3>{displayText(scene.tipo_ambiente)}</h3><p>{displayText(scene.layout)}</p><div className="perspective-chip"><ScanSearch size={14} /> Perspectiva: {displayText(scene.perspectiva)}</div></div><div className="scene-cards"><SceneCard label="Módulo esquerdo" value={scene.modulo_esquerdo} icon={<span>←</span>} /><SceneCard label="Módulo central" value={scene.modulo_central} icon={<span>↕</span>} /><SceneCard label="Módulo direito" value={scene.modulo_direito} icon={<span>→</span>} /></div></div><div className="scene-details"><SceneList label="Elementos principais" value={scene.elementos_principais} /><SceneList label="Elementos superiores" value={scene.elementos_superiores} /><SceneList label="Aberturas" value={scene.aberturas} /><SceneList label="Detalhes anotados" value={scene.detalhes_anotados} /><SceneList label="Materiais informados" value={scene.materiais_informados} /><SceneList label="Incertezas" value={scene.incertezas} /></div><details className="raw-result"><summary>Ver resposta completa do workflow <ChevronDown size={16} /></summary><pre>{JSON.stringify(result, null, 2)}</pre></details></div> : <div className="result-empty"><div className="empty-orbit"><span /><Sparkles size={22} /></div><div><h3>Sua estrutura aparece aqui.</h3><p>Depois do envio, o retorno do fluxo será apresentado em uma leitura visual e também em JSON.</p></div><span className="empty-rule" /></div>}</section>
    </main><footer className="footer page-width"><span>MÓVEIS PLANEJADOS / 2026</span><span>Uma ferramenta para começar melhor.</span><a href="#top">Voltar ao topo <ArrowUpRight size={14} /></a></footer>
  </div>;
}
