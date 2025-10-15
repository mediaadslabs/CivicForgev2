import { showNotification, trackActivity, escapeHtml, user } from "./dashboard-core.js";
import { walletDebit, walletGet } from "./wallet.js";

/* @tweakable mint fee (CFG) */
const MINT_FEE_CFG = 1;
/* @tweakable max NFTs saved in local collection per user */
const MAX_COLLECTION_SIZE = 24;
/* @tweakable default aspect ratio when none selected */
const DEFAULT_ASPECT = "1:1";
/* @tweakable rarity weights used when auto-assigning rarity */
const RARITY_WEIGHTS = { common: 0.6, rare: 0.25, epic: 0.1, legendary: 0.05 };

/* @tweakable default free image provider for NFT Studio */
const DEFAULT_NFT_PROVIDER = "huggingface";
/* @tweakable free image providers available for NFT Studio */
const FREE_NFT_PROVIDERS = ["huggingface","websim","picsum","loremflickr","unsplash"];
/* @tweakable public, no-key image generation endpoint (Hugging Face free via Pollinations) */
const HF_FREE_ENDPOINT = "https://image.pollinations.ai/prompt/";

/* @tweakable extra quality tags for NFT image prompts */
const NFT_QUALITY_TAGS = "high detail, crisp focus, clean composition, cinematic lighting";
/* @tweakable negative prompt for NFT images */
const NFT_NEGATIVE = "text, watermark, logo, low-res, noisy, deformed, extra limbs";
/* @tweakable subject emphasis repeats for NFT prompts */
const NFT_SUBJECT_EMPHASIS = 2;

const KEY = (uid) => `cf_nfts_${uid}`;

let lastImage = { url: "", prompt: "", aspect: DEFAULT_ASPECT, style: "" };

export function initializeNFTStudio() {
  const gen = document.getElementById("btn-nft-generate");
  const mint = document.getElementById("btn-nft-mint");
  if (gen) gen.addEventListener("click", generatePreview);
  if (mint) mint.addEventListener("click", mintNFT);
  refreshNFTCollection();
}

export function refreshNFTCollection() {
  const grid = document.getElementById("nft-collection");
  if (!grid) return;
  const col = getCollection();
  grid.innerHTML = col.length ? col.map(renderCard).join("") : `<div class="muted">No NFTs yet.</div>`;
}

function getCollection() {
  try { return JSON.parse(localStorage.getItem(KEY(user.id)) || "[]"); } catch { return []; }
}
function saveCollection(list) {
  localStorage.setItem(KEY(user.id), JSON.stringify(list.slice(0, MAX_COLLECTION_SIZE)));
}

function pickRarity() {
  const r = Math.random();
  let acc = 0;
  for (const [k, w] of Object.entries(RARITY_WEIGHTS)) { acc += w; if (r <= acc) return k; }
  return "common";
}

