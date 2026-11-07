import { GUIDES } from "/assets/guides.js";
import { renderMarkdown } from "/assets/markdown.js";

const $ = (id) => document.getElementById(id);
const els = { tabs: $("tabs"), msgs: $("messages"), log: $("log"), form: $("form"), input: $("input"),
  send: $("send"), stop: $("stop"), status: $("status"), count: $("count"), reset: $("reset") };
const MAX_HISTORY = 20;

const params = new URLSearchParams(location.search);
let guide = GUIDES.find((g) => g.id === params.get("guide")) ?? GUIDES[0];
let history = [];
let controller = null;

const storeKey = () => `chat:${guide.id}`;
function load() { try { history = JSON.parse(sessionStorage.getItem(storeKey()) ?? "[]"); } catch { history = []; } }
function save() { try { sessionStorage.setItem(storeKey(), JSON.stringify(history.slice(-MAX_HISTORY))); } catch { /* 保存不可でも動作する */ } }

function scrollDown() { els.log.scrollTop = els.log.scrollHeight; }

function bubble(role, text = "") {
  const d = document.createElement("div");
  d.className = `msg ${role}`;
  if (role === "user") d.textContent = text; else d.innerHTML = renderMarkdown(text);
  els.msgs.append(d);
  return d;
}

function renderAll() {
  els.msgs.replaceChildren();
  document.title = `${guide.name} | ローカルLLM構築ガイド`;
  const intro = document.createElement("div");
  intro.className = "intro";
  intro.innerHTML = `<h2></h2><p></p><div class="examples" role="group" aria-label="質問例"></div>`;
  intro.querySelector("h2").textContent = `${guide.verb}: ${guide.name}`;
  intro.querySelector("p").textContent = `${guide.role}。` + guide.desc;
  for (const q of guide.examples) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = q;
    b.addEventListener("click", () => submit(q));
    intro.querySelector(".examples").append(b);
  }
  els.msgs.append(intro);
  for (const m of history) bubble(m.role, m.content);
  scrollDown();
}

function renderTabs() {
  els.tabs.replaceChildren();
  for (const g of GUIDES) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tab"; b.role = "tab";
    b.textContent = g.verb; b.title = g.name;
    b.setAttribute("aria-selected", String(g.id === guide.id));
    b.addEventListener("click", () => switchGuide(g));
    els.tabs.append(b);
  }
}

function switchGuide(g) {
  if (controller) controller.abort();
  guide = g;
  load();
  const u = new URL(location.href); u.searchParams.set("guide", g.id);
  window.history.replaceState(null, "", u);
  renderTabs(); renderAll();
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function setBusy(busy) {
  els.send.hidden = busy; els.stop.hidden = !busy; els.input.disabled = busy;
  els.status.textContent = busy ? "回答を生成中…" : "";
  if (!busy) els.input.focus();
}

async function submit(text) {
  text = text.trim();
  if (!text || controller) return;
  history.push({ role: "user", content: text });
  bubble("user", text);
  els.input.value = ""; autosize();
  const view = bubble("assistant");
  view.classList.add("cursor");
  scrollDown();
  setBusy(true);

  controller = new AbortController();
  let answer = "", failed = false, raf = 0;
  const paint = () => { raf = 0; view.innerHTML = renderMarkdown(answer); scrollDown(); };
  try {
    const body = JSON.stringify({ guide: guide.id, messages: history.slice(-MAX_HISTORY) });
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // CloudFront OAC が Lambda Function URL へ POST する際に必須のペイロードハッシュ
        "x-amz-content-sha256": await sha256Hex(body),
      },
      body, signal: controller.signal,
    });
    if (!res.ok || !res.body) throw Object.assign(new Error(`HTTP ${res.status}`), { http: res.status });

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const ev = JSON.parse(line.slice(6));
        if (ev.type === "delta") { answer += ev.text; if (!raf) raf = requestAnimationFrame(paint); }
        else if (ev.type === "error") { failed = true; answer = ev.message; }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") answer += answer ? "\n\n(停止しました)" : "(停止しました)";
    else {
      failed = true;
      answer = err.http === 429 || err.http === 403
        ? "アクセスが集中しているか、短時間にリクエストが多すぎます。少し待ってからお試しください。"
        : "通信に失敗しました。ネットワークを確認して、もう一度お試しください。";
    }
  } finally {
    if (raf) cancelAnimationFrame(raf);
    view.classList.remove("cursor");
    view.innerHTML = renderMarkdown(answer);
    if (failed) { view.classList.add("error"); history.pop(); }
    else if (answer) history.push({ role: "assistant", content: answer.replace(/\n\n\(停止しました\)$/, "") });
    save();
    controller = null;
    setBusy(false);
    scrollDown();
  }
}

function autosize() {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(els.input.scrollHeight, 160)}px`;
  els.count.textContent = `${[...els.input.value].length} / 4000`;
}

els.form.addEventListener("submit", (e) => { e.preventDefault(); submit(els.input.value); });
els.input.addEventListener("input", autosize);
els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) { e.preventDefault(); submit(els.input.value); }
});
els.stop.addEventListener("click", () => controller?.abort());
els.reset.addEventListener("click", () => { if (controller) controller.abort(); history = []; save(); renderAll(); });

load(); renderTabs(); renderAll();
