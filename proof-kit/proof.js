// ARK Proof Kit: fingerprints, signed credentials, consent flags, key rotation and Ethereum call data.
// Everything runs in the browser. PROTOTYPE: the demo key below is public; replace it before any real use.
export const DEMO_KEY = {"priv":{"key_ops":["sign"],"ext":true,"kty":"EC","x":"HZFtiSPROCHn0TsxtiMqZkcgbzFBLVNR5E95-fJAXZ0","y":"8Z1xTItfh2IPqkmb8DAWiwx3uHmiecAK7Tz5HxGhDnI","crv":"P-256","d":"lRS_DMJFyUa2t7cs0ECZYEHymMDWWOlDsbkwsL9fMSo"},"pub":{"key_ops":["verify"],"ext":true,"kty":"EC","x":"HZFtiSPROCHn0TsxtiMqZkcgbzFBLVNR5E95-fJAXZ0","y":"8Z1xTItfh2IPqkmb8DAWiwx3uHmiecAK7Tz5HxGhDnI","crv":"P-256"}};

export const MODULES = ["Privacy", "Data", "Code", "AI", "City design", "Governance", "LIBERVERSE Capstone"];
export const CRITERIA = [
  "Question and system map",
  "Evidence with limits named",
  "Prototype or code reviewed",
  "Revision recorded and acted on",
  "Final pitch explained",
];
export const CONSENT_CREDENTIAL = 1; // parent/guardian agreed to the credential being issued
export const CONSENT_ANCHOR = 2; // parent/guardian also agreed to the anonymous fingerprint joining an Ethereum batch
export const SEPOLIA_CHAIN_ID = 11155111;

const SELECTORS = {
  anchorBatch: "75b4f5f6", revoke: "b75c7dc6", setKey: "9a18143e",
  anchoredAt: "9591a610", revokedAt: "098787ce", activeKey: "c8412fb6",
};
const PREFIX = "ARK2.";
const BODY_LEN = 124; // version, module, criteria, consent, time(4), salt(16), commitment(32), pod(2), mentor(2), public key(64)
const ALGO = { name: "ECDSA", namedCurve: "P-256" };
const SIG = { name: "ECDSA", hash: "SHA-256" };

export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
export const fromHex = (hex) => new Uint8Array(hex.replace(/^0x/, "").match(/../g).map((h) => parseInt(h, 16)));
const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; parts.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
};
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const rawPub = (jwk) => concat(unb64url(jwk.x), unb64url(jwk.y));
const pubJwkFromRaw = (raw) => ({ kty: "EC", crv: "P-256", x: b64url(raw.slice(0, 32)), y: b64url(raw.slice(32, 64)), ext: true });

/** The on-chain name of a key: SHA-256 of its raw public key. The first 8 hex characters are its short id. */
export const keyHash = async (pubJwk) => toHex(await sha256(rawPub(pubJwk)));

export async function generateSigningKey() {
  const pair = await crypto.subtle.generateKey(ALGO, true, ["sign", "verify"]);
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { priv, pub: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y, ext: true }, hash: await keyHash(pub) };
}

/** Validate a key backup file and return its parts. */
export async function readKeyFile(text) {
  const data = JSON.parse(text);
  if (data?.kind !== "ark-signing-key" || !data.priv?.d || !data.pub?.x) throw new Error("Not an ARK signing key file");
  const hash = await keyHash(data.pub);
  await crypto.subtle.importKey("jwk", data.priv, ALGO, false, ["sign"]);
  return { priv: data.priv, pub: data.pub, hash, createdAt: data.createdAt };
}

export async function fingerprintFiles(files) {
  const perFile = await Promise.all(
    files.map(async (f) => ({ name: f.name, size: f.size, hash: await sha256(new Uint8Array(await f.arrayBuffer())) })),
  );
  const sorted = perFile.map((p) => p.hash).sort((a, b) => (toHex(a) < toHex(b) ? -1 : 1));
  return { perFile, bundle: await sha256(concat(...sorted)) };
}

export const commit = async (salt, bundle) => sha256(concat(salt, bundle));

export async function issueCredential({ moduleIndex, criteriaMask, consent, bundle, pod, mentor, signer }) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const commitment = await commit(salt, bundle);
  const body = new Uint8Array(BODY_LEN);
  const view = new DataView(body.buffer);
  body[0] = 2; body[1] = moduleIndex; body[2] = criteriaMask; body[3] = consent;
  view.setUint32(4, Math.floor(Date.now() / 1000));
  body.set(salt, 8); body.set(commitment, 24);
  view.setUint16(56, pod); view.setUint16(58, mentor);
  body.set(rawPub(signer.pub), 60);
  const key = await crypto.subtle.importKey("jwk", signer.priv, ALGO, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign(SIG, key, body));
  return { code: PREFIX + b64url(concat(body, sig)), ...(await decodeBody(body)), signatureValid: true };
}

