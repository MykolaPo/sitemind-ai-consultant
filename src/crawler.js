const { db, genId } = require('./db');
const { indexDocumentChunks } = require('./rag');

function extractCleanText(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title, text: text.slice(0, 30000) };
}

function extractSameOriginLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const links = new Set();
  const re = /href\s*=\s*["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const resolved = new URL(m[1], base);
      if (resolved.origin === base.origin && /^https?:$/.test(resolved.protocol)) {
        if (!/\.(jpg|jpeg|png|gif|svg|webp|css|js|pdf|zip|ico)$/i.test(resolved.pathname)) {
          resolved.hash = '';
          links.add(resolved.href);
        }
      }
    } catch (_e) {}
  }
  return Array.from(links);
}

async function fetchSitemapUrls(baseUrl, maxPages) {
  try {
    const origin = new URL(baseUrl).origin;
    const res = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const urls = [];
    const re = /<loc>([\s\S]*?)<\/loc>/gi;
    let m;
    while ((m = re.exec(xml)) !== null && urls.length < maxPages) {
      const u = m[1].trim();
      if (/^https?:\/\//i.test(u)) urls.push(u);
    }
    return urls;
  } catch (_e) {
    return [];
  }
}

async function crawlAndIndexSite(siteId, startUrl, maxPages = 8) {
  const visited = new Set();
  const queue = [startUrl];

  const sitemapUrls = await fetchSitemapUrls(startUrl, maxPages);
  for (const u of sitemapUrls) {
    if (!queue.includes(u)) queue.push(u);
  }

  const indexed = [];
  while (queue.length > 0 && indexed.length < maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) continue;

      const html = await res.text();
      const { title, text } = extractCleanText(html);
      if (!text || text.length < 40) continue;

      const existing = db.prepare('SELECT id FROM knowledge_docs WHERE site_id = ? AND source_url = ?').get(siteId, url);
      const docId = existing ? existing.id : genId('doc');
      if (existing) {
        db.prepare("UPDATE knowledge_docs SET title = ?, raw_content = ?, updated_at = datetime('now') WHERE id = ? AND site_id = ?")
          .run(title || url, text, docId, siteId);
      } else {
        db.prepare('INSERT INTO knowledge_docs (id, site_id, title, source_type, source_url, raw_content) VALUES (?, ?, ?, ?, ?, ?)')
          .run(docId, siteId, title || url, 'url', url, text);
      }
      const chunks = indexDocumentChunks(siteId, docId, text);
      indexed.push({ id: docId, url, title: title || url, chunks });

      if (indexed.length < maxPages) {
        for (const link of extractSameOriginLinks(html, url)) {
          if (!visited.has(link) && !queue.includes(link)) queue.push(link);
        }
      }
    } catch (_e) {}
  }

  db.prepare('DELETE FROM response_cache WHERE site_id = ?').run(siteId);
  return indexed;
}

async function syncAllUrlDocs(siteId) {
  const docs = db.prepare("SELECT * FROM knowledge_docs WHERE site_id = ? AND source_type = 'url' AND source_url != ''").all(siteId);
  let updated = 0;
  for (const doc of docs) {
    try {
      const res = await fetch(doc.source_url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const html = await res.text();
      const { text } = extractCleanText(html);
      if (text && text !== doc.raw_content) {
        db.prepare("UPDATE knowledge_docs SET raw_content = ?, updated_at = datetime('now') WHERE id = ? AND site_id = ?")
          .run(text, doc.id, siteId);
        indexDocumentChunks(siteId, doc.id, text);
        updated++;
      }
    } catch (_e) {}
  }
  if (updated > 0) {
    db.prepare('DELETE FROM response_cache WHERE site_id = ?').run(siteId);
  }
  return { total: docs.length, updated };
}

module.exports = {
  extractCleanText,
  crawlAndIndexSite,
  syncAllUrlDocs,
};
