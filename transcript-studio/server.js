"use strict";

const http = require("node:http");
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");
const { spawn } = require("node:child_process");

loadDotEnv(path.join(__dirname, ".env"));

const ROOT = __dirname;
const JOBS = path.join(ROOT, "data", "jobs");
const PORT = Number(process.env.PORT || 8787);
const API_URL =
  process.env.OPENAI_AUDIO_TRANSCRIPTION_URL ||
  "https://api.openai.com/v1/audio/transcriptions";
const MAX_DIRECT_BYTES =
  Number(process.env.OPENAI_AUDIO_LIMIT_MB || 24.5) * 1024 * 1024;
const MAX_UPLOAD_BYTES =
  Number(process.env.MAX_UPLOAD_MB || 2048) * 1024 * 1024;
const CHUNK_SECONDS = Number(process.env.FFMPEG_CHUNK_SECONDS || 1200);

const DIRECT_FORMATS = new Set([
  "flac",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "ogg",
  "wav",
  "webm",
]);

const MODES = {
  standard: {
    label: "標準逐字稿",
    model: "gpt-4o-transcribe",
    responseFormat: "json",
  },
  fast: {
    label: "快速逐字稿",
    model: "gpt-4o-mini-transcribe",
    responseFormat: "json",
  },
  timestamps: {
    label: "段落時間軸",
    model: "whisper-1",
    responseFormat: "verbose_json",
    timestamps: true,
  },
  diarize: {
    label: "說話者分段",
    model: "gpt-4o-transcribe-diarize",
    responseFormat: "diarized_json",
    diarize: true,
  },
};

const MIME_BY_EXT = {
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  mpga: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "video/webm",
};

let ffmpegInfo = { available: false, path: null };

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await fsp.mkdir(JOBS, { recursive: true });
  ffmpegInfo = await findFfmpeg();

  const server = http.createServer((req, res) => {
    route(req, res).catch((error) => {
      sendJson(res, error.status || 500, {
        error: error.message || "伺服器發生錯誤",
        details: error.details || null,
      });
    });
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Transcript Studio: http://127.0.0.1:${PORT}`);
    console.log(`ffmpeg: ${ffmpegInfo.available ? ffmpegInfo.path : "not found"}`);
  });
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    sendHtml(res, renderHtml());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJson(res, 200, {
      apiKeyFromEnv: Boolean(process.env.OPENAI_API_KEY),
      directFormats: [...DIRECT_FORMATS].sort(),
      ffmpeg: ffmpegInfo,
      maxDirectMb: mb(MAX_DIRECT_BYTES),
      maxUploadMb: mb(MAX_UPLOAD_BYTES),
      modes: Object.fromEntries(
        Object.entries(MODES).map(([key, value]) => [
          key,
          { label: value.label, model: value.model },
        ])
      ),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/transcribe") {
    sendJson(res, 200, await transcribeRequest(req));
    return;
  }

  sendText(res, 404, "Not found");
}