async function decodeBody(body) {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const pub = pubJwkFromRaw(body.slice(60, 124));
  return {
    version: body[0],
    moduleIndex: body[1],
    module: MODULES[body[1]] ?? "Unknown module",
    criteriaMask: body[2],
    criteria: CRITERIA.filter((_, i) => body[2] & (1 << i)),
    consent: body[3],
    issuedAt: new Date(view.getUint32(4) * 1000),
    salt: body.slice(8, 24),
    commitment: body.slice(24, 56),
    pod: view.getUint16(56),
    mentor: view.getUint16(58),
    signerPub: pub,
    signerHash: await keyHash(pub),
  };
}

/** Read a credential code and check its signature. Never throws. */
export async function readCredential(input) {
  const code = (input || "").trim().replace(/\s+/g, "");
  if (code.startsWith("ARK1.")) return { ok: false, reason: "This is a code from the first prototype. Sign it again to get a current ARK2 code." };
  if (!code.startsWith(PREFIX)) return { ok: false, reason: "This doesn't look like an ARK credential code. It should start with ARK2." };
  let bytes;
  try { bytes = unb64url(code.slice(PREFIX.length)); } catch { return { ok: false, reason: "The code is damaged or incomplete." }; }
  if (bytes.length !== BODY_LEN + 64) return { ok: false, reason: "The code is the wrong length. Check that it was copied in full." };
  const body = bytes.slice(0, BODY_LEN);
  const decoded = await decodeBody(body);
  let signatureValid = false;
  try {
    const key = await crypto.subtle.importKey("jwk", decoded.signerPub, ALGO, false, ["verify"]);
    signatureValid = await crypto.subtle.verify(SIG, key, bytes.slice(BODY_LEN), body);
  } catch { signatureValid = false; }
  return { ok: true, code, signatureValid, ...decoded };
}

export async function merkleRoot(commitmentHexes) {
  if (!commitmentHexes.length) return null;
  let level = [...commitmentHexes].sort().map(fromHex);
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? await sha256(concat(level[i], level[i + 1])) : level[i]);
    level = next;
  }
  return toHex(level[0]);
}

const word = (hex) => hex.replace(/^0x/, "").padStart(64, "0");
export const calldata = {
  anchorBatch: (root) => "0x" + SELECTORS.anchorBatch + word(root),
  revoke: (commitment) => "0x" + SELECTORS.revoke + word(commitment),
  setKey: (hash, active) => "0x" + SELECTORS.setKey + word(hash) + word(active ? "1" : "0"),
  anchoredAt: (root) => "0x" + SELECTORS.anchoredAt + word(root),
  revokedAt: (commitment) => "0x" + SELECTORS.revokedAt + word(commitment),
  activeKey: (hash) => "0x" + SELECTORS.activeKey + word(hash),
};

/** EIP-681 link a phone wallet can open to prepare the same call on Sepolia. */
export function walletLink(contract, fn, args) {
  const q = args.map(([type, value]) => `${type}=${value}`).join("&");
  return `ethereum:${contract}@${SEPOLIA_CHAIN_ID}/${fn}?${q}`;
}

export const CONTRACT_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// ARK Proof Registry on Ethereum Sepolia (stand-in for Liberland Blockchain V2).
/// Holds only 32-byte values: batch roots, revoked credential fingerprints and signing-key hashes.
/// No learner data, no tokens, no wallets for children.
contract ArkProofRegistry {
    address public immutable issuer;
    mapping(bytes32 => uint256) public anchoredAt; // batch root => block time
    mapping(bytes32 => uint256) public revokedAt;  // credential fingerprint => block time
    mapping(bytes32 => bool) public activeKey;     // SHA-256 of an ARK signing key => in use

    event BatchAnchored(bytes32 indexed root, uint256 timestamp);
    event CredentialRevoked(bytes32 indexed commitment, uint256 timestamp);
    event KeyStatus(bytes32 indexed keyHash, bool active, uint256 timestamp);

    modifier onlyIssuer() {
        require(msg.sender == issuer, "only issuer");
        _;
    }

    constructor() {
        issuer = msg.sender;
    }

    function anchorBatch(bytes32 root) external onlyIssuer {
        require(anchoredAt[root] == 0, "already anchored");
        anchoredAt[root] = block.timestamp;
        emit BatchAnchored(root, block.timestamp);
    }

    function revoke(bytes32 commitment) external onlyIssuer {
        require(revokedAt[commitment] == 0, "already revoked");
        revokedAt[commitment] = block.timestamp;
        emit CredentialRevoked(commitment, block.timestamp);
    }

    function setKey(bytes32 keyHash, bool active) external onlyIssuer {
        activeKey[keyHash] = active;
        emit KeyStatus(keyHash, active, block.timestamp);
    }
}
`;
