// build.mjs — KJV Verse-per-Page static site builder (v1.2 Alpha + sitemap index)
// Output: ./dist with /book-slug/chapter/verse/index.html for every verse
// Also writes: /sitemap-index.xml and /sitemaps/<book>.xml (plus /sitemap.xml alias)
// Node 18+ required (Node 20 recommended). package.json should set "type":"module".

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// -------- Config --------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "dist");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "Bible-kjv-master");

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

// OT/NT ordering
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
  try { return await readLocalJSON(rel); } catch {}
  let lastErr = "";
  for (const base of BASES){
    const u = base + rel;
    try { return await fetchJSON(u); }
    catch(e){ lastErr = e.message; }
    await sleep(50);
  }
  throw new Error(`Unable to load ${rel}. ${lastErr||""}`);
}

// Normalize book JSON into { chapters: { [n]: { verseCount, verses:{ '1':'text', ... }}}}
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

// -------- Icons (inline SVG) --------
function icon(name){
  const map = {
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 22v-9h3l1-4h-4V7a2 2 0 0 1 2-2h2V1h-3a5 5 0 0 0-5 5v3H7v4h3v9h3z"/></svg>',
    instagram:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm5 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm6.5-1.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/></svg>',
    x:        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 2H22l-9.7 11.1L21.4 22h-7l-5.5-6.7L2.6 22H2l8.6-9.8L2 2h7l5 6.1L18.3 2z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.98 3.5C4.98 4.9 3.9 5.9 2.5 5.9S0 4.9 0 3.5 1.1 1.5 2.5 1.5 5 2.9 5 3.5zM0 8.98h5V24H0zM8.48 8.98H13v2.05h.07c.63-1.2 2.16-2.47 4.45-2.47 4.76 0 5.64 3.14 5.64 7.23V24h-5v-6.56c0-1.56-.03-3.56-2.17-3.56-2.17 0-2.5 1.7-2.5 3.45V24h-5V8.98z"/></svg>',
    email:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 4h20v16H2V4zm10 7L3.5 6.5h17L12 11zm0 2l8.5-6.5V20h-17V6.5L12 13z"/></svg>'
  };
  return map[name] || "";
}

// -------- HTML helpers --------
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
    <a class="btn btn-primary" href="https://www.livingwordbibles.com/read-the-bible-online#/genesis/1/1" target="_blank" rel="noopener">The Holy Bible</a>
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
    <button class="shbtn" onclick="window.open('${share.facebook}','_blank','noopener')">${icon('facebook')}<span>Facebook</span></button>
    <a class="shbtn" href="https://www.instagram.com/living.word.bibles/" target="_blank" rel="noopener">${icon('instagram')}<span>Instagram</span></a>
    <button class="shbtn" onclick="window.open('${share.x}','_blank','noopener')">${icon('x')}<span>X</span></button>
    <button class="shbtn" onclick="window.open('${share.linkedin}','_blank','noopener')">${icon('linkedin')}<span>LinkedIn</span></button>
    <a class="shbtn" href="${share.email}">${icon('email')}<span>Email</span></a>
  </section>

  <aside class="meta">
    <div>Book: ${escapeHtml(bookName)} • Chapter ${chapter} • Verse ${verse} of ${totalVerses}</div>
  </aside>
</main>

<footer class="site-foot">
  <div>Copyright © 2025 | <a href="https://www.livingwordbibles.com" target="_blank" rel="noopener">Living Word Bibles</a> | All Rights Reserved</div>
  <div>The Holy Bible Online — v1.2 Alpha</div>
</footer>
</body>
</html>`;
}

// Home + 404
function homeHTML(){
  const otList = OT.map(b=>`<li><a href="/${slugify(b)}/1/1/">${b}</a></li>`).join("");
  const ntList = NT.map(b=>`<li><a href="/${slugify(b)}/1/1/">${b}</a></li>`).join("");

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
    <a class="btn btn-primary" href="/genesis/1/1/">Start at Genesis 1:1</a>
  </nav>
</header>
<main class="container">
  <p class="welcome">Welcome! God Bless! The Holy Bible Online presents the King James Version verse-by-verse for maximum readability.</p>

  <h2 class="toc-heading">The Old Testament</h2>
  <ul class="booklist">${otList}</ul>

  <h2 class="toc-heading">The New Testament</h2>
  <ul class="booklist">${ntList}</ul>
</main>
<footer class="site-foot">
  <div>Copyright © 2025 | <a href="https://www.livingwordbibles.com" target="_blank" rel="noopener">Living Word Bibles</a></div>
  <div>The Holy Bible Online — v1.2 Alpha</div>
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
<footer class="site-foot">
  <div>Copyright © 2025 | <a href="https://www.livingwordbibles.com" target="_blank" rel="noopener">Living Word Bibles</a></div>
  <div>The Holy Bible Online — v1.2 Alpha</div>
</footer>
</body></html>`;
}