async function transcribeRequest(req) {
  const length = Number(req.headers["content-length"] || 0);
  if (length > MAX_UPLOAD_BYTES) {
    throw httpError(413, `檔案太大，目前上傳上限是 ${mb(MAX_UPLOAD_BYTES)} MB。`);
  }

  const form = await parseForm(req);
  const file = form.get("media");
  if (!file || typeof file === "string") throw httpError(400, "請先選擇檔案。");

  const apiKey = getApiKey(req);
  if (!apiKey) {
    throw httpError(
      401,
      "缺少 OpenAI API key。請在畫面輸入 API key，或在 .env 設定 OPENAI_API_KEY。"
    );
  }

  const language = normalizeLanguage(form.get("language"));
  const mode = MODES[String(form.get("mode") || "standard")] || MODES.standard;
  const prompt = String(form.get("prompt") || "").trim().slice(0, 1600);
  const originalName = safeName(file.name || "upload.bin");
  const ext = path.extname(originalName).replace(".", "").toLowerCase();
  const bytes = Buffer.from(await file.arrayBuffer());

  const job = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}-${crypto
    .randomBytes(4)
    .toString("hex")}`;
  const jobDir = path.join(JOBS, job);
  await fsp.mkdir(jobDir, { recursive: true });
  const originalPath = path.join(jobDir, originalName);
  await fsp.writeFile(originalPath, bytes);

  const direct = DIRECT_FORMATS.has(ext);
  const needsFfmpeg = !direct || bytes.byteLength > MAX_DIRECT_BYTES;
  const parts = needsFfmpeg
    ? await makeAudioChunks(originalPath, jobDir, direct, bytes.byteLength, ext)
    : [{ path: originalPath, name: originalName, ext, offset: 0 }];

  const results = [];
  for (const part of parts) {
    const raw = await transcribePart({
      apiKey,
      filePath: part.path,
      fileName: part.name,
      ext: part.ext,
      language,
      mode,
      prompt,
    });
    results.push({
      raw,
      text: raw.text || "",
      segments: extractSegments(raw, part.offset || 0),
    });
  }

  const segments = results.flatMap((item) => item.segments);
  const transcript = segments.length
    ? segments
        .map((s) => `[${clock(s.start)} - ${clock(s.end)}] ${s.speaker ? `${s.speaker}: ` : ""}${s.text}`)
        .join("\n")
    : results.map((item) => item.text.trim()).filter(Boolean).join("\n\n");
  const srt = segments.length ? buildSrt(segments) : "";

  await fsp.writeFile(path.join(jobDir, "transcript.txt"), transcript, "utf8");
  if (srt) await fsp.writeFile(path.join(jobDir, "transcript.srt"), srt, "utf8");

  return {
    job,
    transcript: transcript || "沒有取得逐字稿內容。",
    srt,
    metadata: {
      file: originalName,
      sizeMb: mb(bytes.byteLength),
      language,
      mode: mode.label,
      model: mode.model,
      chunks: parts.length,
      transcoded: needsFfmpeg,
    },
  };
}

async function makeAudioChunks(inputPath, jobDir, direct, size, ext) {
  if (!ffmpegInfo.available) {
    const reason = direct
      ? `OpenAI 轉錄 API 單檔需小於約 25 MB；此檔案是 ${mb(size)} MB。`
      : `.${ext || "unknown"} 不是 API 可直接接收的格式。`;
    throw httpError(
      direct ? 413 : 415,
      `${reason} 要支援 43MB 或更大的高位元率影音檔，這台電腦必須安裝 ffmpeg。`
    );
  }

  const chunkDir = path.join(jobDir, "chunks");
  await fsp.mkdir(chunkDir, { recursive: true });
  const pattern = path.join(chunkDir, "chunk-%03d.mp3");
  await run(ffmpegInfo.path, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "64k",
    "-f",
    "segment",
    "-segment_time",
    String(CHUNK_SECONDS),
    "-reset_timestamps",
    "1",
    pattern,
  ]);

  const files = (await fsp.readdir(chunkDir)).filter((file) => file.endsWith(".mp3")).sort();
  if (!files.length) throw httpError(422, "ffmpeg 沒有產生可轉錄的音訊片段。");
  return files.map((file, index) => ({
    path: path.join(chunkDir, file),
    name: file,
    ext: "mp3",
    offset: index * CHUNK_SECONDS,
  }));
}

async function transcribePart({ apiKey, filePath, fileName, ext, language, mode, prompt }) {
  const bytes = await fsp.readFile(filePath);
  if (bytes.byteLength > MAX_DIRECT_BYTES) {
    throw httpError(413, `${fileName} 仍超過 ${mb(MAX_DIRECT_BYTES)} MB，請縮短檔案。`);
  }

  const form = new FormData();
  form.set("file", new Blob([bytes], { type: MIME_BY_EXT[ext] || "audio/mpeg" }), fileName);
  form.set("model", mode.model);
  form.set("response_format", mode.responseFormat);
  form.set("temperature", "0");
  if (language !== "auto") form.set("language", language);
  if (prompt && !mode.diarize) form.set("prompt", prompt);
  if (mode.timestamps) form.append("timestamp_granularities[]", "segment");
  if (mode.diarize) form.set("chunking_strategy", "auto");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const body = await response.text();
  if (!response.ok) throw httpError(response.status, `OpenAI API 錯誤：${apiError(body)}`);
  return JSON.parse(body);
}

function extractSegments(raw, offset) {
  if (!raw || !Array.isArray(raw.segments)) return [];
  return raw.segments
    .map((segment) => ({
      start: Number(segment.start || 0) + offset,
      end: Number(segment.end || segment.start || 0) + offset,
      speaker: typeof segment.speaker === "string" ? segment.speaker : "",
      text: String(segment.text || "").trim(),
    }))
    .filter((segment) => segment.text);
}

function buildSrt(segments) {
  return segments
    .map((segment, index) => {
      const speaker = segment.speaker ? `${segment.speaker}: ` : "";
      return `${index + 1}\n${srtTime(segment.start)} --> ${srtTime(segment.end)}\n${speaker}${segment.text}`;
    })
    .join("\n\n");
}

function renderHtml() {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Transcript Studio</title>
  <style>
    :root{color-scheme:light;--bg:#f5f7f5;--panel:#fff;--ink:#1e2524;--muted:#66716f;--line:#d8dfdc;--accent:#116a64;--bad:#ad2d2d;--warn:#a35d00;--blue:#245b8f}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font-family:"Microsoft JhengHei","Segoe UI",Arial,sans-serif}.shell{width:min(1180px,calc(100vw - 32px));margin:0 auto;padding:28px 0 36px}.top{display:flex;justify-content:space-between;gap:20px;align-items:end}.eyebrow{margin:0 0 4px;color:var(--blue);font-size:.76rem;font-weight:800;text-transform:uppercase}h1,h2{margin:0}h1{font-size:clamp(1.8rem,3vw,2.5rem)}.state{border:1px solid var(--line);border-radius:8px;background:#eef6f4;padding:9px 12px}.state.warn{background:#fff7e8;color:var(--warn)}.grid{display:grid;grid-template-columns:minmax(300px,390px) minmax(0,1fr);gap:18px;margin-top:24px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:0 14px 40px rgba(24,38,36,.08)}form{display:grid;gap:16px;padding:18px}.field{display:grid;gap:8px;border:0;margin:0;padding:0}.field>span,legend{font-weight:800}input,textarea,button{font:inherit}input[type=password],textarea{width:100%;border:1px solid var(--line);border-radius:8px;background:#fbfcfc;padding:10px}.drop{position:relative;display:grid;place-items:center;min-height:140px;border:1.5px dashed #97aaa5;border-radius:8px;background:#f8fbfa;text-align:center}.drop input{position:absolute;inset:0;opacity:0}.seg{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-radius:8px;overflow:hidden}.seg label{display:grid}.seg input,.modes input{position:absolute;opacity:0}.seg span{display:grid;place-items:center;min-height:40px;color:var(--muted)}.seg input:checked+span{background:var(--accent);color:#fff;font-weight:800}.modes{display:grid;gap:8px}.modes span{display:grid;gap:2px;border:1px solid var(--line);border-radius:8px;padding:9px 10px}.modes small{color:var(--muted)}.modes input:checked+span{border-color:var(--accent);background:#eff8f6;box-shadow:inset 3px 0 0 var(--accent)}.primary{min-height:46px;border:0;border-radius:8px;background:var(--accent);color:#fff;font-weight:900;cursor:pointer}.primary:disabled{background:#94aaa5}.notice{min-height:22px;margin:0;color:var(--muted)}.notice.bad{color:var(--bad)}.notice.warn{color:var(--warn)}.result{display:grid;grid-template-rows:auto minmax(420px,1fr) auto;min-height:642px}.bar{display:flex;justify-content:space-between;gap:16px;align-items:center;border-bottom:1px solid var(--line);padding:16px 18px}.actions{display:flex;gap:8px;flex-wrap:wrap}.actions button{border:1px solid var(--line);border-radius:8px;background:#fbfcfc;padding:7px 10px}pre{margin:0;padding:18px;overflow:auto;white-space:pre-wrap;word-break:break-word;line-height:1.72;font-family:inherit}.meta{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line)}.meta div{padding:12px 14px;border-right:1px solid var(--line)}.meta dt{color:var(--muted);font-size:.76rem;font-weight:800}.meta dd{margin:0;overflow-wrap:anywhere}@media(max-width:900px){.grid{grid-template-columns:1fr}.meta{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.shell{width:calc(100vw - 20px)}.top,.bar{flex-direction:column;align-items:stretch}.seg,.meta{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="top"><div><p class="eyebrow">Local Transcription Tool</p><h1>逐字稿工作台</h1></div><div class="state" id="state">檢查中</div></header>
    <section class="grid">
      <form id="form" class="panel">
        <label class="field"><span>OpenAI API Key</span><input id="key" type="password" autocomplete="off" placeholder="sk-..."></label>
        <label class="drop"><input id="media" name="media" type="file" accept=".flac,.mp3,.mp4,.mpeg,.mpga,.m4a,.ogg,.wav,.webm,.mov,.mkv,.avi,.wmv,.m4v,.3gp,.aac,.flv,.opus,.aiff,.aif,.caf"><div><strong id="fileName">選擇音訊或影片</strong><br><span id="fileMeta">支援常見音訊與影片格式</span></div></label>
        <fieldset class="field"><legend>語言</legend><div class="seg"><label><input type="radio" name="language" value="auto" checked><span>自動</span></label><label><input type="radio" name="language" value="zh"><span>中文</span></label><label><input type="radio" name="language" value="en"><span>English</span></label></div></fieldset>
        <fieldset class="field"><legend>模式</legend><div class="modes"><label><input type="radio" name="mode" value="standard" checked><span><strong>標準逐字稿</strong><small>gpt-4o-transcribe</small></span></label><label><input type="radio" name="mode" value="fast"><span><strong>快速逐字稿</strong><small>gpt-4o-mini-transcribe</small></span></label><label><input type="radio" name="mode" value="timestamps"><span><strong>段落時間軸</strong><small>whisper-1</small></span></label><label><input type="radio" name="mode" value="diarize"><span><strong>說話者分段</strong><small>gpt-4o-transcribe-diarize</small></span></label></div></fieldset>
        <label class="field"><span>專有名詞 / 上下文</span><textarea name="prompt" rows="4" placeholder="例如：人名、品牌名、課程名稱、常出現的英文縮寫"></textarea></label>
        <button class="primary" id="submit" type="submit">開始轉逐字稿</button>
        <p class="notice" id="notice"></p>
      </form>
      <section class="panel result">
        <div class="bar"><div><p class="eyebrow">Transcript</p><h2 id="title">等待檔案</h2></div><div class="actions"><button id="copy" disabled>複製</button><button id="txt" disabled>TXT</button><button id="srt" disabled>SRT</button></div></div>
        <pre id="out">逐字稿會顯示在這裡。</pre><dl class="meta" id="meta"></dl>
      </section>
    </section>
  </main>
  <script>
    const $=s=>document.querySelector(s);let config=null,result=null;
    async function init(){try{config=await (await fetch('/api/config')).json();$('#state').textContent=(config.ffmpeg.available?'ffmpeg 已啟用':'ffmpeg 未啟用')+' · '+(config.apiKeyFromEnv?'API key 已由 .env 提供':'請輸入 API key');$('#state').classList.toggle('warn',!config.ffmpeg.available)}catch{$('#state').textContent='後端連線失敗';notice('GitHub Pages 只能顯示靜態頁。請下載 repo 後用 start.ps1 在本機啟動。','bad')}}
    $('#key').value=localStorage.getItem('ts.key')||'';$('#key').onchange=()=>localStorage.setItem('ts.key',$('#key').value.trim());
    $('#media').onchange=()=>{const f=$('#media').files[0];if(!f)return;const ext=(f.name.split('.').pop()||'').toLowerCase();$('#fileName').textContent=f.name;$('#fileMeta').textContent='.'+ext+' · '+Math.round(f.size/1024/1024*10)/10+' MB';if(config&&config.directFormats.includes(ext)&&f.size>config.maxDirectMb*1024*1024)notice(config.ffmpeg.available?'大檔會先抽音、壓縮並切段。':'大檔需要 ffmpeg，否則不能突破約 25MB API 限制。',config.ffmpeg.available?'warn':'bad')};
    $('#form').onsubmit=async e=>{e.preventDefault();const file=$('#media').files[0];if(!file)return notice('請先選擇檔案。','bad');$('#submit').disabled=true;$('#submit').textContent='轉錄中...';$('#out').textContent='上傳與轉錄中，請稍候...';try{const body=new FormData($('#form'));body.set('media',file,file.name);const headers={};if($('#key').value.trim())headers['x-openai-api-key']=$('#key').value.trim();const r=await fetch('/api/transcribe',{method:'POST',headers,body});const p=await r.json();if(!r.ok)throw new Error(p.error||'轉錄失敗');result=p;$('#out').textContent=p.transcript;$('#title').textContent=p.metadata.file;renderMeta(p.metadata);$('#copy').disabled=$('#txt').disabled=false;$('#srt').disabled=!p.srt;notice('完成。','')}catch(err){$('#out').textContent=err.message;notice(err.message,'bad')}finally{$('#submit').disabled=false;$('#submit').textContent='開始轉逐字稿'}};
    $('#copy').onclick=()=>navigator.clipboard.writeText(result?.transcript||'');$('#txt').onclick=()=>save('transcript.txt',result?.transcript||'');$('#srt').onclick=()=>save('transcript.srt',result?.srt||'');
    function renderMeta(m){$('#meta').innerHTML=Object.entries({模式:m.mode,語言:m.language,大小:m.sizeMb+' MB',模型:m.model,片段:m.chunks,轉檔:m.transcoded?'是':'否'}).map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+v+'</dd></div>').join('')}
    function notice(t,c){$('#notice').textContent=t;$('#notice').className='notice '+(c||'')}function save(n,t){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/plain;charset=utf-8'}));a.download=n;a.click();URL.revokeObjectURL(a.href)}init();
  </script>
</body>
</html>`;
}

