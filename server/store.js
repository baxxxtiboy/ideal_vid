'use strict';
/**
 * Oddiy hujjat-bazasi: hamma narsa xotirada turadi, o'zgarish bo'lsa tashqi bazaga yoziladi.
 *  - SUPABASE_URL + SUPABASE_KEY berilsa -> Supabase (tavsiya etiladi; REST orqali, qo'shimcha paket kerak emas)
 *  - MONGODB_URI berilsa                 -> MongoDB Atlas
 *  - hech biri bo'lmasa                  -> data/db/*.json fayllari (faqat lokal ishlash uchun)
 */
const fs = require('fs');
const path = require('path');

const COLS = ['users', 'products', 'orders', 'months', 'settings'];
const FILE_ID = /^[a-f0-9-]{36}$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

/** Muhit o'zgaruvchisini tozalab o'qiydi: bo'sh joy, qo'shtirnoq va tasodifan qo'shib yuborilgan "NOM=" ni olib tashlaydi */
function env(...names) {
  for (const n of names) {
    let v = process.env[n];
    if (v === undefined || v === null) continue;
    v = String(v).trim().replace(/^(["'])(.*)\1$/, '$2').trim();
    if (v.toUpperCase().startsWith(n.toUpperCase() + '=')) v = v.slice(n.length + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
    if (v) return v;
  }
  return '';
}

/* ------------------------------------------------------------------ fayl (lokal) */
class FileBackend {
  constructor(dir) {
    this.dir = dir;
    this.timers = {};
    this.pending = {};
    fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
    const flush = () => this.flushAll();
    process.on('SIGTERM', () => { flush(); process.exit(0); });
    process.on('SIGINT', () => { flush(); process.exit(0); });
  }
  async init() { /* kerak emas */ }
  async load(col) {
    try { return JSON.parse(fs.readFileSync(path.join(this.dir, col + '.json'), 'utf8')); } catch { return []; }
  }
  upsert(col, doc, all) { this._queue(col, all); }
  upsertMany(col, docs, all) { this._queue(col, all); }
  remove(col, id, all) { this._queue(col, all); }
  _queue(col, all) {
    this.pending[col] = all;
    clearTimeout(this.timers[col]);
    this.timers[col] = setTimeout(() => this._write(col), 120);
  }
  _write(col) {
    const all = this.pending[col]; if (!all) return;
    delete this.pending[col];
    const f = path.join(this.dir, col + '.json');
    fs.writeFileSync(f + '.tmp', JSON.stringify(all()));
    fs.renameSync(f + '.tmp', f);
  }
  flushAll() { for (const c of Object.keys(this.pending)) { clearTimeout(this.timers[c]); this._write(c); } }
  async saveFile(id, buf, mime) {
    fs.writeFileSync(path.join(this.dir, 'files', id), buf);
    fs.writeFileSync(path.join(this.dir, 'files', id + '.mime'), mime);
  }
  async getFile(id) {
    if (!FILE_ID.test(id)) return null;
    try {
      return { buf: fs.readFileSync(path.join(this.dir, 'files', id)), mime: fs.readFileSync(path.join(this.dir, 'files', id + '.mime'), 'utf8') };
    } catch { return null; }
  }
  async hasFile(id) { return FILE_ID.test(id) && fs.existsSync(path.join(this.dir, 'files', id)); }
}

/* ------------------------------------------------------------------ Supabase (REST / PostgREST) */
const SB_UPSERT = { Prefer: 'resolution=merge-duplicates,return=minimal' };

/** Foydalanuvchi nima yozgan bo'lsa ham Project URL (https://<ref>.supabase.co) ni topishga urinadi */
function sbUrl(raw) {
  let v = String(raw || '').trim();
  if (!v) return '';
  const ref = (v.match(/db\.([a-z0-9]{15,30})\.supabase\.co/i) || v.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{15,30})/i) || [])[1];
  if (ref) return `https://${ref.toLowerCase()}.supabase.co`;
  if (/^postgres(ql)?:/i.test(v)) return '';
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  try { return new URL(v).origin; } catch { return ''; }
}
function jwtRole(key) {
  try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role || ''; } catch { return ''; }
}

class SupabaseBackend {
  constructor(url, key) {
    this.rawUrl = url;
    this.key = key;
    this.base = sbUrl(url);
    this.chain = Promise.resolve();
    this.failed = new Map();
    this.seq = 0;
  }

  headers(extra) {
    const h = { apikey: this.key, 'Content-Type': 'application/json', ...extra };
    if (this.key.startsWith('eyJ')) h.Authorization = 'Bearer ' + this.key;   // eski (JWT) kalitlar; yangi sb_secret_ kalitlarga kerak emas
    return h;
  }

  async rest(method, pq, body, headers = {}, tries = 3) {
    let last;
    for (let i = 0; i < tries; i++) {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 20000);
      try {
        const r = await fetch(this.base + '/rest/v1' + pq, {
          method, headers: this.headers(headers), signal: ac.signal,
          body: body === undefined ? undefined : JSON.stringify(body)
        });
        const text = await r.text();
        let j = null;
        if (text) { try { j = JSON.parse(text); } catch { j = null; } }
        if (r.ok) return j;
        const err = Object.assign(new Error((j && (j.message || j.msg || j.error_description)) || text.slice(0, 200) || r.statusText), {
          status: r.status, code: j && j.code, hint: j && j.hint
        });
        if (r.status < 500 && r.status !== 429) throw err;      // qayta urinishdan foyda yo'q
        last = err;
      } catch (e) {
        if (e.status && e.status < 500 && e.status !== 429) throw e;
        last = e;
      } finally { clearTimeout(to); }
      if (i < tries - 1) await sleep(400 * (i + 1) * (i + 1));
    }
    throw last;
  }

  checkConfig() {
    const k = this.key;
    if (!this.base) {
      throw friendly(
        "❌ SUPABASE_URL noto'g'ri.\n" +
        '   Supabase → Project Settings → API → «Project URL» ni nusxalang (ko\'rinishi: https://abcdxyz.supabase.co).\n' +
        '   «postgresql://...» bilan boshlanadigan ulanish qatori bu yerga KERAK EMAS.'
      );
    }
    if (!k) throw friendly('❌ SUPABASE_KEY berilmagan.\n   Supabase → Settings → API Keys → «Secret keys» dagi kalitni (sb_secret_...) nusxalab, Render → Environment ga SUPABASE_KEY nomi bilan qo\'shing.');
    if (/^sb_publishable_/.test(k) || jwtRole(k) === 'anon') {
      throw friendly(
        '❌ SUPABASE_KEY — bu ochiq (anon / publishable) kalit. Server uchun yashirin kalit kerak.\n' +
        '   Supabase → Settings → API Keys → «Secret keys» dagi sb_secret_... kalitini (yoki Legacy tabdagi service_role kalitini) oling.'
      );
    }
  }

  explain(e) {
    const host = this.base.replace(/^https?:\/\//, '');
    const tech = `(texnik: ${e.status || 'tarmoq'}${e.code ? ' ' + e.code : ''} — ${e.message})`;
    if (!e.status) {
      return (
        `❌ Supabase'ga ulanib bo'lmadi: ${host}\n` +
        "   1) SUPABASE_URL to'g'riligini tekshiring (Project Settings → API → Project URL).\n" +
        "   2) Bepul loyiha 1 hafta ishlatilmasa «Paused» bo'ladi — Supabase dashboard'da «Restore project» ni bosing.\n   " + tech
      );
    }
    if (e.status === 401 || e.status === 403 || /invalid api key|jwt/i.test(e.message)) {
      return "❌ SUPABASE_KEY noto'g'ri (yoki to'liq nusxalanmagan).\n   Secret kalit sb_secret_... bilan (yoki eski service_role kaliti eyJ... bilan) boshlanadi — boshidan oxirigacha, bo'sh joy va qo'shtirnoqsiz kiriting.\n   " + tech;
    }
    if (e.code === 'PGRST205' || e.code === '42P01' || e.status === 404) {
      return (
        "❌ Supabase'da jadvallar yo'q (yoki ularga ruxsat berilmagan).\n" +
        '   Supabase → SQL Editor → New query → loyihadagi «supabase.sql» faylining ichini to\'liq qo\'yib RUN bosing, so\'ng serverni qayta ishga tushiring.\n   ' + tech
      );
    }
    if (e.code === '42501' || /permission denied|row-level security/i.test(e.message)) {
      return "❌ Kalitning ruxsati yetmayapti. SUPABASE_KEY sifatida secret (service_role) kalitini bering, anon emas; va «supabase.sql» ni to'liq (GRANT qatorlari bilan) ishga tushiring.\n   " + tech;
    }
    return `❌ Supabase xatosi.\n   ${tech}`;
  }

  async init() {
    this.checkConfig();
    try {
      await this.rest('GET', '/kv?select=id&limit=1', undefined, {}, 2);
      await this.rest('GET', '/files?select=id&limit=1', undefined, {}, 2);
      await this.ping(2);                                             // yozish huquqini ham tekshiradi
    } catch (e) { throw friendly(this.explain(e)); }
    // Bepul loyiha uzoq vaqt ishlatilmasa pauza bo'ladi — vaqti-vaqti bilan "tiriklik" belgisi yuboramiz
    setInterval(() => this.ping(1).catch(() => {}), 12 * 3600e3).unref();
    // Yozish o'xshamay qolgan hujjatlarni qayta urinib yozadi
    setInterval(() => { for (const [k, fn] of [...this.failed]) this._write(k, fn); }, 20e3).unref();
    process.once('SIGTERM', async () => { await Promise.race([this.chain, sleep(4000)]); process.exit(0); });
  }
  ping(tries = 1) {
    return this.rest('POST', '/kv?on_conflict=col,id', [{ col: '_meta', id: 'ping', data: { t: Date.now() } }], SB_UPSERT, tries);
  }

  async load(col) {
    const out = [];
    const size = 1000;
    for (let off = 0; ; off += size) {
      const rows = await this.rest('GET', `/kv?col=eq.${encodeURIComponent(col)}&select=id,data&order=id.asc&limit=${size}&offset=${off}`);
      for (const r of rows || []) out.push({ id: r.id, ...r.data });
      if (!rows || rows.length < size) break;
    }
    return out;
  }

  row(col, doc) { return { col, id: String(doc.id), data: doc, updated_at: new Date().toISOString() }; }

  /** Yozuvlar ketma-ket bajariladi (eski ma'lumot yangisining ustidan yozilib ketmasligi uchun); xato bo'lsa keyinroq qayta uriladi */
  _write(key, fn) {
    const run = async () => {
      try { await fn(); this.failed.delete(key); }
      catch (e) { console.error(`Supabase yozish xatosi (${String(key).split('\u0000')[0]}): ${e.message} — qayta uriniladi`); this.failed.set(key, fn); }
    };
    const p = this.chain.then(run);
    this.chain = p;
    return p;
  }
  upsert(col, doc) {
    return this._write(col + '\u0000' + doc.id, () => this.rest('POST', '/kv?on_conflict=col,id', [this.row(col, doc)], SB_UPSERT));
  }
  upsertMany(col, docs) {
    return Promise.all(chunk(docs, 100).map((part) =>
      this._write(`${col}\u0000bulk${++this.seq}`, () => this.rest('POST', '/kv?on_conflict=col,id', part.map((d) => this.row(col, d)), SB_UPSERT))));
  }
  remove(col, id) {
    return this._write(col + '\u0000' + id, () => this.rest('DELETE', `/kv?col=eq.${encodeURIComponent(col)}&id=eq.${encodeURIComponent(id)}`, undefined, { Prefer: 'return=minimal' }));
  }

  async saveFile(id, buf, mime) {
    await this.rest('POST', '/files?on_conflict=id', [{ id, mime, data: buf.toString('base64') }], SB_UPSERT);
  }
  async getFile(id) {
    if (!FILE_ID.test(id)) return null;
    const rows = await this.rest('GET', `/files?id=eq.${id}&select=mime,data&limit=1`);
    return rows && rows[0] ? { buf: Buffer.from(rows[0].data, 'base64'), mime: rows[0].mime } : null;
  }
  async hasFile(id) {
    if (!FILE_ID.test(id)) return false;
    const rows = await this.rest('GET', `/files?id=eq.${id}&select=id&limit=1`);
    return !!(rows && rows.length);
  }
}

/* ------------------------------------------------------------------ MongoDB Atlas (ixtiyoriy) */
class MongoBackend {
  constructor(uri, dbName) { this.uri = uri; this.dbName = dbName || 'glass_ideal_vitraj'; }
  async init() {
    const { MongoClient, Binary } = require('mongodb');
    this.Binary = Binary;
    this.client = new MongoClient(this.uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
    try {
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      await this.db.command({ ping: 1 });
    } catch (e) {
      try { await this.client.close(); } catch { /* */ }
      throw friendly(this.explain(e));
    }
  }
  explain(e) {
    const m = String(e && e.message);
    const tech = `(texnik: ${m.slice(0, 200)})`;
    if (/auth|credential|bad auth/i.test(m)) return "❌ MongoDB: login yoki parol noto'g'ri.\n   Atlas → Database Access → foydalanuvchi parolini yangilang, MONGODB_URI dagi parolni almashtiring (maxsus belgilar bo'lsa kodlash kerak: @ → %40).\n   " + tech;
    if (/Invalid scheme|Invalid connection string|must begin with|ENOTFOUND|querySrv/i.test(m)) return "❌ MONGODB_URI noto'g'ri yozilgan (mongodb:// yoki mongodb+srv:// bilan boshlanishi kerak, boshida «MONGODB_URI=» va qo'shtirnoq bo'lmasin).\n   " + tech;
    return "❌ MongoDB'ga ulanib bo'lmadi. Atlas → Network Access → «Add IP Address» → 0.0.0.0/0 (Allow access from anywhere) qo'shing va 1-2 daqiqa kuting.\n   " + tech;
  }
  async load(col) {
    const arr = await this.db.collection(col).find().toArray();
    return arr.map(({ _id, ...d }) => ({ ...d, id: _id }));
  }
  upsert(col, doc) {
    const { id, ...rest } = doc;
    return this.db.collection(col).replaceOne({ _id: id }, rest, { upsert: true }).catch((e) => console.error('mongo:', e.message));
  }
  upsertMany(col, docs) {
    if (!docs.length) return Promise.resolve();
    const ops = docs.map(({ id, ...rest }) => ({ replaceOne: { filter: { _id: id }, replacement: rest, upsert: true } }));
    return this.db.collection(col).bulkWrite(ops).catch((e) => console.error('mongo:', e.message));
  }
  remove(col, id) { return this.db.collection(col).deleteOne({ _id: id }).catch((e) => console.error('mongo:', e.message)); }
  async saveFile(id, buf, mime) {
    await this.db.collection('files').replaceOne({ _id: id }, { mime, data: new this.Binary(buf) }, { upsert: true });
  }
  async getFile(id) {
    if (!FILE_ID.test(id)) return null;
    const d = await this.db.collection('files').findOne({ _id: id });
    return d ? { buf: Buffer.from(d.data.buffer), mime: d.mime } : null;
  }
  async hasFile(id) { return FILE_ID.test(id) && !!(await this.db.collection('files').findOne({ _id: id }, { projection: { _id: 1 } })); }
}

/* ------------------------------------------------------------------ Store */
class Store {
  constructor() { this.m = {}; COLS.forEach((c) => (this.m[c] = new Map())); }
  async init() {
    const sbU = env('SUPABASE_URL');
    const sbK = env('SUPABASE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
    const mongo = env('MONGODB_URI');
    if (sbU || sbK) {
      this.be = new SupabaseBackend(sbU, sbK);
      await this.be.init();
      console.log(`Baza: Supabase (${this.be.base.replace(/^https?:\/\//, '')})` + (mongo ? " — MONGODB_URI e'tiborga olinmadi" : ''));
    } else if (mongo) {
      this.be = new MongoBackend(mongo, env('MONGODB_DB'));
      await this.be.init();
      console.log('Baza: MongoDB');
    } else {
      this.be = new FileBackend(process.env.DATA_DIR || path.join(__dirname, '..', 'data', 'db'));
      console.log("Baza: fayl (data/db). Render'da SUPABASE_URL va SUPABASE_KEY qo'shing, aks holda qayta ishga tushganda ma'lumot yo'qoladi.");
    }
    for (const c of COLS) {
      this.m[c].clear();
      for (const d of await this.be.load(c)) this.m[c].set(String(d.id), d);
    }
  }
  list(c) { return [...this.m[c].values()]; }
  get(c, id) { return this.m[c].get(String(id)); }
  async put(c, doc) { this.m[c].set(String(doc.id), doc); await this.be.upsert(c, doc, () => this.list(c)); return doc; }
  async putMany(c, docs) { for (const d of docs) this.m[c].set(String(d.id), d); await this.be.upsertMany(c, docs, () => this.list(c)); return docs; }
  async del(c, id) { this.m[c].delete(String(id)); await this.be.remove(c, String(id), () => this.list(c)); }
  saveFile(id, buf, mime) { return this.be.saveFile(id, buf, mime); }
  getFile(id) { return this.be.getFile(id); }
  hasFile(id) { return this.be.hasFile(id); }
}

module.exports = { Store };
