import { nanoid } from "nanoid";

const WALLET_KEY = "cf_wallet";
const USER_KEY = "cf_user";

function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return { id: "guest", name: "Guest" };
  try { return JSON.parse(raw); } catch { return { id: "guest", name: "Guest" }; }
}

function loadWallet() {
  const u = getUser();
  const all = JSON.parse(localStorage.getItem(WALLET_KEY) || "{}");
  if (!all[u.id]) {
    all[u.id] = { balance: 50, // starter credit
      history: [{ id:nanoid(), type:"credit", amount:50, note:"Welcome bonus", ts:Date.now() }] };
    localStorage.setItem(WALLET_KEY, JSON.stringify(all));
  }
  return all[u.id];
}

function saveWallet(w) {
  const u = getUser();
  const all = JSON.parse(localStorage.getItem(WALLET_KEY) || "{}");
  all[u.id] = w;
  localStorage.setItem(WALLET_KEY, JSON.stringify(all));
}

export function walletGet() { return loadWallet(); }

export function walletCredit(amount, note) {
  const w = loadWallet();
  w.balance += amount;
  w.history.unshift({ id:nanoid(), type:"credit", amount, note, ts:Date.now() });
  saveWallet(w);
  return w;
}

export function walletDebit(amount, note) {
  const w = loadWallet();
  if (w.balance < amount) throw new Error("Insufficient funds");
  w.balance -= amount;
  w.history.unshift({ id:nanoid(), type:"debit", amount, note, ts:Date.now() });
  saveWallet(w);
  return w;
}

export function walletTransfer(toUserId, amount, note) {
  const me = getUser();
  if (me.id === toUserId) throw new Error("Cannot send to self");
  walletDebit(amount, note || `Send to ${toUserId}`);
  const all = JSON.parse(localStorage.getItem(WALLET_KEY) || "{}");
  if (!all[toUserId]) all[toUserId] = { balance:0, history:[] };
  all[toUserId].balance += amount;
  all[toUserId].history.unshift({ id:nanoid(), type:"credit", amount, note:`Received from ${me.id}`, ts:Date.now() });
  localStorage.setItem(WALLET_KEY, JSON.stringify(all));
}

export async function connectMetaMask() {
  if (!window.ethereum) {
    // Return a soft failure instead of throwing to avoid unhandled Promise rejections
    return Promise.reject(new Error("MetaMask not found"));
  }
  const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
  const msg = `Link CivicForge account at ${new Date().toISOString()}`;
  const sig = await window.ethereum.request({
    method: "personal_sign",
    params: [msg, addr]
  });
  const u = getUser();
  const profile = { ...u, address: addr, signature: sig };
  localStorage.setItem("cf_user", JSON.stringify(profile));
  return profile;
}

// --- Staking & Daily Bonus & Farming (new) ---

function ensureWalletExtras(w) {
  if (!w.staking) w.staking = { staked: 0, rewards: 0, lastAccrueTs: Date.now() };
  if (!w.farming) w.farming = { "CFG-ETH": { liquidity: 0, rewards: 0, lastAccrueTs: Date.now() } };
  if (!w.meta) w.meta = {};
  return w;
}

function accrueStaking(w) {
  ensureWalletExtras(w);
  const now = Date.now();
  const elapsedDays = (now - w.staking.lastAccrueTs) / (1000 * 60 * 60 * 24);
  // 12% APY ~ 0.12 per year => per day ~ 0.12/365
  const dailyRate = 0.12 / 365;
  const reward = Math.max(0, w.staking.staked * dailyRate * elapsedDays);
  if (reward > 0) {
    w.staking.rewards += reward;
    w.staking.lastAccrueTs = now;
  }
}

function accrueFarming(w, poolId = "CFG-ETH") {
  ensureWalletExtras(w);
  const pool = w.farming[poolId];
  const now = Date.now();
  const elapsedDays = (now - pool.lastAccrueTs) / (1000 * 60 * 60 * 24);
  // Simulate ~45% APY for pool
  const dailyRate = 0.45 / 365;
  const reward = Math.max(0, pool.liquidity * dailyRate * elapsedDays);
  if (reward > 0) {
    pool.rewards += reward;
    pool.lastAccrueTs = now;
  }
}

export function walletGetStaking() {
  const w = loadWallet();
  accrueStaking(w);
  saveWallet(w);
  return { staked: w.staking.staked, rewards: w.staking.rewards };
}

export function walletStake(amount) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid stake amount");
  const w = loadWallet();
  accrueStaking(w);
  if (w.balance < amount) throw new Error("Insufficient funds to stake");
  w.balance -= amount;
  w.staking.staked += amount;
  w.history.unshift({ id: nanoid(), type: "debit", amount, note: "Stake CFG", ts: Date.now() });
  saveWallet(w);
  return { balance: w.balance, staked: w.staking.staked, rewards: w.staking.rewards };
}

export function walletUnstake(amount) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid unstake amount");
  const w = loadWallet();
  accrueStaking(w);
  if (w.staking.staked < amount) throw new Error("Insufficient staked balance");
  w.staking.staked -= amount;
  w.balance += amount;
  w.history.unshift({ id: nanoid(), type: "credit", amount, note: "Unstake CFG", ts: Date.now() });
  saveWallet(w);
  return { balance: w.balance, staked: w.staking.staked, rewards: w.staking.rewards };
}

export function walletClaimDailyBonus() {
  const w = loadWallet();
  ensureWalletExtras(w);
  const now = Date.now();
  const last = w.meta.lastDailyBonusTs || 0;
  const oneDay = 24 * 60 * 60 * 1000;
  if (now - last < oneDay) throw new Error("Daily bonus already claimed. Try again later.");
  w.meta.lastDailyBonusTs = now;
  w.balance += 10;
  w.history.unshift({ id: nanoid(), type: "credit", amount: 10, note: "Daily login bonus", ts: now });
  saveWallet(w);
  return { balance: w.balance, nextInMs: oneDay - (now - last) };
}

export function farmingGetPool(poolId = "CFG-ETH") {
  const w = loadWallet();
  accrueFarming(w, poolId);
  saveWallet(w);
  const p = w.farming[poolId];
  return { liquidity: p.liquidity, rewards: p.rewards };
}

export function farmingAddLiquidity(amount, poolId = "CFG-ETH") {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid liquidity amount");
  const w = loadWallet();
  accrueFarming(w, poolId);
  if (w.balance < amount) throw new Error("Insufficient funds");
  w.balance -= amount;
  w.farming[poolId].liquidity += amount;
  w.history.unshift({ id: nanoid(), type: "debit", amount, note: `Add liquidity ${poolId}`, ts: Date.now() });
  saveWallet(w);
  return farmingGetPool(poolId);
}

export function farmingHarvest(poolId = "CFG-ETH") {
  const w = loadWallet();
  accrueFarming(w, poolId);
  const rewards = Math.floor(w.farming[poolId].rewards);
  if (rewards <= 0) throw new Error("No rewards to harvest");
  w.farming[poolId].rewards -= rewards;
  w.balance += rewards;
  w.history.unshift({ id: nanoid(), type: "credit", amount: rewards, note: `Harvest ${poolId} rewards`, ts: Date.now() });
  saveWallet(w);
  return { harvested: rewards, balance: w.balance };
}