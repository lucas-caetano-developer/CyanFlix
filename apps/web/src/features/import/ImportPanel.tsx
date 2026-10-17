import React, { useState, useRef } from "react";
import { formatBytes } from "../../lib/utils";

async function sha256Bytes(bytes: BufferSource): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256File(file: File): Promise<string> {
  return sha256Bytes(await file.arrayBuffer());
}

// Espelho de packages/contracts: JSON canônico (chaves ordenadas, separadores compactos)
function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => compareCodePoints(a, b))
        .map(([key, nested]) => [key, sortForJson(nested)])
    );
  }
  return value;
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, value => value.codePointAt(0)!);
  const b = Array.from(right, value => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

// Hash canônico do manifesto, com `manifest_sha256` removido temporariamente (regra 7.1 do PACOTE.md)
async function canonicalManifestSha256(manifest: Record<string, unknown>): Promise<string> {
  const copy = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
  delete copy.manifest_sha256;
  return sha256Bytes(new TextEncoder().encode(JSON.stringify(sortForJson(copy))));
}

function validateManifest(manifest: unknown): string[] {
  const problems: string[] = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return ["not a JSON object"];
  const value = manifest as Record<string, unknown>;

  if (value.schema_version !== 1) problems.push("schema_version must be 1");
  for (const field of ["package_id", "idempotency_key", "package_type", "generated_at", "manifest_sha256"]) {
    if (typeof value[field] !== "string" || !value[field]) problems.push(`missing '${field}'`);
  }
  if (typeof value.package_type === "string" && !["movie", "season"].includes(value.package_type)) {
    problems.push("'package_type' must be 'movie' or 'season'");
  }
  if (typeof value.manifest_sha256 === "string" && !/^[a-f0-9]{64}$/.test(value.manifest_sha256)) {
    problems.push("'manifest_sha256' must be a lowercase SHA-256 digest");
  }

  const work = readRecord(value.work);
  if (!work) {
    problems.push("missing 'work'");
  } else {
    if (typeof work.id !== "string" || !work.id) problems.push("missing 'work.id'");
    if (typeof work.title !== "string" || !work.title) problems.push("missing 'work.title'");
    if (typeof work.content_kind !== "string" || !["movie", "series", "anime"].includes(work.content_kind)) problems.push("'work.content_kind' must be movie, series or anime");
  }

  const season = readRecord(value.season);
  if (value.package_type === "season" && !season?.id) {
    problems.push("missing 'season.id' in a season package");
  }

  if (!Array.isArray(value.assets)) {
    problems.push("'assets' must be an array");
  } else {
    value.assets.forEach((entry, index: number) => {
      const asset = readRecord(entry);
      if (!asset) {
        problems.push(`assets[${index}] is not an object`);
        return;
      }
      if (typeof asset.id !== "string" || !asset.id) problems.push(`assets[${index}] missing 'id'`);
      if (typeof asset.type !== "string" || !asset.type) problems.push(`assets[${index}] missing 'type'`);
      if (typeof asset.path !== "string" || !asset.path) problems.push(`assets[${index}] missing 'path'`);
      if (typeof asset.size_bytes !== "number") problems.push(`assets[${index}] missing 'size_bytes'`);
      if (typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256)) problems.push(`assets[${index}] invalid 'sha256'`);
    });
  }

  return problems;
}

function summarizeList(items: string[], limit = 5): string {
  return items.length > limit ? `${items.slice(0, limit).join(", ")}… (${items.length} total)` : items.join(", ");
}

function browserPath(f: File): string {
  return f.webkitRelativePath || f.name;
}

function normalizeBrowserRelativePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function encodeRelativePath(path: string): string {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

type PublicationStatus = {
  state?: string;
  error?: string | null;
  receipt?: { status?: string; remote_revision?: number } | null;
};

const delay = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));

async function waitForConfirmedPublication(
  uploadId: string,
  initial: PublicationStatus,
  onStateChange: (state: string) => void
): Promise<PublicationStatus> {
  const deadline = Date.now() + 15 * 60_000;
  let status = initial;
  let previousState = "";

  while (Date.now() < deadline) {
    const state = String(status.state ?? "unknown");
    if (state !== previousState) {
      previousState = state;
      onStateChange(state);
    }
    if (state === "confirmed" && status.receipt?.status === "confirmed") return status;
    if (state === "failed") throw new Error(status.error || "Server failed while processing the publication.");

    await delay(2_000);
    const response = await fetch(`/v1/publications/${encodeURIComponent(uploadId)}`);
    if (!response.ok) throw new Error(`Failed to check publication status: ${await describeHttpError(response)}`);
    status = await response.json() as PublicationStatus;
  }

  throw new Error("Publication processing timed out. The upload was preserved and can be resumed.");
}

