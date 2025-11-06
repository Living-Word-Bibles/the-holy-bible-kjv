// build.mjs — KJV Verse-per-Page static site builder
// Output: ./dist with /book-slug/chapter/verse/index.html for every verse
// Requires Node 18+ (Node 20 recommended). package.json should set "type":"module".

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// -------- Config --------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "dist");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "Bible-kjv-master");

// Public site URL and domain (used for canonical, sitemap, robots, share links)
const SITE = process.env.SITE || "https://kjv.the-holy-bible.online";
const CNAME = process.env.CNAME || "kjv.the-holy-bible.online";

// Branding
const LOGO_URL = "https://static1.squarespace.com/static/68d6b7d6d21f02432fd7397b/t/690209b3567af44aabfbdaca/1761741235124/LivingWordBibles01.png";
const FONT_LINK = `<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600;700&display=swap" rel="stylesheet">`;

// Remote fallbacks for data (if ./Bible-kjv-master not present)
const BASES = [
  "https://cdn.jsdelivr.net/gh/Living-Word-Bibles/the-holy-bible-kjv@main/Bible-kjv-master/",
  "https://raw.githubusercontent.com/Living-Word-Bibles/the-holy-bible-kjv/main/Bible-kjv-master/",
  "https://cdn.jsdelivr.net/gh/aruljohn/Bible-kjv@master/",
  "https://raw.githubusercontent.com/aruljohn/Bible-kjv/master/",
  "https://cdn.jsdelivr.net/gh/aruljohn/Bible-kjv-1611@master/",
  "https://raw.githubusercontent.com/aruljohn/Bible-kjv-1611/master/"
];

// OT/NT ordering (for reliable prev/next across books)
const OT = ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi'];
const NT = ['Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'];

// -------- Utils --------
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const slugify = (s)=>String(s).trim().toLowerCase().replace(/[^a-z0-9\s]/g,"").replace(/\s+/g,"-");
const fileFromName = (name)=>String(name).replace(/[^0-9A-Za-z]/g,"") + ".json";
const escapeHtml = (s)=>String(s)
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#39;");

// fs helpers
async function ensureDir(d){ await fs.mkdir(d, {recursive:true}); }
async function cleanOut(){ await fs.rm(OUT_DIR, {recursive:true, force:true}); await ensureDir(OUT_DIR); }

// data loaders
async function readLocalJSON(rel){
  const p = path.join(DATA_DIR, rel);
  const buf = await fs.readFile(p);
  return JSON.parse(String(buf));
}
async function fetchJSON(url){
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
  const ct = (r.headers.get("content-type")||"").toLowerCase();
  if (ct.includes("application/json")) return r.json();
  return JSON.parse(await r.text());
}
async function loadJSON(rel){
  // Try local first
  try { return await readLocalJSON(rel); } catch {}
  // Try remote fallbacks
  let lastErr = "";
  for (const base of BASES){
    const u = base + rel;
    try { return await fetchJSON(u); }
    catch(e){ lastErr = e.message; }
    await sleep(50);
  }
  throw new Error(`Unable to load ${rel}. ${lastErr||""}`);
}

// Normalize various book JSON shapes into a common { chapters: { [n]: { verseCount, verses: { '1':'text', ... }}}}
function normalizeBook(name, data){
  const out = { name, chapters:{} };
  const addChapter = (chNum, versesObj)=>{
    const vmap = {};
    if (Array.isArray(versesObj)){
      versesObj.forEach((v,i)=>{
        if (v && typeof v === "object"){
          const num = String(v.verse ?? v.num ?? v.v ?? (i+1));
          vmap[num] = String(v.text ?? v.t ?? "");
        } else {
          vmap[String(i+1)] = String(v ?? "");
        }
      });
    } else if (versesObj && typeof versesObj === "object"){
      for (const [k,v] of Object.entries(versesObj)) vmap[String(k)] = String(v ?? "");
    }
    out.chapters[Number(chNum)] = { verseCount:Object.keys(vmap).length, verses:vmap };
  };

  if (data && Array.isArray(data.chapters)){
    for (const ch of data.chapters){
      const chNum = Number(ch.chapter);
      const vv = Array.isArray(ch.verses) ? ch.verses : (ch.verses||{});
      addChapter(chNum, vv);
    }
    return out;
  }
  if (data && data.chapters && typeof data.chapters === "object"){
    for (const [chNum, verses] of Object.entries(data.chapters)) addChapter(chNum, verses);
    return out;
  }
  if (Array.isArray(data) && data.length && Array.isArray(data[0])){
    data.forEach((chap,i)=> addChapter(i+1, chap));
    return out;
  }
  throw new Error("Unrecognized book JSON structure.");
}

