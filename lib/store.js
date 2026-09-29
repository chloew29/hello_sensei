// Key-value store. Uses Upstash Redis in production (Vercel marketplace sets these env vars),
// and a local JSON file in development.
import { promises as fs } from "fs";
import path from "path";

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

let redis = null;
async function getRedis() {
  if (!url || !token) return null;
  if (!redis) {
    const { Redis } = await import("@upstash/redis");
    redis = new Redis({ url, token });
  }
  return redis;
}

const FILE = path.join(process.cwd(), ".data", "db.json");
let fileCache = null;
async function loadFile() {
  if (fileCache) return fileCache;
  try {
    fileCache = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    fileCache = {};
  }
  return fileCache;
}
async function saveFile() {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(fileCache));
}

export async function kvGet(key, fallback = null) {
  const r = await getRedis();
  if (r) {
    const v = await r.get(key);
    return v ?? fallback;
  }
  if (process.env.VERCEL) throw new Error("No database configured. Add Upstash Redis in Vercel (see README).");
  const db = await loadFile();
  return db[key] ?? fallback;
}

export async function kvSet(key, value) {
  const r = await getRedis();
  if (r) return r.set(key, value);
  if (process.env.VERCEL) throw new Error("No database configured. Add Upstash Redis in Vercel (see README).");
  const db = await loadFile();
  db[key] = value;
  await saveFile();
}

export async function kvDel(key) {
  const r = await getRedis();
  if (r) return r.del(key);
  const db = await loadFile();
  delete db[key];
  await saveFile();
}
