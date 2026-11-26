// ARK Proof Kit (website version). Runs entirely in the browser; records stay in this browser's local storage.
import { CONSENT_ANCHOR, CONSENT_CREDENTIAL, CONTRACT_SOURCE, CRITERIA, DEMO_KEY, MODULES, calldata, commit, fingerprintFiles,
  fromHex, generateSigningKey, issueCredential, merkleRoot, readCredential, readKeyFile, toHex, walletLink } from "./proof.js";
import { encodeQR } from "./qr.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const day = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const short = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;
const scan = (kind, v) => `https://sepolia.etherscan.io/${kind}/${v}`;
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const TXRE = /^0x[0-9a-fA-F]{64}$/;
const pad = (n) => String(n).padStart(4, "0");

const DEMO_HASH = "81d0081c38767905e3582b8452b2a92df0df1118352eab98bee4740708cc4380";
const DEMO_ENTRY = { hash: DEMO_HASH, pub: DEMO_KEY.pub, status: "active", createdAt: Date.UTC(2026, 10, 26), demo: true };
const DEMO_SIGNER = { hash: DEMO_HASH, pub: DEMO_KEY.pub, priv: DEMO_KEY.priv };
const REASONS = ["Parent withdrew consent", "Issued in error", "Replaced by a new credential"];
const STORE = "ark-proof-kit";

// ---------- state ----------
const fresh = () => ({ keys: [DEMO_ENTRY], ledger: [], batches: [], contract: "", chainTx: {} });
let S;
try { S = { ...fresh(), ...JSON.parse(localStorage.getItem(STORE) || "{}") }; } catch { S = fresh(); }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { /* private mode: keep in memory */ } };
const activeKey = () => S.keys.find((k) => k.status === "active") || DEMO_ENTRY;
let signer = activeKey().demo ? DEMO_SIGNER : null;
let files = [];
let print = null;
let lastCode = "";
let findCommitment = null;