async function describeHttpError(res: Response): Promise<string> {
  if (res.status === 413) return "File is too large (413 Payload Too Large). Check proxy max body size.";
  const text = await res.text().catch(() => "");
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  let message = "";
  const object = readRecord(data);
  const nestedError = readRecord(object?.error);
  if (typeof object?.message === "string" && object.message) message = object.message;
  else if (typeof object?.error === "string" && object.error) message = object.error;
  else if (typeof nestedError?.message === "string" && nestedError.message) message = nestedError.message;

  const extras = object
    ? Object.fromEntries(Object.entries(object).filter(([key]) => !["error", "message", "statusCode", "code"].includes(key)))
    : {};
  if (message && Object.keys(extras).length) message += `: ${JSON.stringify(extras)}`;
  if (!message) message = text ? text.slice(0, 400) : `HTTP ${res.status}`;
  return `${message} (HTTP ${res.status})`;
}

export function ImportPanel() {
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "reading" | "starting" | "hashing" | "uploading" | "completing" | "paused" | "done">("idle");
  const [status, setStatus] = useState<"none" | "ok" | "error">("none");
  const [progress, setProgress] = useState({ current: 0, total: 0, bytesUploaded: 0, totalBytes: 0 });
  const [currentFile, setCurrentFile] = useState("");
  const [summary, setSummary] = useState<{ pkgId: string; pubId: string; files: number; totalSize: number } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const pauseRequestedRef = useRef(false);
  const uploadAbortRef = useRef<AbortController | null>(null);

  const log = (msg: string) => {
    setLogs(prev => [...prev.slice(-9), msg]);
  };

  const importFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setBusy(true);
    setPhase("reading");
    setStatus("none");
    setLogs([]);
    setSummary(null);
    setCurrentFile("");
    pauseRequestedRef.current = false;
    
    try {
      const fullPathOf = (file: File) => normalizeBrowserRelativePath(browserPath(file));
      const packageRelativePath = (file: File) => {
        const fullPath = fullPathOf(file);
        return fullPath.includes('/') ? fullPath.substring(fullPath.indexOf('/') + 1) : fullPath;
      };

      const filesByPath = new Map<string, File>();
      for (const file of files) filesByPath.set(packageRelativePath(file), file);

      const manifestFile =
        filesByPath.get("manifest.json") ??
        files.find(f => fullPathOf(f).toLowerCase().endsWith("/manifest.json"));
      if (!manifestFile) {
        throw new Error("manifest.json not found in the selected folder.");
      }

      log("Reading manifest.json...");
      let manifest: Record<string, unknown>;
      try {
        manifest = JSON.parse(await manifestFile.text());
      } catch (err) {
        throw new Error("Failed to parse manifest.json: Invalid JSON.");
      }

      const problems = validateManifest(manifest);
      if (problems.length) {
        throw new Error(`Manifest is invalid: ${summarizeList(problems)}`);
      }

      const packageId = String(manifest.package_id);
      const manifestSha256 = String(manifest.manifest_sha256);

      log("Calculating manifest SHA-256...");
      const canonicalSha256 = await canonicalManifestSha256(manifest);
      if (canonicalSha256 !== manifestSha256) {
        throw new Error(`manifest_sha256 does not match the canonical manifest hash.`);
      }

      const expectedPaths = [
        "manifest.json",
        "checksums.sha256",
        ...(manifest.assets as Array<{ path: string; size_bytes: number }>).map(asset => asset.path)
      ];

      const missingPaths = expectedPaths.filter(path => !filesByPath.has(path));
      if (missingPaths.length) {
        throw new Error(`Package is missing ${missingPaths.length} declared file(s): ${summarizeList(missingPaths)}`);
      }

      const extraPaths = Array.from(filesByPath.keys()).filter(path => !expectedPaths.includes(path) && path !== "checkpoint.json");
      if (extraPaths.length) {
        throw new Error(`Package contains ${extraPaths.length} undeclared file(s): ${summarizeList(extraPaths)}`);
      }

      const checksumFile = filesByPath.get("checksums.sha256")!;
      const checksums = new Map<string, string>();
      for (const line of (await checksumFile.text()).split(/\r?\n/)) {
        if (!line.trim()) continue;
        const match = line.match(/^([a-fA-F0-9]{64})  (.+)$/);
        if (!match || checksums.has(match[2])) throw new Error(`Invalid or duplicate checksums.sha256 line: ${line}`);
        checksums.set(match[2], match[1].toLowerCase());
      }
      const coveredPaths = expectedPaths.filter(path => path !== "checksums.sha256");
      if (checksums.size !== coveredPaths.length || coveredPaths.some(path => !checksums.has(path))) {
        throw new Error("checksums.sha256 does not cover exactly the declared package.");
      }

      for (const asset of manifest.assets as Array<{ path: string; size_bytes: number }>) {
        const localFile = filesByPath.get(asset.path);
        if (localFile && typeof asset.size_bytes === "number" && localFile.size !== asset.size_bytes) {
          throw new Error(`Size mismatch for ${asset.path}: local ${localFile.size} bytes vs manifest ${asset.size_bytes} bytes.`);
        }
      }

      const totalSize = expectedPaths.reduce((acc, path) => acc + (filesByPath.get(path)?.size ?? 0), 0);
      setSummary({ pkgId: packageId, pubId: "", files: expectedPaths.length, totalSize });

      log(`Found package ${packageId} (${manifest.package_type}) with ${expectedPaths.length} files (${formatBytes(totalSize)})`);

      setPhase("starting");
      log("Creating publication...");

      const pubRes = await fetch("/v1/publications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          package_id: packageId,
          idempotency_key: manifest.idempotency_key,
          manifest_sha256: manifestSha256,
          total_size_bytes: totalSize,
          manifest
        })
      });

      if (!pubRes.ok) {
        throw new Error(`Failed to create publication: ${await describeHttpError(pubRes)}`);
      }

      const pubData = await pubRes.json();
      const uploadId: string | undefined = pubData.upload_id ?? pubData.id;
      if (!uploadId) {
        throw new Error("Server response is missing upload_id.");
      }
      setSummary(prev => prev ? { ...prev, pubId: uploadId } : null);
      log(`Publication ${uploadId} (state: ${pubData.state})`);

      const receivedPaths = new Set<string>(Array.isArray(pubData.received_paths) ? pubData.received_paths : []);
      if (receivedPaths.size) log(`Resuming: ${receivedPaths.size} file(s) already uploaded.`);

      setPhase("uploading");
      const resumedBytes = expectedPaths.reduce((acc, path) => acc + (receivedPaths.has(path) ? (filesByPath.get(path)?.size ?? 0) : 0), 0);
      setProgress({ current: receivedPaths.size, total: expectedPaths.length, bytesUploaded: resumedBytes, totalBytes: totalSize });
      let uploadedBytes = resumedBytes;
      let completedFiles = receivedPaths.size;

      for (const relativePath of expectedPaths) {
        if (pauseRequestedRef.current) throw new DOMException("Upload paused", "AbortError");
        if (receivedPaths.has(relativePath)) {
          continue;
        }
        const file = filesByPath.get(relativePath)!;

        setCurrentFile(relativePath);

        setPhase("hashing");
        const fileSha256 = relativePath === "checksums.sha256"
          ? await sha256File(file)
          : checksums.get(relativePath)!;

        setPhase("uploading");
        log(`Uploading ${relativePath} (${formatBytes(file.size)})...`);

        const uploadUrl = `/v1/publications/${encodeURIComponent(uploadId)}/files/${encodeRelativePath(relativePath)}`;
        const uploadController = new AbortController();
        uploadAbortRef.current = uploadController;
        const upRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            // Sempre octet-stream: a API registra parser só para application/octet-stream.
            // Enviar file.type (image/jpeg, video/mp4, application/json...) faria o Fastify
            // consumir/bufferizar o corpo e o hash recebido não bateria (409) ou daria 415.
            "Content-Type": "application/octet-stream",
            "X-Content-SHA256": fileSha256
          },
          body: file,
          signal: uploadController.signal,
        });
        uploadAbortRef.current = null;

        if (!upRes.ok) {
          throw new Error(`Failed to upload ${relativePath}: ${await describeHttpError(upRes)}`);
        }

        uploadedBytes += file.size;
        completedFiles += 1;
        setProgress({ current: completedFiles, total: expectedPaths.length, bytesUploaded: uploadedBytes, totalBytes: totalSize });
      }

      setPhase("completing");
      log("All files uploaded. Completing publication...");

      const compRes = await fetch(`/v1/publications/${encodeURIComponent(uploadId)}/complete`, {
        method: "POST",
        headers: {}
      });

      if (!compRes.ok) {
        throw new Error(`Failed to complete publication: ${await describeHttpError(compRes)}`);
      }

      const accepted = await compRes.json() as PublicationStatus;
      const compData = await waitForConfirmedPublication(uploadId, accepted, remoteState => {
        if (remoteState === "validating") log("Server is validating manifest and checksums...");
        else if (remoteState === "promoting") log("Server is promoting the new catalog revision...");
        else if (remoteState !== "confirmed") log(`Server state: ${remoteState}`);
      });
      setPhase("done");
      setStatus("ok");
      setCurrentFile("");
      log(`Publication confirmed: state=${compData.state}, revision=${compData.receipt?.remote_revision ?? "-"}, receipt=${compData.receipt ? "yes" : "no"}`);
      log("Publication imported successfully!");

    } catch (error: unknown) {
      if (pauseRequestedRef.current || (error instanceof DOMException && error.name === 'AbortError')) {
        setPhase('paused');
        setCurrentFile('');
        setStatus('none');
        log('Upload pausado. Selecione a mesma pasta para retomar sem reenviar arquivos confirmados.');
      } else {
        log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
        setStatus("error");
      }
    } finally {
      setBusy(false);
      if (dirInputRef.current) dirInputRef.current.value = "";
    }
  };

  const stepClass = (stepPhase: string) => {
    const phases = ["reading", "starting", "hashing", "uploading", "completing", "done"];
    const currentIndex = phases.indexOf(phase);
    const stepIndex = phases.indexOf(stepPhase);
    if (status === "error" && phase === stepPhase) return "import-panel__step--error";
    if (stepIndex < currentIndex || (phase === "done" && stepPhase === "done")) return "import-panel__step--done";
    if (stepIndex === currentIndex) return "import-panel__step--active";
    return "import-panel__step";
  };

  const phaseLabel = (p: string) => {
    switch(p) {
      case "idle": return "Pronto";
      case "reading": return "Lendo pasta...";
      case "starting": return "Iniciando...";
      case "hashing": return "Calculando SHA-256...";
      case "uploading": return "Enviando arquivo...";
      case "completing": return "Finalizando...";
      case "paused": return "Pausado";
      case "done": return "Concluído";
      default: return p;
    }
  };

  return (
    <div className="import-panel">
      <div className="import-panel__header">
        <span className="import-panel__eyebrow">Novo Import</span>
        <div className={`import-panel__state ${status === "error" ? "error" : status === "ok" ? "success" : ""}`}>
          {phaseLabel(phase)}
        </div>
      </div>

      <div className="import-panel__steps">
        <span className={stepClass("reading")}>1. Ler pacote</span>
        <span className={stepClass("starting")}>2. Criar publicação</span>
        <span className={stepClass("uploading")}>3. Enviar arquivos</span>
        <span className={stepClass("completing")}>4. Processar</span>
      </div>

      <div className="import-panel__controls">
        <label className={`import-panel__folder-btn ${busy ? "import-panel__folder-btn--disabled" : ""}`}>
          Selecionar Pasta de Publicação
          <input 
             type="file" 
             ref={dirInputRef}
             {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
             className="import-panel__directory-input"
             onChange={importFolder}
             disabled={busy}
          />
        </label>
        {busy && (phase === 'uploading' || phase === 'hashing') && <button className="btn btn--secondary" onClick={() => { pauseRequestedRef.current = true; uploadAbortRef.current?.abort(); }}>Pausar upload</button>}
      </div>

      {(progress.total > 0 || busy || status !== "none") && (
        <div className="import-panel__status">
          {summary && (
            <div className="import-panel__summary">
              <span className="import-panel__summary-item">
                <strong className="import-panel__summary-label">Package:</strong> {summary.pkgId}
              </span>
              <span className="import-panel__summary-item">
                <strong className="import-panel__summary-label">Upload ID:</strong> {summary.pubId || "..."}
              </span>
              <span className="import-panel__summary-item">
                <strong className="import-panel__summary-label">Files:</strong> {progress.current} / {summary.files}
              </span>
              <span className="import-panel__summary-item">
                <strong className="import-panel__summary-label">Size:</strong> {formatBytes(progress.bytesUploaded)} / {formatBytes(summary.totalSize)}
              </span>
            </div>
          )}

          {progress.total > 0 && (
            <div className="import-panel__progress"><progress className="import-panel__progress-bar" value={progress.bytesUploaded} max={progress.totalBytes} aria-label="Progresso do upload" /></div>
          )}

          {currentFile && (
             <div className="import-panel__current-file">
               {phase === "hashing" ? "Hashing" : "Enviando"}: {currentFile}
             </div>
          )}
          
          <div className="import-panel__log">
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
