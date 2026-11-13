const { db, genId } = require('./db');

const VECTOR_DIM = 256;

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  const norm = normalizeText(text);
  if (!norm) return [];
  return norm.split(' ').filter((w) => w.length > 1);
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic local embedding (word + character 3-gram hashing into 256-dim L2-normalized vector).
 * Works offline for Russian, Ukrainian, English, and other languages without external APIs.
 */
function embedText(text) {
  const vec = new Array(VECTOR_DIM).fill(0);
  const norm = normalizeText(text);
  if (!norm) return vec;

  const words = norm.split(' ').filter(Boolean);
  for (const w of words) {
    if (w.length >= 2) {
      const idx = hashString(`w:${w}`) % VECTOR_DIM;
      vec[idx] += 2.0;
    }
    const padded = `_${w}_`;
    for (let i = 0; i <= padded.length - 3; i++) {
      const tri = padded.slice(i, i + 3);
      const idx = hashString(`g:${tri}`) % VECTOR_DIM;
      vec[idx] += 1.0;
    }
  }

  let mag = 0;
  for (let i = 0; i < VECTOR_DIM; i++) mag += vec[i] * vec[i];
  mag = Math.sqrt(mag);
  if (mag > 0) {
    for (let i = 0; i < VECTOR_DIM; i++) vec[i] = Number((vec[i] / mag).toFixed(5));
  }
  return vec;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

function chunkText(text, maxChars = 480, overlap = 80) {
  const cleaned = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const paragraphs = cleaned.split(/\n{2,}/);
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;
    if ((current + '\n\n' + p).length <= maxChars) {
      current = current ? `${current}\n\n${p}` : p;
    } else {
      if (current) chunks.push(current);
      if (p.length <= maxChars) {
        current = p;
      } else {
        let start = 0;
        while (start < p.length) {
          const end = Math.min(start + maxChars, p.length);
          chunks.push(p.slice(start, end).trim());
          if (end >= p.length) break;
          start = Math.max(0, end - overlap);
        }
        current = '';
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function indexDocumentChunks(siteId, docId, content) {
  db.prepare('DELETE FROM knowledge_chunks WHERE doc_id = ? AND site_id = ?').run(docId, siteId);
  const chunks = chunkText(content);
  const insertStmt = db.prepare(
    'INSERT INTO knowledge_chunks (id, site_id, doc_id, content, embedding_json, tokens_count) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const chunk of chunks) {
    const emb = embedText(chunk);
    const tokens = tokenize(chunk).length;
    insertStmt.run(genId('chk'), siteId, docId, chunk, JSON.stringify(emb), tokens);
  }
  db.prepare("UPDATE knowledge_docs SET chunk_count = ?, status = 'indexed', updated_at = datetime('now') WHERE id = ? AND site_id = ?")
    .run(chunks.length, docId, siteId);
  return chunks.length;
}

function searchKnowledge(siteId, query, topK = 4) {
  const qVec = embedText(query);
  const qTokens = new Set(tokenize(query));
  const rows = db.prepare(`
    SELECT c.id, c.doc_id, c.content, c.embedding_json, d.title, d.source_type, d.source_url
    FROM knowledge_chunks c
    JOIN knowledge_docs d ON d.id = c.doc_id
    WHERE c.site_id = ?
  `).all(siteId);

  const scored = rows.map((row) => {
    const cVec = JSON.parse(row.embedding_json);
    const cos = cosineSimilarity(qVec, cVec);
    const cTokens = tokenize(row.content);
    let overlapCount = 0;
    for (const t of qTokens) {
      if (cTokens.some((ct) => ct === t || (t.length >= 4 && ct.startsWith(t.slice(0, 4))))) {
        overlapCount++;
      }
    }
    const kwScore = qTokens.size > 0 ? overlapCount / qTokens.size : 0;
    const score = cos * 0.6 + kwScore * 0.4;
    return {
      id: row.id,
      doc_id: row.doc_id,
      title: row.title,
      source_type: row.source_type,
      source_url: row.source_url,
      content: row.content,
      score: Number(score.toFixed(4)),
    };
  });

  return scored
    .filter((item) => item.score >= 0.24)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function matchFaq(siteId, query) {
  const qVec = embedText(query);
  const qTokens = new Set(tokenize(query));
  const faqs = db.prepare('SELECT * FROM faqs WHERE site_id = ?').all(siteId);
  let best = null;

  for (const faq of faqs) {
    const fVec = embedText(faq.question);
    const cos = cosineSimilarity(qVec, fVec);
    const fTokens = tokenize(faq.question);
    let overlap = 0;
    for (const t of qTokens) {
      if (fTokens.some((ft) => ft === t || (t.length >= 4 && ft.startsWith(t.slice(0, 4))))) {
        overlap++;
      }
    }
    const kwScore = qTokens.size > 0 ? overlap / qTokens.size : 0;
    const score = cos * 0.65 + kwScore * 0.35;
    if (score >= 0.52 && (!best || score > best.score)) {
      best = { ...faq, score: Number(score.toFixed(4)) };
    }
  }
  return best;
}

module.exports = {
  normalizeText,
  tokenize,
  embedText,
  chunkText,
  indexDocumentChunks,
  searchKnowledge,
  matchFaq,
};
