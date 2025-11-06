// fetch-data.mjs — Grab the full KJV dataset locally for Option A.
// Node 18+ (Node 20 recommended). Run: `node fetch-data.mjs`

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "Bible-kjv-master");

const BASES = [
  // Your repo first
  "https://cdn.jsdelivr.net/gh/Living-Word-Bibles/the-holy-bible-kjv@main/Bible-kjv-master/",
  "https://raw.githubusercontent.com/Living-Word-Bibles/the-holy-bible-kjv/main/Bible-kjv-master/",
  // Mirrors
  "https://cdn.jsdelivr.net/gh/aruljohn/Bible-kjv@master/",
  "https://raw.githubusercontent.com/aruljohn/Bible-kjv/master/",
  "https://cdn.jsdelivr.net/gh/aruljohn/Bible-kjv-1611@master/",
  "https://raw.githubusercontent.com/aruljohn/Bible-kjv-1611/master/"
];

// Canonical order/names
const OT = ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi'];
const NT = ['Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'];
const ALL = [...OT, ...NT];

const slugFile = (name)=> String(name).replace(/[^0-9A-Za-z]/g,"") + ".json";

async function fetchJSON(url){
  const r = await fetch(url, {cache:"no-store"});
  if(!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
  const ct = (r.headers.get("content-type")||"").toLowerCase();
  if (ct.includes("application/json")) return r.json();
  return JSON.parse(await r.text());
}
async function fetchText(url){
  const r = await fetch(url, {cache:"no-store"});
  if(!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
  return await r.text();
}

async function tryBases(rel, as="json"){
  let lastErr="";
  for(const b of BASES){
    const u = b + rel;
    try { return as==="json" ? await fetchJSON(u) : await fetchText(u); }
    catch(e){ lastErr=e.message; }
  }
  throw new Error(`Failed to fetch ${rel}. ${lastErr||""}`);
}

async function main(){
  await fs.rm(OUT_DIR, {recursive:true, force:true});
  await fs.mkdir(OUT_DIR, {recursive:true});

  // 1) Load Books.json (prefer remote), validate 66 or force canonical
  let books;
  try {
    const remoteBooks = await tryBases("Books.json", "json");
    const hasAll = Array.isArray(remoteBooks) && ALL.every(n => remoteBooks.includes(n));
    books = hasAll ? remoteBooks : ALL;
  } catch {
    books = ALL;
  }
  await fs.writeFile(path.join(OUT_DIR, "Books.json"), JSON.stringify(books, null, 2));

  // 2) Download each book JSON by canonical filename (e.g., SongofSolomon.json)
  let ok=0, fail=0;
  for (const name of books){
    const fname = slugFile(name);
    let got=false, lastErr="";
    for(const b of BASES){
      const url = b + fname;
      try{
        const txt = await fetchText(url);
        // basic sanity
        if(!txt || txt.trim().length < 2) throw new Error("Empty file");
        await fs.writeFile(path.join(OUT_DIR, fname), txt);
        got=true; ok++;
        break;
      }catch(e){ lastErr=e.message; }
    }
    if(!got){ console.error("✗", name, "—", lastErr); fail++; }
    else { console.log("✓", name); }
  }

  // 3) Quick sanity: ensure 66 files present
  const files = await fs.readdir(OUT_DIR);
  const jsons = files.filter(f=>f.endsWith(".json") && f!=="Books.json");
  if (jsons.length !== ALL.length){
    console.warn(`Warning: expected ${ALL.length} book files; found ${jsons.length}.`);
  }

  console.log("\nDone.", { ok, fail, out: OUT_DIR });
}

main().catch(e=>{ console.error(e); process.exit(1); });