// -------- HTML template --------
function verseUrl(ref){ return `/${ref.bookSlug}/${ref.chapter}/${ref.verse}/`; }
function canonicalUrl(ref){ return `${SITE}${verseUrl(ref)}`; }
function shareLinks(ref, bookName, verseText){
  const url = encodeURIComponent(canonicalUrl(ref));
  const refLabel = `${bookName} ${ref.chapter}:${ref.verse}`;
  const text = encodeURIComponent(`The Holy Bible — ${refLabel}: ${verseText.replace(/\s+/g,' ').slice(0,250)}`);
  const title = encodeURIComponent(`The Holy Bible — ${refLabel}`);
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    x:        `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    email:    `mailto:?subject=${title}&body=${text}%0A%0A${url}`
  };
}

function pageHTML({bookName, bookSlug, chapter, verse, verseText, totalVerses, prevRef, nextRef}){
  const ref = {bookSlug, chapter, verse};
  const can = canonicalUrl(ref);
  const title = `The Holy Bible (KJV): ${bookName} ${chapter}:${verse}`;
  const desc = `${bookName} ${chapter}:${verse} (KJV) — ${verseText.slice(0,160)}`;
  const share = shareLinks(ref, bookName, verseText);
  const prevLink = prevRef ? `<link rel="prev" href="${verseUrl(prevRef)}">` : "";
  const nextLink = nextRef ? `<link rel="next" href="${verseUrl(nextRef)}">` : "";
  const cssHref = "/assets/styles.css";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="canonical" href="${can}">
${prevLink}${nextLink}
${FONT_LINK}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${cssHref}">
<meta name="description" content="${escapeHtml(desc)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${can}">
<meta property="og:image" content="${LOGO_URL}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="robots" content="index,follow">
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "CreativeWork",
  "name": `${bookName} ${chapter}:${verse} (KJV)`,
  "isPartOf": { "@type":"CreativeWorkSeries", "name":"The Holy Bible — King James Version" },
  "inLanguage":"en",
  "url": can
})}
</script>
</head>
<body>
<header class="site-head">
  <a class="brand" href="/" aria-label="Home">
    <img class="logo" alt="Living Word Bibles" src="${LOGO_URL}">
  </a>
  <div class="brand-titles">
    <div class="brand-h1">The Holy Bible</div>
    <div class="brand-h2">King James Version</div>
  </div>
  <nav class="site-nav">
    <a class="btn" href="https://www.livingwordbibles.com/read-the-bible-online#/genesis/1/1" target="_blank" rel="noopener">The Holy Bible</a>
  </nav>
</header>

<main class="container">
  <h1 class="ref">${escapeHtml(bookName)} ${chapter}:${verse}</h1>
  <article class="verse">
    <p><span class="vnum">${verse}</span> ${escapeHtml(verseText)}</p>
  </article>

  <nav class="pager">
    ${prevRef ? `<a class="btn" rel="prev" href="${verseUrl(prevRef)}">◀ Prev</a>` : `<span></span>`}
    ${nextRef ? `<a class="btn" rel="next" href="${verseUrl(nextRef)}">Next ▶</a>` : `<span></span>`}
  </nav>

  <section class="share">
    <button class="shbtn" onclick="window.open('${share.facebook}','_blank','noopener')">Facebook</button>
    <a class="shbtn" href="https://www.instagram.com/living.word.bibles/" target="_blank" rel="noopener">Instagram</a>
    <button class="shbtn" onclick="window.open('${share.x}','_blank','noopener')">X</button>
    <button class="shbtn" onclick="window.open('${share.linkedin}','_blank','noopener')">LinkedIn</button>
    <a class="shbtn" href="${share.email}">Email</a>
  </section>

  <aside class="meta">
    <div>Book: ${escapeHtml(bookName)} • Chapter ${chapter} • Verse ${verse} of ${totalVerses}</div>
  </aside>
</main>

<footer class="site-foot">
  <div>Copyright © 2025 | <a href="https://www.livingwordbibles.com" target="_blank" rel="noopener">Living Word Bibles</a> | All Rights Reserved</div>
  <div>KJV Online — Verse-per-Page</div>
</footer>
</body>
</html>`;
}