async function generatePreview() {
  const prompt = (document.getElementById("nft-prompt")?.value || "").trim();
  const style = document.getElementById("nft-style")?.value || "";
  const aspect = document.getElementById("nft-aspect")?.value || DEFAULT_ASPECT;
  const provider = document.getElementById("nft-provider")?.value || DEFAULT_NFT_PROVIDER;
  if (!prompt) return showNotification("Enter a prompt", "error");
  const btn = document.getElementById("btn-nft-generate");
  btn.disabled = true; btn.textContent = "Generating...";
  try {
    const full = (() => {
      const emphasized = Array(Math.max(1, NFT_SUBJECT_EMPHASIS)).fill(prompt).join(", ");
      return `${emphasized}${style ? `, ${style} style` : ""}, ${NFT_QUALITY_TAGS}. Do not include: ${NFT_NEGATIVE}.`;
    })();
    const dim = aspect==="16:9"?[768,432]:aspect==="9:16"?[432,768]:aspect==="4:3"?[640,480]:[512,512];
    let url = "";
    if (provider==="websim" && typeof websim!=="undefined" && websim.imageGen) {
      const img = await websim.imageGen({ prompt: full, aspect_ratio: aspect, seed: Math.floor(Math.random()*1e9) });
      url = img?.url || "";
      if (!url) throw new Error("AI image generation returned no URL");
    } else if (provider==="huggingface") {
      const seed = Math.floor(Math.random()*1e9);
      url = `${HF_FREE_ENDPOINT}${encodeURIComponent(full)}?width=${dim[0]}&height=${dim[1]}&seed=${seed}`;
    } else if (provider==="picsum") {
      url = `https://picsum.photos/${dim[0]}/${dim[1]}?random=${Date.now()}`;
    } else if (provider==="loremflickr") {
      url = `https://loremflickr.com/${dim[0]}/${dim[1]}?lock=${Date.now()}`;
    } else if (provider==="unsplash") {
      url = `https://source.unsplash.com/random/${dim[0]}x${dim[1]}`;
    }
    if (!url) throw new Error("Image provider unavailable");
    lastImage = { url, prompt, aspect, style };
    const prev = document.getElementById("nft-preview");
    if (prev) prev.innerHTML = `<img src="${url}" alt="${escapeHtml(prompt)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
    trackActivity("NFT Studio", "Generated preview");
  } catch (e) {
    showNotification("Generation failed: " + (e.message || e), "error");
  } finally {
    btn.disabled = false; btn.textContent = "Generate Preview";
  }
}

function mintNFT() {
  if (!lastImage.url) return showNotification("Generate a preview first", "warning");
  const name = (document.getElementById("nft-name")?.value || "").trim() || defaultName(lastImage.prompt);
  const rarity = document.getElementById("nft-rarity")?.value || pickRarity();
  try {
    // charge mint fee
    walletDebit(MINT_FEE_CFG, `Mint NFT: ${name}`);
    const list = getCollection();
    const item = {
      id: crypto.randomUUID(),
      name, rarity, image: lastImage.url, prompt: lastImage.prompt,
      aspect: lastImage.aspect, style: lastImage.style, owner: user.id, ts: Date.now()
    };
    list.unshift(item);
    saveCollection(list);
    refreshNFTCollection();
    showNotification(`Minted "${name}" (${rarity}) -${MINT_FEE_CFG} CFG`, "success");
    trackActivity("NFT Studio", "Minted NFT");
  } catch (e) {
    showNotification(e.message || "Mint failed", "error");
  }
}

function renderCard(nft) {
  const badge = rarityBadge(nft.rarity);
  return `<div class="nft-card">
    <div class="nft-image">
      <img src="${nft.image}" alt="${escapeHtml(nft.name)}">
      <span class="nft-rarity ${nft.rarity}">${badge}</span>
    </div>
    <div class="nft-info">
      <h4>${escapeHtml(nft.name)}</h4>
      <div class="nft-description tiny muted">${escapeHtml(nft.prompt).slice(0,80)}${nft.prompt.length>80?"…":""}</div>
      <div class="nft-creator">by ${escapeHtml(user.name || user.id)}</div>
      <div class="nft-actions" style="margin-top:8px;">
        <button class="btn small" onclick="downloadNFT('${nft.image}','${escapeHtml(nft.name)}')">Download</button>
        <button class="btn small" onclick="copyNFTUrl('${nft.image}')">Copy URL</button>
      </div>
    </div>
  </div>`;
}

function rarityBadge(r) {
  return r === "legendary" ? "Legendary" : r === "epic" ? "Epic" : r === "rare" ? "Rare" : "Common";
}

function defaultName(prompt) {
  const base = prompt.split(/[.,:-]/)[0].trim() || "Untitled";
  return base.slice(0, 24);
}

window.downloadNFT = function(url, name="nft") {
  const a = document.createElement("a");
  a.href = url; a.download = `${name.replace(/\s+/g,"-").toLowerCase()}-${Date.now()}.png`; a.click();
};

window.copyNFTUrl = function(url) {
  navigator.clipboard.writeText(url);
  showNotification("Image URL copied", "success");
};