// ---------- small helpers ----------
function say(msg) {
  const el = $("#pk-toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(say.t); say.t = setTimeout(() => { el.hidden = true; }, 4000);
}
async function copyText(text, what) {
  try { await navigator.clipboard.writeText(text); say(`${what} copied`); }
  catch { say("Copy was blocked. Select the text and copy it by hand."); }
}
function download(name, blob) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function ribbon(bytes, height = 40, label = "Fingerprint ribbon") {
  const arr = Array.from(bytes).slice(0, 32);
  const fill = ["var(--pk-a)", "var(--pk-b)", "var(--pk-c)", "var(--pk-d)"];
  const bars = arr.map((b, i) => {
    const h = height * (0.35 + 0.65 * ((b & 0x3f) / 63));
    return `<rect x="${i * 10}" y="${(height - h).toFixed(2)}" width="8.5" height="${h.toFixed(2)}" rx="1.5" fill="${fill[b >> 6]}"/>`;
  }).join("");
  return `<svg class="pk-ribbon" viewBox="0 0 ${arr.length * 10} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}" style="height:${height}px">${bars}</svg>`;
}
function qr(text, size = 196, label = "QR code") {
  const m = encodeQR(text); const n = m.length; const q = 4; let d = "";
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + q} ${y + q}h1v1h-1z`; }));
  return `<svg viewBox="0 0 ${n + q * 2} ${n + q * 2}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#1c1a14"/></svg>`;
}
function wireDrop(zone, onFiles) {
  const input = $("input[type=file]", zone);
  $("button", zone).addEventListener("click", () => input.click());
  input.addEventListener("change", () => { onFiles([...input.files]); input.value = ""; });
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("over"); onFiles([...e.dataTransfer.files]); });
}

// ---------- tabs ----------
function show(tab) {
  $$(".pk-tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  $$(".pk-panel").forEach((p) => { p.hidden = p.id !== `tab-${tab}`; });
  if (tab !== "eth") findCommitment = null;
  if (tab === "sign") updateSign();
  if (tab === "verify" && lastCode && !$("#code").value) { $("#code").value = lastCode; runVerify(); }
  if (tab === "keys") renderKeys();
  if (tab === "eth") renderEth();
}
$$(".pk-tab").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
document.addEventListener("click", (e) => { const go = e.target.closest("[data-go]"); if (go) show(go.dataset.go); });

function updateBadge() {
  const n = S.ledger.filter((e) => !e.batch && !e.revoked && e.consent & CONSENT_ANCHOR).length;
  const b = $("#eth-badge"); b.textContent = n; b.hidden = n === 0;
}

// ---------- 1. sign ----------
$("#criteria").innerHTML = CRITERIA.map((c, i) =>
  `<label class="pk-row"><input type="checkbox" data-crit="${i}" ${i < 4 ? "checked" : ""}> <span>${esc(c)}</span></label>`).join("");
$("#module").innerHTML = MODULES.map((m, i) => `<option value="${i}" ${i === 6 ? "selected" : ""}>${esc(m)}</option>`).join("");

function signState() {
  const mask = $$("[data-crit]").reduce((m, el) => (el.checked ? m | (1 << Number(el.dataset.crit)) : m), 0);
  const k = activeKey();
  const steps = {
    key: !!signer && signer.hash === k.hash,
    consent: $("#consent").checked && $("#consent-ref").value.trim().length > 0,
    files: !!print,
    rubric: mask > 0,
    revision: $("#rev").checked,
    facilitator: $("#fac").checked,
  };
  return { mask, steps, done: Object.values(steps).filter(Boolean).length };
}
function updateSign() {
  const { steps, done } = signState();
  const k = activeKey();
  $$("#sign-list > li").forEach((li, i) => {
    const ok = steps[li.dataset.step];
    li.classList.toggle("done", ok);
    $(".pk-dot", li).innerHTML = ok ? "&#10003;" : String(i + 1);
  });
  $("#sign-bar").style.width = `${(done / 6) * 100}%`;
  $("#sign-count").textContent = `${done} of 6 done`;
  const btn = $("#sign-btn");
  btn.disabled = done < 6;
  btn.textContent = done < 6 ? `Sign credential · ${6 - done} left` : "Sign credential";
  $("#key-hint").textContent = steps.key
    ? `Signing with key ${k.hash.slice(0, 8)}${k.demo ? " (public demo key)" : ""}.`
    : "The active key isn’t loaded in this browser. Load its backup file under Keys.";
  const go = $("#key-go");
  go.hidden = steps.key && !k.demo;
  go.textContent = steps.key ? "Replace the demo key before real use" : "Load or replace the key";
}
const clearCert = () => { $("#cert-area").innerHTML = ""; $("#cert-area").append($("#cert-empty").content.cloneNode(true)); };
["#consent", "#anchor-ok", "#rev", "#fac", "#module"].forEach((s) => $(s).addEventListener("change", () => { if (s !== "#rev" && s !== "#fac") clearCert(); updateSign(); }));
$("#criteria").addEventListener("change", () => { clearCert(); updateSign(); });
$("#consent-ref").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^\w-]/g, "").toUpperCase().slice(0, 12); updateSign(); });
["#pod", "#mentor"].forEach((s) => $(s).addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); }));

async function setFiles(next) {
  files = next; clearCert();
  print = files.length ? await fingerprintFiles(files) : null;
  $("#file-list").innerHTML = files.map((f, i) =>
    `<li><span>${esc(f.name)}</span><span><code>${print ? toHex(print.perFile[i].hash).slice(0, 10) : "…"}</code><button type="button" class="pk-x" data-rm="${i}" aria-label="Remove ${esc(f.name)}">×</button></span></li>`).join("");
  updateSign();
}
$("#file-list").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) setFiles(files.filter((_, i) => i !== Number(b.dataset.rm))); });
wireDrop($("#drop"), (inc) => setFiles([...files, ...inc.filter((f) => !files.some((g) => g.name === f.name && g.size === f.size))]));

function certificate(c, demo) {
  return `<article class="pk-cert" id="certificate">
    <header><b>ARK Learning Lab</b><span>Prototype</span></header>
    <div class="pk-cert-body">
      <div>
        <p class="pk-kicker">Module complete</p>
        <h3>${esc(c.module)}</h3>
        <ul class="pk-ticks">${c.criteria.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>
        <p class="pk-hand">Learner (write by hand)</p>
        <dl>
          <div><dt>Issued</dt><dd>${day(c.issuedAt)}</dd></div>
          <div><dt>Pod</dt><dd><code>P-${pad(c.pod)}</code></dd></div>
          <div><dt>Mentor</dt><dd><code>M-${pad(c.mentor)}</code></dd></div>
          <div><dt>Key</dt><dd><code>${c.signerHash.slice(0, 8)}${demo ? " demo" : ""}</code></dd></div>
        </dl>
        <p>Parent consent recorded · ${c.consent & CONSENT_ANCHOR ? "anonymous fingerprint may join an Ethereum batch" : "kept off-chain"}</p>
      </div>
      <figure>${qr(c.code, 196, "Credential QR code")}<figcaption>Scan, then paste into ARK Verify</figcaption></figure>
    </div>
    <footer><p class="pk-kicker">Portfolio fingerprint</p>${ribbon(c.commitment, 40, "Portfolio fingerprint ribbon")}</footer>
  </article>
  <div class="pk-actions no-print">
    <button type="button" class="btn line" id="print-btn">Print</button>
    <button type="button" class="btn line" id="copy-btn">Copy code</button>
  </div>
  <p class="pk-code no-print" id="credential-code">${esc(c.code)}</p>`;
}

$("#sign-btn").addEventListener("click", async () => {
  const { mask, done } = signState();
  if (done < 6) return;
  const btn = $("#sign-btn"); btn.disabled = true;
  const anchorOk = $("#anchor-ok").checked;
  const c = await issueCredential({
    moduleIndex: Number($("#module").value), criteriaMask: mask,
    consent: CONSENT_CREDENTIAL | (anchorOk ? CONSENT_ANCHOR : 0), bundle: print.bundle,
    pod: Number($("#pod").value || 0), mentor: Number($("#mentor").value || 0), signer,
  });
  lastCode = c.code; $("#code").value = "";
  S.ledger.push({ commitment: toHex(c.commitment), module: c.module, issuedAt: c.issuedAt.getTime(), consent: c.consent,
    consentRef: $("#consent-ref").value.trim(), signerHash: c.signerHash, batch: null, revoked: null });
  save(); updateBadge();
  $("#cert-area").innerHTML = certificate(c, activeKey().demo);
  $("#print-btn").addEventListener("click", () => window.print());
  $("#copy-btn").addEventListener("click", () => copyText(c.code, "Credential code"));
  btn.disabled = false;
  say(anchorOk ? "Signed. Its fingerprint joined the next Ethereum batch." : "Signed. Kept off-chain, as the parent chose.");
});

// ---------- 2. verify ----------
let verified = null;
async function runVerify() {
  const out = $("#verify-out");
  const r = await readCredential($("#code").value);
  verified = null; $("#vfile").hidden = true; $("#vfile-out").innerHTML = "";
  if (!$("#code").value.trim()) { out.innerHTML = ""; return; }
  if (!r.ok) { out.innerHTML = `<div class="pk-result bad"><h3>Can’t read this code</h3><p>${esc(r.reason)}</p></div>`; return; }
  const key = r.signatureValid ? S.keys.find((k) => k.hash === r.signerHash) : null;
  const keyOk = key && (key.status === "active" || r.issuedAt.getTime() <= key.retiredAt);
  const rec = S.ledger.find((e) => e.commitment === toHex(r.commitment));
  const revoked = r.signatureValid && rec?.revoked;
  const good = r.signatureValid && keyOk && !revoked;
  const head = !r.signatureValid ? "Signature does not match" : revoked ? "Revoked" : !key ? "Signed by a key this browser doesn’t know"
    : !keyOk ? "Signed after its key was retired" : "Signed by ARK, unaltered";
  let body = "";
  if (!r.signatureValid) body = "<p>Someone changed this code after it was signed, or it wasn’t signed with an ARK key. Treat it as invalid.</p>";
  else {
    if (revoked) body += `<p class="pk-bad">${esc(revoked.reason)} · ${day(revoked.at)}. Treat it as withdrawn.</p>`;
    if (!key) body += `<p>The maths checks out, but key ${r.signerHash.slice(0, 8)} isn’t in this browser’s registry. Check it on Ethereum below before trusting it.</p>`;
    if (key && !keyOk) body += `<p class="pk-bad">Key ${key.hash.slice(0, 8)} was retired before this was signed.</p>`;
    body += `<p>Key <code>${r.signerHash.slice(0, 8)}</code>${key?.demo ? " (public demo key)" : ""}${key?.status === "retired" ? " · since retired" : ""} · ${r.consent & CONSENT_ANCHOR ? "parent allowed an Ethereum batch" : "parent chose off-chain only"}</p>
      <p><b>${esc(r.module)}</b> · issued ${day(r.issuedAt)} · pod P-${pad(r.pod)} · mentor M-${pad(r.mentor)}</p>
      <ul class="pk-ticks">${r.criteria.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>
      <p class="pk-kicker">Fingerprint on the certificate</p>${ribbon(r.commitment, 36)}
      <details class="pk-details"><summary>Check on Ethereum</summary>
        <p>In Remix, load the registry${S.contract ? ` (<a href="${scan("address", S.contract)}" target="_blank" rel="noopener">${short(S.contract)}</a>)` : ""} at its address and call these read-only functions. Zero means no.</p>
        <p><code>activeKey(0x${r.signerHash})</code></p><p><code>revokedAt(0x${toHex(r.commitment)})</code></p>
      </details>
      <p><button type="button" class="pk-link" id="find-batch">Was it anchored on Ethereum? Check its batch</button></p>`;
  }
  out.innerHTML = `<div class="pk-result ${good ? "good" : "bad"}" id="verify-result"><h3>${head}</h3>${body}</div>`;
  if (r.signatureValid) {
    verified = r;
    $("#find-batch").addEventListener("click", () => { findCommitment = toHex(r.commitment); show("eth"); findCommitment = toHex(r.commitment); renderEth(); });
    $("#vfile").hidden = !!revoked;
  }
}
$("#verify-btn").addEventListener("click", runVerify);
$("#code").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runVerify(); } });
wireDrop($("#vdrop"), async (list) => {
  if (!verified || !list.length) return;
  const { bundle } = await fingerprintFiles(list);
  const mine = await commit(verified.salt, bundle);
  const match = toHex(mine) === toHex(verified.commitment);
  $("#vfile-out").innerHTML = `<div class="pk-result ${match ? "good" : "bad"}" id="file-check">
    <h3>${match ? "These are the signed files" : "These files don’t match"}</h3>
    <p>${match ? "Same content as when ARK signed it, even if the files were renamed." : "Something was changed, added or left out. Check that every file in the bundle is here."}</p>
    <p class="pk-kicker">Your files</p>${ribbon(mine, 36, "Your files ribbon")}</div>`;
});

// ---------- 3. keys and revocation ----------
function statusOf(e) {
  if (e.revoked) return ["Revoked", "bad"];
  if (e.batch) return ["Anchored", "good"];
  if (e.consent & CONSENT_ANCHOR) return ["Waiting for batch", ""];
  return ["Off-chain only", ""];
}
function addActiveKey(k, createdAt) {
  const now = Date.now();
  S.keys = [...S.keys.map((x) => (x.status === "active" ? { ...x, status: "retired", retiredAt: now } : x)), { hash: k.hash, pub: k.pub, status: "active", createdAt }];
  save();
}
const keyFile = (k, createdAt) => new Blob([JSON.stringify({ kind: "ark-signing-key", createdAt, pub: k.pub, priv: k.priv }, null, 2)], { type: "application/json" });

function renderKeys() {
  const k = activeKey(); const ready = signer && signer.hash === k.hash;
  const retired = S.keys.filter((x) => x.status === "retired");
  $("#keys-out").innerHTML = `
    <h2>Signing keys</h2>
    <div class="pk-key ${k.demo ? "demo" : ""}">
      <div><p class="pk-kicker">Active key</p><p class="pk-big" id="active-key">${k.hash.slice(0, 8)}${k.demo ? " · public demo key" : ""}</p>
      <p>${k.demo ? "Anyone can sign with this key, so its credentials prove nothing. Replace it before signing real work."
        : `In use since ${day(k.createdAt)}. ${ready ? "Loaded in this browser." : "Not loaded here: load its backup file to sign."}`}</p></div>
      <div class="pk-actions">
        <button type="button" class="btn" id="replace-key">Replace with a new key</button>
        ${ready && !k.demo ? `<button type="button" class="btn line" id="backup-key">Backup file</button>` : ""}
        <button type="button" class="btn line" id="load-key">Load key file</button>
        <input type="file" id="key-file" accept=".json,application/json" hidden>
      </div>
    </div>
    <p class="pk-hint">A new key is made in this browser and downloaded as a backup file. Its private half is never sent anywhere or saved by this page; after a reload, load the file again. Replacing a key retires the old one: credentials it signed before that day stay valid.</p>
    ${retired.length ? `<ul class="pk-list">${retired.map((x) => `<li><code>${x.hash.slice(0, 8)}${x.demo ? " demo" : ""}</code><span>Retired ${day(x.retiredAt)}</span></li>`).join("")}</ul>` : ""}
    <h2>Issued in this browser</h2>
    <p class="pk-hint">Revoke when a parent withdraws consent or a credential was wrong. A revoked credential leaves any waiting batch. If it was already anchored, the Ethereum checklist adds a revocation to publish.</p>
    ${S.ledger.length ? `<ul class="pk-list" id="issued-list">${[...S.ledger].reverse().map((e) => {
      const [label, tone] = statusOf(e);
      return `<li class="pk-issued"><div><p><b>${esc(e.module)}</b> <span class="pk-badge ${tone}">${label}</span></p>
        <p class="pk-hint">${day(e.issuedAt)} · consent ${esc(e.consentRef)} · fingerprint <code>${e.commitment.slice(0, 10)}</code> · key <code>${e.signerHash.slice(0, 8)}</code></p>
        ${e.revoked ? `<p class="pk-bad">${esc(e.revoked.reason)} · ${day(e.revoked.at)}</p>` : ""}</div>
        ${e.revoked ? "" : `<div class="pk-revoke" data-c="${e.commitment}"><button type="button" class="btn line" data-open>Revoke</button>
          <span hidden><select aria-label="Reason for revoking">${REASONS.map((r) => `<option>${r}</option>`).join("")}</select>
          <button type="button" class="btn danger" data-confirm>Confirm revoke</button><button type="button" class="pk-link" data-cancel>Cancel</button></span></div>`}
      </li>`;
    }).join("")}</ul>` : `<p class="pk-empty-line">Nothing signed yet.</p>`}`;

  $("#replace-key").addEventListener("click", async () => {
    const nk = await generateSigningKey(); const at = Date.now();
    addActiveKey(nk, at); signer = nk;
    download(`ark-signing-key-${nk.hash.slice(0, 8)}.json`, keyFile(nk, at));
    renderKeys(); say(`New key ${nk.hash.slice(0, 8)} is active. Keep the backup file somewhere offline.`);
  });
  $("#backup-key")?.addEventListener("click", () => download(`ark-signing-key-${signer.hash.slice(0, 8)}.json`, keyFile(signer, k.createdAt)));
  $("#load-key").addEventListener("click", () => $("#key-file").click());
  $("#key-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const lk = await readKeyFile(await f.text());
      if (!S.keys.some((x) => x.hash === lk.hash)) addActiveKey(lk, lk.createdAt || Date.now());
      signer = lk; renderKeys(); say(`Key ${lk.hash.slice(0, 8)} loaded in this browser`);
    } catch (err) { say(err.message || "That file isn’t a usable key"); }
  });
  $$(".pk-revoke").forEach((box) => {
    const panel = $("span", box);
    $("[data-open]", box).addEventListener("click", (e) => { e.target.hidden = true; panel.hidden = false; });
    $("[data-cancel]", box).addEventListener("click", () => { panel.hidden = true; $("[data-open]", box).hidden = false; });
    $("[data-confirm]", box).addEventListener("click", () => {
      const reason = $("select", box).value;
      S.ledger = S.ledger.map((e) => (e.commitment === box.dataset.c ? { ...e, revoked: { reason, at: Date.now() } } : e));
      save(); updateBadge(); renderKeys(); say("Credential revoked");
    });
  });
}

// ---------- 4. Ethereum checklist ----------
function txStep({ id, fn, args, data, recorded, label }) {
  if (recorded) return `<p>Sent: <a href="${scan("tx", recorded)}" target="_blank" rel="noopener">${short(recorded)} on Sepolia Etherscan</a></p>`;
  const link = S.contract ? walletLink(S.contract, fn, args) : "";
  return `<div class="pk-tx" data-id="${id}">
    <p class="pk-hint">Send 0 ETH to the registry from the issuer wallet with this data, or call <code>${fn}</code> in Remix.</p>
    <div class="pk-codeline"><code>${data}</code><button type="button" class="btn sun" data-copy="${data}" aria-label="Copy ${esc(label)} data">Copy</button></div>
    ${link ? `<details class="pk-details"><summary>Phone wallet QR</summary><div class="pk-wallet">${qr(link, 220, "Wallet link QR code")}<p class="pk-hint">For wallets that read EIP-681 contract calls on Sepolia. If yours doesn’t, use the data above in Remix.</p></div></details>` : ""}
    <div class="pk-codeline"><input aria-label="${esc(label)} transaction hash" placeholder="Transaction hash 0x…"><button type="button" class="btn sun" data-record ${S.contract ? "" : "disabled"}>Record</button></div>
  </div>`;
}
const item = (n, done, title, hint, inner = "") =>
  `<li class="${done ? "done" : ""}"><span class="pk-dot">${done ? "&#10003;" : n}</span><div><h3>${title}</h3>${hint ? `<p class="pk-hint">${hint}</p>` : ""}${inner}</div></li>`;

async function renderEth() {
  const k = activeKey();
  const batchable = S.ledger.filter((e) => !e.batch && !e.revoked && e.consent & CONSENT_ANCHOR);
  const offChain = S.ledger.filter((e) => !e.batch && !e.revoked && !(e.consent & CONSENT_ANCHOR)).length;
  const toRetire = S.keys.filter((x) => x.status === "retired" && S.chainTx[`key:${x.hash}:on`] && !S.chainTx[`key:${x.hash}:off`]);
  const toPublish = S.ledger.filter((e) => e.revoked && e.batch && !S.chainTx[`revoke:${e.commitment}`]);
  const keyOn = !!S.chainTx[`key:${k.hash}:on`];
  const root = await merkleRoot(batchable.map((e) => e.commitment));
  const items = [!!S.contract, keyOn, toRetire.length === 0, batchable.length === 0, toPublish.length === 0];
  const done = items.filter(Boolean).length;

  let lookup = "";
  if (findCommitment) {
    const f = S.ledger.find((e) => e.commitment === findCommitment);
    const fb = f?.batch && S.batches.find((b) => b.root === f.batch);
    lookup = `<div class="callout" id="batch-lookup"><p>${!f ? "<b>Not in this browser’s records.</b> Ask the issuing pod for the batch holding this fingerprint."
      : f.revoked ? `<b>Revoked:</b> ${esc(f.revoked.reason)}.` : fb ? `<b>Anchored in batch ${short("0x" + fb.root)}.</b> <a href="${scan("tx", fb.tx)}" target="_blank" rel="noopener">See it on Sepolia Etherscan</a>`
      : f.consent & CONSENT_ANCHOR ? "<b>Waiting for the next batch.</b>" : "<b>Kept off-chain at the parent’s request.</b>"}</p></div>`;
  }

  $("#eth-out").innerHTML = `${lookup}
  <div class="pk-dark">
    <p class="pk-kicker sun">Ethereum Sepolia · stand-in for Liberland Blockchain V2</p>
    <h2>Ethereum checklist</h2>
    <p>Only 32-byte values reach the chain: batch roots, revoked fingerprints and key hashes. No names, files, scores or children’s wallets.</p>
    <div class="pk-progress"><span><i style="width:${(done / 5) * 100}%"></i></span><b>${done} of 5 done</b></div>
    <ol class="pk-check">
      ${item(1, !!S.contract, "Deploy the registry contract", "Once. Paste it into Remix, connect a wallet with free Sepolia test ETH, deploy, then save the address.",
        `<div class="pk-actions"><button type="button" class="btn sun" id="copy-contract">Copy contract</button><a class="btn sun" href="https://remix.ethereum.org" target="_blank" rel="noopener">Open Remix</a></div>
         <details class="pk-details"><summary>Read the contract</summary><pre>${esc(CONTRACT_SOURCE)}</pre></details>
         <label class="pk-label" for="addr">Registry address</label>
         <div class="pk-codeline"><input id="addr" value="${esc(S.contract)}" placeholder="0x…"><button type="button" class="btn sun" id="save-addr">Save</button></div>
         ${S.contract ? `<p><a href="${scan("address", S.contract)}" target="_blank" rel="noopener">View ${short(S.contract)} on Sepolia Etherscan</a></p>` : ""}`)}
      ${item(2, keyOn, `Register signing key ${k.hash.slice(0, 8)}`, k.demo ? "This is the public demo key. Replace it under Keys first, unless this is only a rehearsal." : "Lets anyone confirm on Ethereum that this key belongs to ARK.",
        txStep({ id: `key:${k.hash}:on`, fn: "setKey", label: "Register key", args: [["bytes32", "0x" + k.hash], ["bool", "true"]], data: calldata.setKey(k.hash, true), recorded: S.chainTx[`key:${k.hash}:on`] }))}
      ${item(3, toRetire.length === 0, "Retire replaced keys", toRetire.length ? "Mark old keys inactive so new credentials can’t be signed with them." : "Nothing to retire.",
        toRetire.map((x) => `<div class="pk-sub"><p><code>Key ${x.hash.slice(0, 8)}</code></p>${txStep({ id: `key:${x.hash}:off`, fn: "setKey", label: `Retire key ${x.hash.slice(0, 8)}`, args: [["bytes32", "0x" + x.hash], ["bool", "false"]], data: calldata.setKey(x.hash, false) })}</div>`).join(""))}
      ${item(4, batchable.length === 0, batchable.length ? `Anchor ${batchable.length} consented credential${batchable.length > 1 ? "s" : ""}` : "Anchor the batch",
        `${batchable.length ? "Folded into one root." : "Nothing waiting."}${offChain ? ` ${offChain} kept off-chain because the parent didn’t opt in.` : ""}`,
        root && batchable.length ? `${ribbon(fromHex(root), 40, "Batch root ribbon")}<div class="pk-codeline"><code id="batch-root">0x${root}</code></div>${txStep({ id: `batch:${root}`, fn: "anchorBatch", label: "Anchor batch", args: [["bytes32", "0x" + root]], data: calldata.anchorBatch(root) })}` : "")}
      ${item(5, toPublish.length === 0, "Publish revocations", toPublish.length ? "These were anchored before being revoked, so the public record needs to say so." : "Nothing to publish. Revoked credentials that never reached the chain stay off it.",
        toPublish.map((e) => `<div class="pk-sub"><p>${esc(e.module)} · ${esc(e.revoked.reason)}</p>${txStep({ id: `revoke:${e.commitment}`, fn: "revoke", label: "Publish revocation", args: [["bytes32", "0x" + e.commitment]], data: calldata.revoke(e.commitment) })}</div>`).join(""))}
    </ol>
  </div>
  ${S.batches.length ? `<h2>Anchored batches</h2><ul class="pk-list">${S.batches.map((b) => {
    const n = S.ledger.filter((e) => e.batch === b.root).length;
    return `<li><div><code>${short("0x" + b.root)}</code><p class="pk-hint">${n} credential${n === 1 ? "" : "s"} · ${day(b.at)}</p></div><a class="btn line" href="${scan("tx", b.tx)}" target="_blank" rel="noopener">Transaction</a></li>`;
  }).join("")}</ul>` : ""}
  ${S.ledger.length || S.contract ? `<p><button type="button" class="pk-link" id="reset">Clear this browser’s demo records</button></p>` : ""}`;

  $("#copy-contract").addEventListener("click", () => copyText(CONTRACT_SOURCE, "Contract source"));
  $("#save-addr").addEventListener("click", () => {
    const v = $("#addr").value.trim();
    if (!ADDR.test(v)) return say("That isn’t an Ethereum address (0x followed by 40 characters).");
    S.contract = v; save(); renderEth(); say("Registry saved");
  });
  $$("[data-copy]", $("#eth-out")).forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy, "Call data")));
  $$(".pk-tx", $("#eth-out")).forEach((box) => $("[data-record]", box).addEventListener("click", () => {
    const tx = $("input", box).value.trim();
    if (!TXRE.test(tx)) return say("That isn’t a transaction hash (0x followed by 64 characters).");
    const id = box.dataset.id;
    if (id.startsWith("batch:")) {
      const r = id.slice(6); const members = batchable.map((e) => e.commitment);
      S.ledger = S.ledger.map((e) => (members.includes(e.commitment) ? { ...e, batch: r } : e));
      S.batches = [{ root: r, tx, at: Date.now() }, ...S.batches];
    } else S.chainTx = { ...S.chainTx, [id]: tx };
    save(); updateBadge(); renderEth(); say("Transaction recorded");
  }));
  $("#reset")?.addEventListener("click", () => {
    if (!confirm("Clear every record, key entry and registry address saved in this browser?")) return;
    S = fresh(); save(); signer = DEMO_SIGNER; updateBadge(); renderEth(); say("Demo records cleared");
  });
}

updateSign();
updateBadge();