// Simple home page and 404
function homeHTML(){
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Holy Bible (KJV) — Verse by Verse</title>
${FONT_LINK}
<link rel="stylesheet" href="/assets/styles.css">
<link rel="canonical" href="${SITE}/">
<meta name="robots" content="index,follow">
</head>
<body>
<header class="site-head">
  <a class="brand" href="/" aria-label="Home"><img class="logo" alt="Living Word Bibles" src="${LOGO_URL}"></a>
  <div class="brand-titles">
    <div class="brand-h1">The Holy Bible</div>
    <div class="brand-h2">King James Version</div>
  </div>
  <nav class="site-nav">
    <a class="btn" href="/genesis/1/1/">Start at Genesis 1:1</a>
  </nav>
</header>
<main class="container">
  <p>Welcome. This is the KJV Bible presented one verse per page for maximum readability and indexability.</p>
  <ul class="booklist">
    ${[...OT, ...NT].map(b=>`<li><a href="/${slugify(b)}/1/1/">${b}</a></li>`).join("")}
  </ul>
</main>
<footer class="site-foot">
  <div>Copyright © 2025 | <a href="https://www.livingwordbibles.com" target="_blank" rel="noopener">Living Word Bibles</a></div>
</footer>
</body>
</html>`;
}
function notFoundHTML(){
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not Found — The Holy Bible (KJV)</title>
${FONT_LINK}
<link rel="stylesheet" href="/assets/styles.css">
</head><body>
<main class="container"><h1>404 — Not Found</h1><p>Try starting at <a href="/genesis/1/1/">Genesis 1:1</a>.</p></main>
</body></html>`;
}

// Shared CSS (EB Garamond + clean layout)
const CSS = `
:root{--maxw:880px;--bg:#fff;--ink:#111;--muted:#666;--line:#eee}
*{box-sizing:border-box}
body{margin:0;background:#fafafa;color:var(--ink);font-family:"EB Garamond",Garamond,"Times New Roman",serif}
a{color:inherit}
.container{max-width:var(--maxw);margin:1rem auto;background:#fff;border:1px solid #ddd;border-radius:16px;box-shadow:0 2px 16px rgba(0,0,0,.08);padding:1rem 1.2rem}
.site-head,.site-foot{max-width:var(--maxw);margin:1rem auto;padding:.8rem 1rem;display:flex;align-items:center;gap:.8rem;background:#fff;border:1px solid #ddd;border-radius:16px}
.site-head{justify-content:space-between}
.brand{display:flex;align-items:center;gap:.6rem;text-decoration:none}
.logo{height:64px;object-fit:contain}
.brand-titles .brand-h1{font-weight:700;font-size:1.35rem}
.brand-titles .brand-h2{font-size:1rem;color:#6b7280}
.site-nav .btn{border:1px solid #bbb;background:#fff;border-radius:999px;padding:.42rem .7rem;text-decoration:none}
.site-nav .btn:hover{background:#f3f3f3}
.ref{margin:.2rem 0 .6rem 0}
.verse p{font-size:1.2rem;line-height:1.75}
.vnum{font-variant-numeric:tabular-nums;color:#666;margin-right:.25rem}
.pager{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);margin-top:1rem;padding-top:.6rem}
.pager .btn{border:1px solid #bbb;background:#fff;border-radius:10px;padding:.42rem .6rem;text-decoration:none}
.share{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;border-top:1px solid var(--line);margin-top:1rem;padding-top:.8rem}
.shbtn{border:1px solid #bbb;background:#fff;border-radius:999px;padding:.38rem .7rem;cursor:pointer}
.shbtn:hover{background:#f3f3f3}
.meta{color:var(--muted);font-size:.95rem;margin-top:.6rem}
.site-foot{justify-content:space-between;color:#666}
.booklist{columns:2;gap:1.5rem}
.booklist a{text-decoration:none;border-bottom:1px dotted #aaa}
@media (max-width:720px){.booklist{columns:1}}
`;

