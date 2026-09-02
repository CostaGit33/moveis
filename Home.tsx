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
function imageFromPayload(payload: unknown): GeneratedImage {
  if (!isObject(payload)) return null;
  const image = isObject(payload.imagem) ? payload.imagem : payload;
  const metadata = isObject(payload.metadata) ? payload.metadata : {};
  const mimeType = typeof image.mimeType === "string" && image.mimeType.startsWith("image/") ? image.mimeType : "image/png";
  if (typeof image.url === "string" && image.url.trim()) return { src: image.url.trim(), mimeType, size: metadata.tamanho_saida };
  if (typeof image.base64 === "string" && image.base64.trim()) {
    const raw = image.base64.trim();
    return { src: raw.startsWith("data:image/") ? raw : `data:${mimeType};base64,${raw}`, mimeType, size: metadata.tamanho_saida };
  }
  if (typeof payload.image_url === "string" && payload.image_url.trim()) return { src: payload.image_url.trim(), mimeType, size: metadata.tamanho_saida };
  if (typeof payload.b64_json === "string" && payload.b64_json.trim()) return { src: `data:${mimeType};base64,${payload.b64_json.trim()}`, mimeType, size: metadata.tamanho_saida };
  return null;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [brief, setBrief] = useState("");
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem("moveis-webhook") || DEFAULT_WEBHOOK_URL);
  const [token, setToken] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Obj | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { try { const s = localStorage.getItem(HISTORY_KEY); if (s) setHistory(JSON.parse(s)); } catch { localStorage.removeItem(HISTORY_KEY); } }, []);
  useEffect(() => { if (!file) { setPreview(""); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  const loading = ["uploading", "analyzing", "generating"].includes(phase);
  const image = useMemo(() => imageFromPayload(result), [result]);
  const status = phase === "success" ? "Pronto" : phase === "error" ? "Atenção" : loading ? "Processando" : "Sistema online";

  function chooseFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Envie PNG, JPG ou WEBP."); e.target.value = ""; return; }
    if (f.size > MAX_FILE_SIZE) { toast.error("A imagem deve ter no máximo 10 MB."); e.target.value = ""; return; }
    setFile(f); setResult(null); setError(""); setPhase("idle");
  }
  function removeFile() { setFile(null); if (inputRef.current) inputRef.current.value = ""; }
  function saveEndpoint(v: string) { setEndpoint(v); localStorage.setItem("moveis-webhook", v); }
  function saveHistory(payload: Obj) {
    const item: HistoryItem = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), fileName: file?.name || "rascunho", brief, payload };
    const next = [item, ...history].slice(0, 10); setHistory(next); localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    if (!file) { toast.error("Adicione um rascunho primeiro."); return; }
    if (!endpoint.trim()) { setShowSettings(true); setError("Configure a conexão do estúdio."); return; }
    const data = new FormData(); data.append("data", file, file.name); if (brief.trim()) data.append("pedido", brief.trim());
    setPhase("uploading"); setResult(null);
    try {
      const headers: HeadersInit = {}; if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
      const response = await fetch(endpoint.trim(), { method: "POST", body: data, headers });
      setPhase("analyzing");
      const raw = await response.text();
      let payload: unknown; try { payload = raw ? JSON.parse(raw) : null; } catch { throw new Error("O workflow retornou uma resposta que não é JSON válido."); }
      if (!response.ok) throw new Error(isObject(payload) && typeof payload.erro === "string" ? payload.erro : `O workflow respondeu com HTTP ${response.status}.`);
      if (!isObject(payload)) throw new Error("O workflow não devolveu uma resposta válida.");
      setPhase("generating"); setResult(payload); setPhase("success"); saveHistory(payload);
      if (imageFromPayload(payload)) toast.success("Visualização pronta."); else toast.warning("Processamento concluído; a imagem ainda não veio na resposta.");
      requestAnimationFrame(() => document.getElementById("resultado")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      const m = err instanceof Error ? err.message : "Não foi possível concluir a operação.";
      setError(m.includes("Failed to fetch") ? "Não foi possível acessar o workflow. Verifique o webhook e o CORS." : m);
      setPhase("error"); toast.error("Não foi possível concluir o projeto.");
    }
  }
  async function copyPayload() { if (!result) return; await navigator.clipboard.writeText(JSON.stringify(result, null, 2)); toast.success("Resposta copiada."); }
  function downloadImage() { if (!image) return; const a = document.createElement("a"); a.href = image.src; a.download = `moveis-${Date.now()}.${image.mimeType.includes("jpeg") ? "jpg" : "png"}`; a.click(); }
  function clearHistory() { setHistory([]); localStorage.removeItem(HISTORY_KEY); toast.success("Histórico removido deste dispositivo."); }
  function load(item: HistoryItem) { setResult(item.payload); setBrief(item.brief); setPhase("success"); requestAnimationFrame(() => document.getElementById("resultado")?.scrollIntoView({ behavior: "smooth" })); }

  return <div className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="nav container">
      <a href="#inicio" className="logo" aria-label="Móveis Intelligence Studio início"><span className="logo-mark"><span/><span/><span/></span><span><b>MÓVEIS</b><small>INTELLIGENCE STUDIO</small></span></a>
      <div className="nav-right"><span className="live"><i/> {status}</span><button className="icon-button" onClick={() => setShowSettings(v => !v)} aria-label="Configurações" title="Configurações"><Settings2 size={17}/></button></div>
    </header>

    <main id="inicio">
      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow"><span/> VISÃO COMPUTACIONAL <b>•</b> IA GENERATIVA</div>
          <h1>Do traço.<br/><span>À forma.</span></h1>
          <p>Uma interface para transformar o rascunho de um móvel planejado em uma visualização arquitetônica, mantendo a intenção estrutural do desenho.</p>
          <a href="#studio" className="primary-link">Iniciar projeto <ArrowRight size={16}/></a>
          <div className="trust-row"><span><Check size={13}/> Referência preservada</span><span><Check size={13}/> Leitura técnica</span><span><Check size={13}/> Visualização IA</span></div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="visual-grid"/><div className="visual-glow"/>
          <div className="blueprint"><span className="dimension top">WIDTH <b>—</b></span><span className="dimension side">HEIGHT <b>—</b></span><div className="bp-room"><i/><i/><i/></div><div className="bp-cabinet"><span/><span/><span/><span/><span/><span/></div><div className="bp-mirror"/><div className="scan-line"/></div>
          <div className="visual-tag">STRUCTURE / 01</div><div className="visual-tag bottom">FORM · MATERIAL · LIGHT</div>
        </div>
      </section>

      <section className="studio container" id="studio">
        <div className="section-heading"><div><span className="section-index">01 — RASCUNHO</span><h2>Comece pela<br/><em>estrutura.</em></h2></div><p>Envie o desenho que representa sua ideia. O sistema usa a imagem como referência visual principal e o pedido como direção complementar.</p></div>
        <form className="studio-grid" onSubmit={submit}>
          <div>
            <label className={`dropzone ${file ? "filled" : ""}`} htmlFor="drawing">
              <input ref={inputRef} id="drawing" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile}/>
              {file && preview ? <><img src={preview} alt="Rascunho selecionado"/><div className="drop-overlay"><Check size={14}/> REFERÊNCIA CARREGADA</div><button type="button" className="remove" onClick={e => { e.preventDefault(); removeFile(); }} aria-label="Remover rascunho"><X size={15}/></button></> : <div className="drop-empty"><span className="upload-circle"><ImagePlus size={24}/></span><strong>Adicione seu rascunho</strong><span>Arraste para cá ou toque para selecionar</span><small>PNG · JPG · WEBP · MÁX. 10 MB</small></div>}
            </label>
            <div className="upload-meta"><span><FileImage size={13}/> Uma imagem por projeto</span><span>INPUT <b>DATA</b></span></div>
          </div>
          <div className="brief-panel">
            <div className="field"><label htmlFor="brief">Direção do projeto <span>opcional</span></label><textarea id="brief" value={brief} onChange={e => setBrief(e.target.value.slice(0, 500))} placeholder="Descreva apenas o que você quer preservar ou acrescentar. Ex.: acabamento branco, manter os módulos e a posição do espelho."/><div className="counter">{brief.length}/500</div></div>
            {showSettings && <div className="settings-card"><div className="settings-title"><Settings2 size={15}/> Conexão</div><label>Webhook n8n<input type="url" value={endpoint} onChange={e => saveEndpoint(e.target.value)}/></label><label>Token <small>opcional</small><input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Bearer token"/></label><p>O estúdio envia <code>data</code> + <code>pedido</code> em multipart/form-data.</p></div>}
            <button className="generate" type="submit" disabled={loading || !file}>{loading ? <><LoaderCircle className="spin" size={17}/> {phase === "uploading" ? "Enviando referência" : phase === "analyzing" ? "Analisando estrutura" : "Construindo visual"}...</> : <><WandSparkles size={17}/> Gerar visualização <Send size={14}/></>}</button>
            {!file && <div className="helper">Adicione um rascunho para liberar a geração.</div>}{error && <div className="error-box"><X size={16}/><span>{error}</span></div>}
          </div>
        </form>
      </section>

      <section className="result-section container" id="resultado">
        <div className="section-heading result-heading"><div><span className="section-index">02 — VISUAL</span><h2>Veja a ideia<br/><em>ganhar forma.</em></h2></div><p>{result ? "A resposta abaixo vem diretamente do workflow conectado ao estúdio." : "Quando o processamento terminar, sua visualização aparecerá neste espaço."}</p></div>
        {!result ? <div className="empty-result"><div><Sparkles size={20}/><strong>Aguardando referência</strong><span>O próximo passo começa no seu rascunho.</span></div></div> : <div className="result-layout">
          <div className="result-image-card"><div className="result-toolbar"><span><span className="online-dot"/> RESULTADO <b>{result.codigo || "OK"}</b></span>{image && <button onClick={downloadImage}><Download size={14}/> Salvar</button>}</div>{image ? <div className="generated-frame"><img src={image.src} alt="Visualização final do móvel planejado"/></div> : <div className="missing-image"><ImagePlus size={24}/><strong>Visual concluído, imagem não recebida</strong><span>O workflow respondeu corretamente, mas ainda não entregou uma URL ou Base64 de imagem ao navegador.</span></div>}</div>
          <aside className="result-info"><div className="success-badge"><Check size={14}/> {result.codigo || "PROCESSAMENTO CONCLUÍDO"}</div><h3>Resumo do projeto</h3><dl><div><dt>Etapa</dt><dd>{text(result.etapa)}</dd></div><div><dt>Referência</dt><dd>{result.imagem?.tipo === "url" || result.imagem?.base64 ? "Utilizada" : "Recebida"}</dd></div><div><dt>Saída</dt><dd>{text(result.metadata?.tamanho_saida, "Imagem")}</dd></div></dl><details><summary>Especificação técnica <ChevronDown size={15}/></summary><pre>{text(result.metadata?.especificacao_tecnica || result.especificacao_tecnica || result.metadata?.identificacao_movel)}</pre></details><div className="info-actions"><button onClick={copyPayload}><Copy size={14}/> Copiar resposta</button><button onClick={() => document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" })}><RefreshCw size={14}/> Novo projeto</button></div></aside>
        </div>}
      </section>

      {history.length > 0 && <section className="history container"><div className="history-title"><div><span className="section-index">03 — HISTÓRICO</span><h2>Projetos <em>recentes.</em></h2></div><button onClick={clearHistory}><Trash2 size={13}/> Limpar</button></div><div className="history-grid">{history.map(item => <button className="history-item" key={item.id} onClick={() => load(item)}><span className="history-icon"><History size={16}/></span><span><strong>{item.fileName}</strong><small>{new Date(item.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small></span><ArrowRight size={15}/></button>)}</div></section>}
    </main>
    <footer className="footer container"><span>© {new Date().getFullYear()} MÓVEIS INTELLIGENCE STUDIO</span><span>DESENHO → ESTRUTURA → VISUAL</span></footer>
  </div>;
}