async function parseForm(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.set(key, value);
  }
  const request = new Request(`http://127.0.0.1${req.url}`, {
    method: req.method,
    headers,
    body: Readable.toWeb(req),
    duplex: "half",
  });
  return request.formData();
}

async function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    path.join(ROOT, "tools", "ffmpeg.exe"),
    path.join(ROOT, "ffmpeg.exe"),
    "ffmpeg",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await run(candidate, ["-version"], 3000);
      return { available: true, path: candidate };
    } catch {
      // Try next candidate.
    }
  }
  return { available: false, path: null };
}

function run(command, args, timeoutMs = Number(process.env.FFMPEG_TIMEOUT_MS || 3600000)) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out`));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-20000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(stderr || `${command} exited ${code}`));
    });
  });
}

function getApiKey(req) {
  const header = req.headers["x-openai-api-key"];
  return String(process.env.OPENAI_API_KEY || header || "").trim();
}

function normalizeLanguage(value) {
  return ["auto", "zh", "en"].includes(String(value)) ? String(value) : "auto";
}

function safeName(name) {
  return String(name || "upload.bin")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function apiError(body) {
  try {
    return JSON.parse(body).error?.message || body.slice(0, 300);
  } catch {
    return body.slice(0, 300) || "未知錯誤";
  }
}

function mb(bytes) {
  return Math.round((Number(bytes || 0) / 1024 / 1024) * 10) / 10;
}

function clock(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(Math.floor(s % 60))}`;
}

function srtTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  return `${clock(s)},${String(Math.floor((s - Math.floor(s)) * 1000)).padStart(3, "0")}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function sendHtml(res, body) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function httpError(status, message, details = null) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