// -------- Build routine --------
async function writeStaticAssets(){
  await ensureDir(path.join(OUT_DIR, "assets"));
  await fs.writeFile(path.join(OUT_DIR, "assets", "styles.css"), CSS);
  await fs.writeFile(path.join(OUT_DIR, "index.html"), homeHTML());
  await fs.writeFile(path.join(OUT_DIR, "404.html"), notFoundHTML());
  await fs.writeFile(path.join(OUT_DIR, "CNAME"), CNAME);
  await fs.writeFile(path.join(OUT_DIR, ".nojekyll"), "");
}

async function loadIndex(){
  return await loadJSON("Books.json"); // array of canonical book names matching filenames
}

async function loadBook(slug, name){
  const raw = await loadJSON(fileFromName(name)); // e.g., SongofSolomon.json
  return normalizeBook(name, raw);
}

function flattenRefs(indexList, booksMap){
  // returns an array of {bookName, bookSlug, chapter, verse, text}
  const orderedNames = [...OT, ...NT];
  const out = [];
  for (const name of orderedNames){
    const slug = slugify(name);
    const book = booksMap.get(slug);
    if (!book) continue;
    const chNums = Object.keys(book.chapters).map(Number).sort((a,b)=>a-b);
    for (const ch of chNums){
      const { verses, verseCount } = book.chapters[ch];
      for (let v=1; v<=verseCount; v++){
        const text = verses[String(v)] ?? "";
        out.push({ bookName: name, bookSlug: slug, chapter: ch, verse: v, text });
      }
    }
  }
  return out;
}

async function buildAll(){
  await cleanOut();
  await writeStaticAssets();

  const names = await loadIndex(); // we won’t rely on its order; we use OT+NT arrays
  const nameSet = new Set(names);
  // Load books into a map by slug (only those present in Books.json)
  const books = new Map();
  for (const name of [...OT, ...NT]){
    if (!nameSet.has(name)) {
      console.warn(`Warning: ${name} missing from Books.json — skipping`);
      continue;
    }
    const slug = slugify(name);
    const book = await loadBook(slug, name);
    books.set(slug, book);
  }

  const refs = flattenRefs(names, books);
  console.log(`Loaded ${books.size} books; generating ${refs.length} verse pages…`);

  // Create pages and build sitemap
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  for (let i=0; i<refs.length; i++){
    const curr = refs[i];
    const prev = i>0 ? refs[i-1] : null;
    const next = i<refs.length-1 ? refs[i+1] : null;

    const outDir = path.join(OUT_DIR, curr.bookSlug, String(curr.chapter), String(curr.verse));
    await ensureDir(outDir);

    const html = pageHTML({
      bookName: curr.bookName,
      bookSlug: curr.bookSlug,
      chapter: curr.chapter,
      verse: curr.verse,
      verseText: curr.text,
      totalVerses: books.get(curr.bookSlug).chapters[curr.chapter].verseCount,
      prevRef: prev ? { bookSlug: prev.bookSlug, chapter: prev.chapter, verse: prev.verse } : null,
      nextRef: next ? { bookSlug: next.bookSlug, chapter: next.chapter, verse: next.verse } : null
    });

    await fs.writeFile(path.join(outDir, "index.html"), html);

    const loc = `${SITE}${verseUrl(curr)}`;
    sitemap += `  <url><loc>${loc}</loc></url>\n`;
  }
  sitemap += `</urlset>\n`;
  await fs.writeFile(path.join(OUT_DIR, "sitemap.xml"), sitemap);

  // robots.txt
  const robots = `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`;
  await fs.writeFile(path.join(OUT_DIR, "robots.txt"), robots);

  console.log("Build complete:", { pages: refs.length, out: OUT_DIR });
}

// Run
buildAll().catch(err=>{ console.error(err); process.exit(1); });