// Shared CSS (includes mobile fixes + visible icons)
const CSS = `
:root{--maxw:880px;--bg:#fff;--ink:#111;--muted:#666;--line:#eee}
*{box-sizing:border-box}
body{margin:0;background:#fafafa;color:var(--ink);font-family:"EB Garamond",Garamond,"Times New Roman",serif}
a{color:inherit}
.container{max-width:var(--maxw);margin:1rem auto;background:#fff;border:1px solid #ddd;border-radius:16px;box-shadow:0 2px 16px rgba(0,0,0,.08);padding:1rem 1.2rem}
.site-head,.site-foot{max-width:var(--maxw);margin:1rem auto;padding:.8rem 1rem;display:flex;align-items:center;gap:.8rem;background:#fff;border:1px solid #ddd;border-radius:16px}
.site-head{justify-content:space-between;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:.6rem;text-decoration:none}
.logo{height:64px;object-fit:contain}
.brand-titles .brand-h1{font-weight:700;font-size:1.35rem}
.brand-titles .brand-h2{font-size:1rem;color:#6b7280}
.site-nav{display:flex;flex-wrap:wrap;gap:.5rem}
.btn{border:1px solid #bbb;background:#fff;border-radius:999px;padding:.48rem .9rem;text-decoration:none;display:inline-flex;align-items:center;gap:.4rem}
.btn:hover{background:#f3f3f3}
.btn-primary{border-color:#888}
.ref{margin:.2rem 0 .6rem 0}
.verse p{font-size:1.2rem;line-height:1.75}
.vnum{font-variant-numeric:tabular-nums;color:#666;margin-right:.25rem}
.pager{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);margin-top:1rem;padding-top:.6rem}
.pager .btn{border:1px solid #bbb;background:#fff;border-radius:10px;padding:.42rem .6rem;text-decoration:none}
.share{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;border-top:1px solid var(--line);margin-top:1rem;padding-top:.8rem}
.shbtn{border:1px solid #bbb;background:#fff;border-radius:999px;padding:.38rem .7rem;cursor:pointer;display:inline-flex;align-items:center;gap:.4rem}
.shbtn:hover{background:#f3f3f3}
.shbtn svg{width:18px;height:18px;fill:currentColor;flex:0 0 auto}
.meta{color:var(--muted);font-size:.95rem;margin-top:.6rem}
.site-foot{justify-content:space-between;color:#666}
.booklist{columns:2;gap:1.5rem;margin:.25rem 0 1rem}
.booklist a{text-decoration:none;border-bottom:1px dotted #aaa}
.toc-heading{font-size:1.15rem;margin:.6rem 0 .2rem;color:#333}
.welcome{font-size:1.05rem;margin:0 0 .8rem}
@media (max-width:720px){
  .logo{height:52px}
  .site-nav{width:100%;justify-content:center}
  .site-nav .btn{width:100%;justify-content:center}
  .booklist{columns:1}
}
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
  return await loadJSON("Books.json"); // array of canonical book names
}

async function loadBook(slug, name){
  const raw = await loadJSON(fileFromName(name)); // e.g., SongofSolomon.json
  return normalizeBook(name, raw);
}

function flattenRefs(booksMap){
  const out = [];
  for (const name of [...OT, ...NT]){
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

function urlsByBook(refs){
  const map = new Map(); // slug -> array of absolute URLs
  for (const r of refs){
    const list = map.get(r.bookSlug) || [];
    list.push(`${SITE}${verseUrl(r)}`);
    map.set(r.bookSlug, list);
  }
  return map;
}

function renderUrlset(urls){
  const items = urls.map(u=>`  <url><loc>${u}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

function renderSitemapIndex(entries){
  // entries: array of absolute sitemap URLs
  const items = entries.map(u=>`  <sitemap><loc>${u}</loc></sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}

async function buildAll(){
  await cleanOut();
  await writeStaticAssets();

  const names = await loadIndex();
  const nameSet = new Set(names);

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

  const refs = flattenRefs(books);
  console.log(`Loaded ${books.size} books; generating ${refs.length} verse pages…`);

  // Generate pages + collect URLs
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
  }

  // ---- Sitemaps ----
  const byBook = urlsByBook(refs);
  const smDir = path.join(OUT_DIR, "sitemaps");
  await ensureDir(smDir);

  // main.xml for top-level pages
  const mainUrls = [`${SITE}/`];
  await fs.writeFile(path.join(smDir, "main.xml"), renderUrlset(mainUrls));

  // per-book sitemaps
  const smEntries = [`${SITE}/sitemaps/main.xml`];
  for (const [slug, urls] of byBook.entries()){
    const file = `${slug}.xml`;
    await fs.writeFile(path.join(smDir, file), renderUrlset(urls));
    smEntries.push(`${SITE}/sitemaps/${file}`);
  }

  // sitemap index + alias sitemap.xml
  const smIndex = renderSitemapIndex(smEntries);
  await fs.writeFile(path.join(OUT_DIR, "sitemap-index.xml"), smIndex);
  await fs.writeFile(path.join(OUT_DIR, "sitemap.xml"), smIndex); // alias for convenience

  // robots.txt points to the index
  const robots = `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap-index.xml\n`;
  await fs.writeFile(path.join(OUT_DIR, "robots.txt"), robots);

  console.log("Build complete:", { pages: refs.length, out: OUT_DIR, sitemaps: smEntries.length });
}

// Run
buildAll().catch(err=>{ console.error(err); process.exit(1); });
