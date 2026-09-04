import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Copy, Download, FileImage, History, ImagePlus, LoaderCircle, RefreshCw, Send, Settings2, Sparkles, Trash2, WandSparkles, X } from "lucide-react";
import { toast } from "sonner";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const DEFAULT_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || "https://webhook.novaagencian8n.online/webhook/criar-cena-v2";
const HISTORY_KEY = "moveis-ai-history";
type Phase = "idle" | "uploading" | "analyzing" | "generating" | "success" | "error";
type Obj = Record<string, any>;
type HistoryItem = { id: string; createdAt: string; fileName: string; brief: string; payload: Obj };
type GeneratedImage = { src: string; mimeType: string; size?: string } | null;

const isObject = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
function text(v: unknown, fallback = "Não informado") {
  if (typeof v === "string") return v.trim() || fallback;
  if (Array.isArray(v)) return v.length ? v.map(x => text(x)).join(", ") : fallback;
  if (isObject(v)) return Object.entries(v).map(([k, x]) => `${k.replaceAll("_", " ")}: ${text(x)}`).join(" · ") || fallback;
  return v == null ? fallback : String(v);
}
function normalizeBase64(value: string, mimeType: string) {
  const raw = value.trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/")) return raw;
  return `data:${mimeType};base64,${raw.replace(/\s+/g, "")}`;
}
function imageFromPayload(payload: unknown): GeneratedImage {
  if (!isObject(payload)) return null;
  const image = isObject(payload.imagem) ? payload.imagem : {};
  const metadata = isObject(payload.metadata) ? payload.metadata : {};
  const mimeType = typeof image.mimeType === "string" && image.mimeType.startsWith("image/") ? image.mimeType : "image/png";
  if (typeof image.url === "string" && image.url.trim()) return { src: image.url.trim(), mimeType, size: metadata.tamanho_saida };
  if (typeof image.base64 === "string" && image.base64.trim()) return { src: normalizeBase64(image.base64, mimeType), mimeType, size: metadata.tamanho_saida };
  if (Array.isArray(payload.data) && payload.data.length > 0) {
    const first = payload.data[0];
    if (isObject(first)) {
      if (typeof first.url === "string" && first.url.trim()) return { src: first.url.trim(), mimeType, size: metadata.tamanho_saida };
      if (typeof first.b64_json === "string" && first.b64_json.trim()) return { src: normalizeBase64(first.b64_json, mimeType), mimeType, size: metadata.tamanho_saida };
    }
  }
  if (typeof payload.image_url === "string" && payload.image_url.trim()) return { src: payload.image_url.trim(), mimeType, size: metadata.tamanho_saida };
  if (typeof payload.image_base64 === "string" && payload.image_base64.trim()) return { src: normalizeBase64(payload.image_base64, mimeType), mimeType, size: metadata.tamanho_saida };
  return null;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState(""), [brief, setBrief] = useState("");
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem("moveis-webhook") || DEFAULT_WEBHOOK_URL), [token, setToken] = useState("");
  const [showSettings, setShowSettings] = useState(false), [phase, setPhase] = useState<Phase>("idle"), [result, setResult] = useState<Obj | null>(null), [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]); const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { try { const s = localStorage.getItem(HISTORY_KEY); if (s) setHistory(JSON.parse(s)); } catch { localStorage.removeItem(HISTORY_KEY); } }, []);
  useEffect(() => { if (!file) { setPreview(""); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  const loading = ["uploading", "analyzing", "generating"].includes(phase), image = useMemo(() => imageFromPayload(result), [result]);
  const status = phase === "success" ? "Pronto" : phase === "error" ? "Erro" : loading ? "Processando" : "Online";
  function chooseFile(e: ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (!f) return; if (!f.type.startsWith("image/")) { toast.error("Envie PNG, JPG ou WEBP."); e.target.value = ""; return; } if (f.size > MAX_FILE_SIZE) { toast.error("A imagem deve ter no máximo 10 MB."); e.target.value = ""; return; } setFile(f); setResult(null); setError(""); setPhase("idle"); }
  function removeFile() { setFile(null); if (inputRef.current) inputRef.current.value = ""; }
  function saveEndpoint(v: string) { setEndpoint(v); localStorage.setItem("moveis-webhook", v); }
  function saveHistory(payload: Obj) { const item: HistoryItem = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), fileName: file?.name || "rascunho", brief, payload }; const next = [item, ...history].slice(0, 10); setHistory(next); localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); if (!file) { toast.error("Adicione um rascunho primeiro."); return; } if (!endpoint.trim()) { setShowSettings(true); setError("Configure o webhook do n8n."); return; }
    const data = new FormData(); data.append("data", file, file.name); if (brief.trim()) data.append("pedido", brief.trim()); setPhase("uploading"); setResult(null);
    try {
      const headers: HeadersInit = { Accept: "application/json" }; if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
      const response = await fetch(endpoint.trim(), { method: "POST", body: data, headers }); setPhase("analyzing");
      const contentType = response.headers.get("content-type") || "";
      if (contentType.startsWith("image/")) {
        if (!response.ok) throw new Error(`O workflow respondeu com HTTP ${response.status}.`);
        const blob = await response.blob();
        const directUrl = URL.createObjectURL(blob);
        const payload = { sucesso: true, codigo: "IMAGE_GENERATED_BINARY", etapa: "imagem_gerada", timestamp: new Date().toISOString(), imagem: { tipo: "url", url: directUrl, base64: null, mimeType: blob.type || "image/png" }, metadata: { referencia_visual_utilizada: true, tamanho_saida: "imagem binária" } };
        setPhase("generating"); setResult(payload); setPhase("success"); saveHistory(payload); toast.success("Projeto recebido com sucesso.");
        requestAnimationFrame(() => document.getElementById("resultado")?.scrollIntoView({ behavior: "smooth", block: "start" })); return;
      }
      const raw = await response.text();
      let payload: unknown; try { payload = raw ? JSON.parse(raw) : null; } catch { throw new Error("O workflow retornou uma resposta que não é JSON válido."); }
      if (!response.ok) throw new Error(isObject(payload) && typeof payload.erro === "string" ? payload.erro : `O workflow respondeu com HTTP ${response.status}.`);
      if (!isObject(payload)) throw new Error("O workflow não devolveu uma resposta válida.");
      setPhase("generating"); setResult(payload); setPhase("success"); saveHistory(payload); toast.success("Projeto recebido com sucesso.");
      requestAnimationFrame(() => document.getElementById("resultado")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) { const m = err instanceof Error ? err.message : "Não foi possível concluir a operação."; setError(m.includes("Failed to fetch") ? "Não foi possível acessar o workflow. Verifique o webhook e o CORS." : m); setPhase("error"); toast.error("A análise não foi concluída."); }
  }
  async function copyPayload() { if (!result) return; await navigator.clipboard.writeText(JSON.stringify(result, null, 2)); toast.success("Resultado copiado."); }
  function downloadImage() { if (!image) return; const a = document.createElement("a"); a.href = image.src; a.download = `moveis-${Date.now()}.${image.mimeType.includes("jpeg") ? "jpg" : "png"}`; a.click(); }
  function clearHistory() { setHistory([]); localStorage.removeItem(HISTORY_KEY); toast.success("Histórico removido deste dispositivo."); }
  function load(item: HistoryItem) { setResult(item.payload); setBrief(item.brief); setPhase("success"); requestAnimationFrame(() => document.getElementById("resultado")?.scrollIntoView({ behavior: "smooth" })); }

  return <div className="app-shell"><div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="nav container"><a href="#inicio" className="logo" aria-label="Móveis IA início"><span className="logo-orbit"><i/><i/><i/></span><span><b>MÓVEIS</b><small>INTELLIGENCE STUDIO</small></span></a><div className="nav-right"><span className="live"><i/> {status}</span><button className="icon-button" onClick={() => setShowSettings(v => !v)} aria-label="Configurações"><Settings2 size={18}/></button></div></header>
    <main id="inicio">
      <section className="hero container"><div className="hero-copy"><div className="pill"><Sparkles size={14}/> VISÃO COMPUTACIONAL · IA</div><h1>Do traço à<br/><span>visão real.</span></h1><p>Transforme um rascunho de móvel planejado em uma visualização arquitetônica, preservando a geometria e a intenção do desenho.</p><a href="#studio" className="primary-link">Começar projeto <ArrowRight size={17}/></a><div className="trust-row"><span><Check size={14}/> Referência visual</span><span><Check size={14}/> Leitura técnica</span><span><Check size={14}/> Render IA</span></div></div>
        <div className="hero-art" aria-hidden="true"><div className="grid-plane"/><div className="art-frame"><div className="room-line line-a"/><div className="room-line line-b"/><div className="cabinet"><div/><div/><div/><div/><div/><div/></div><div className="mirror"/><div className="art-glow"/></div><div className="art-label label-top">STRUCTURE <b>01</b></div><div className="art-label label-bottom">MATERIAL / FORM / LIGHT</div></div>
      </section>
      <section className="studio container" id="studio"><div className="section-heading"><div><span className="section-index">01 — ENTRADA</span><h2>Seu rascunho é o<br/><em>ponto de partida.</em></h2></div><p>Envie uma imagem do desenho. A IA interpreta cotas, módulos, divisórias e relações espaciais sem substituir o que foi realmente observado.</p></div>
        <form className="studio-grid" onSubmit={submit}><div><label className={`dropzone ${file ? "filled" : ""}`} htmlFor="drawing"><input ref={inputRef} id="drawing" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile}/>{file && preview ? <><img src={preview} alt="Rascunho selecionado"/><div className="drop-overlay"><Check size={15}/> Rascunho carregado</div><button type="button" className="remove" onClick={e => { e.preventDefault(); removeFile(); }} aria-label="Remover rascunho"><X size={16}/></button></> : <div className="drop-empty"><span className="upload-circle"><ImagePlus size={27}/></span><strong>Solte seu rascunho aqui</strong><span>ou toque para escolher uma imagem</span><small>PNG · JPG · WEBP · até 10 MB</small></div>}</label><div className="upload-meta"><span><FileImage size={14}/> Uma imagem por análise</span><span>Campo: <b>data</b></span></div></div>
          <div className="brief-panel"><div className="field"><label htmlFor="brief">Direção do projeto <span>opcional</span></label><textarea id="brief" value={brief} onChange={e => setBrief(e.target.value.slice(0, 500))} placeholder="Ex.: preserve os três módulos, mantenha a janela à direita e use acabamento branco."/><div className="counter">{brief.length}/500</div></div>
            {showSettings && <div className="settings-card"><div className="settings-title"><Settings2 size={16}/> Conexão técnica</div><label>URL do webhook n8n<input type="url" value={endpoint} onChange={e => saveEndpoint(e.target.value)}/></label><label>Token <small>opcional</small><input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Bearer token"/></label><p>O navegador envia <code>data</code> e <code>pedido</code> em multipart/form-data.</p></div>}
            <button className="generate" type="submit" disabled={loading || !file}>{loading ? <><LoaderCircle className="spin" size={18}/> {phase === "uploading" ? "Enviando rascunho" : phase === "analyzing" ? "Lendo estrutura" : "Gerando visual"}...</> : <><WandSparkles size={18}/> Gerar visualização <Send size={15}/></>}</button>{!file && <div className="helper">Adicione uma imagem para iniciar.</div>}{error && <div className="error-box"><X size={17}/><span>{error}</span></div>}
          </div></form></section>
      <section className="result-section container" id="resultado"><div className="section-heading result-heading"><div><span className="section-index">02 — RESULTADO</span><h2>Da análise à<br/><em>imagem.</em></h2></div><p>{result ? "O resultado abaixo é a resposta do workflow conectado ao estúdio." : "A visualização final aparecerá aqui após o processamento do seu rascunho."}</p></div>
        {!result ? <div className="empty-result"><div><Sparkles size={22}/><strong>Aguardando seu projeto</strong><span>Envie um rascunho para preencher esta área.</span></div></div> : <div className="result-layout"><div className="result-image-card"><div className="result-toolbar"><span><span className="online-dot"/> VISUALIZAÇÃO FINAL</span>{image && <button onClick={downloadImage}><Download size={15}/> Salvar imagem</button>}</div>{image ? <div className="generated-frame"><img src={image.src} alt="Visualização final do móvel planejado"/></div> : <div className="missing-image"><ImagePlus size={25}/><strong>A imagem ainda não foi retornada pelo workflow</strong><span>O processamento foi concluído, mas a resposta não contém URL ou Base64 de imagem.</span></div>}</div>
            <aside className="result-info"><div className="success-badge"><Check size={15}/> {result.codigo || "PROCESSAMENTO CONCLUÍDO"}</div><h3>Leitura do projeto</h3><dl><div><dt>Etapa</dt><dd>{text(result.etapa)}</dd></div><div><dt>Referência</dt><dd>{result.imagem?.tipo === "url" || result.imagem?.base64 ? "Utilizada" : "Recebida"}</dd></div><div><dt>Saída</dt><dd>{text(result.metadata?.tamanho_saida, "Imagem")}</dd></div></dl><details><summary>Ver especificação técnica <ChevronDown size={16}/></summary><pre>{text(result.metadata?.especificacao_tecnica || result.especificacao_tecnica || result.metadata?.identificacao_movel)}</pre></details><div className="info-actions"><button onClick={copyPayload}><Copy size={15}/> Copiar resposta</button><button onClick={() => document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" })}><RefreshCw size={15}/> Novo projeto</button></div></aside></div>}
      </section>
      {history.length > 0 && <section className="history container"><div className="history-title"><div><span className="section-index">03 — MEMÓRIA</span><h2>Projetos <em>recentes.</em></h2></div><button onClick={clearHistory}><Trash2 size={14}/> Limpar</button></div><div className="history-grid">{history.map(item => <button className="history-item" key={item.id} onClick={() => load(item)}><span className="history-icon"><History size={17}/></span><span><strong>{item.fileName}</strong><small>{new Date(item.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small></span><ArrowRight size={16}/></button>)}</div></section>}
    </main><footer className="footer container"><span>© {new Date().getFullYear()} MÓVEIS INTELLIGENCE STUDIO</span><span>Estrutura primeiro · estética depois</span></footer>
  </div>;
}
