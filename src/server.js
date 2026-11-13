const express = require('express');
const cors = require('cors');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const pdfParse = require('pdf-parse');

const { db, genId } = require('./db');
const { indexDocumentChunks, searchKnowledge } = require('./rag');
const { handleChat } = require('./agent');
const { seedIfEmpty } = require('./seed');

seedIfEmpty();

const app = express();
const PORT = Number(process.env.PORT || 3080);

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Simple in-memory rate limiter for /api/chat (60 req/min per IP+site)
const rateBuckets = new Map();
function chatRateLimit(req, res, next) {
  const key = `${req.ip}:${req.body?.site_id || 'unknown'}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + 60_000 };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 60_000;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > 60) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please wait a minute.' });
  }
  next();
}

function getSiteOr404(siteId, res) {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
  if (!site) {
    res.status(404).json({ error: 'Site not found' });
    return null;
  }
  return site;
}

// Healthcheck & favicon
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.get(['/health', '/api/health'], (_req, res) => {
  res.json({ status: 'ok', service: 'sitemind-ai', timestamp: new Date().toISOString() });
});

// Sites CRUD
app.get('/api/sites', (_req, res) => {
  const sites = db.prepare('SELECT * FROM sites ORDER BY created_at ASC').all();
  res.json({ sites });
});

app.post('/api/sites', (req, res) => {
  const { name, domain, widget_title, widget_welcome, widget_color, widget_position, language, system_prompt, price_api_url } = req.body || {};
  if (!name || !domain) {
    return res.status(400).json({ error: 'Fields "name" and "domain" are required' });
  }
  const id = genId('site');
  const apiKey = `sm_live_${crypto.randomBytes(8).toString('hex')}`;
  db.prepare(`
    INSERT INTO sites (id, name, domain, api_key, widget_title, widget_welcome, widget_color, widget_position, language, system_prompt, price_api_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    String(name).trim(),
    String(domain).trim(),
    apiKey,
    widget_title || `Консультант ${String(name).trim()}`,
    widget_welcome || 'Здравствуйте! Чем могу помочь?',
    widget_color || '#0284c7',
    widget_position || 'bottom-right',
    language || 'ru',
    system_prompt || 'Отвечай кратко, вежливо и строго по подтверждённым данным из базы знаний и Live API.',
    price_api_url || ''
  );
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
  res.status(201).json({ site });
});

app.patch('/api/sites/:siteId', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;

  const allowed = [
    'name', 'domain', 'widget_title', 'widget_welcome', 'widget_color',
    'widget_position', 'language', 'system_prompt', 'strict_mode',
    'price_api_url', 'price_api_offline', 'token_budget',
  ];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = ?`);
      if (key === 'strict_mode' || key === 'price_api_offline') {
        values.push(req.body[key] ? 1 : 0);
      } else {
        values.push(req.body[key]);
      }
    }
  }
  if (updates.length > 0) {
    values.push(site.id);
    db.prepare(`UPDATE sites SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  const updated = db.prepare('SELECT * FROM sites WHERE id = ?').get(site.id);
  res.json({ site: updated });
});

app.delete('/api/sites/:siteId', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  db.prepare('DELETE FROM sites WHERE id = ?').run(site.id);
  res.json({ deleted: true });
});

// Public widget config
app.get('/api/sites/:siteId/widget-config', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  res.json({
    id: site.id,
    name: site.name,
    widget_title: site.widget_title,
    widget_welcome: site.widget_welcome,
    widget_color: site.widget_color,
    widget_position: site.widget_position,
    language: site.language,
  });
});

// Knowledge Base
app.get('/api/sites/:siteId/knowledge', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const docs = db.prepare('SELECT id, site_id, title, source_type, source_url, chunk_count, status, updated_at, substr(raw_content, 1, 240) AS preview FROM knowledge_docs WHERE site_id = ? ORDER BY updated_at DESC').all(site.id);
  res.json({ docs });
});

app.post('/api/sites/:siteId/knowledge/text', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const { title, content, source_type = 'txt', source_url = '' } = req.body || {};
  if (!title || !content) {
    return res.status(400).json({ error: 'Fields "title" and "content" are required' });
  }
  const docId = genId('doc');
  db.prepare('INSERT INTO knowledge_docs (id, site_id, title, source_type, source_url, raw_content) VALUES (?, ?, ?, ?, ?, ?)')
    .run(docId, site.id, String(title).trim(), source_type, source_url, String(content).trim());
  const chunks = indexDocumentChunks(site.id, docId, String(content).trim());
  // Invalidate cache on knowledge update
  db.prepare('DELETE FROM response_cache WHERE site_id = ?').run(site.id);
  const doc = db.prepare('SELECT * FROM knowledge_docs WHERE id = ?').get(docId);
  res.status(201).json({ doc, chunks });
});

app.post('/api/sites/:siteId/knowledge/upload', upload.single('file'), async (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const origName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const ext = path.extname(origName).toLowerCase().replace('.', '') || 'txt';
  let text = '';

  try {
    if (ext === 'pdf') {
      const parsed = await pdfParse(req.file.buffer);
      text = parsed.text || '';
    } else {
      text = req.file.buffer.toString('utf8');
    }
  } catch (err) {
    return res.status(400).json({ error: `Failed to parse file: ${err.message}` });
  }

  text = text.trim();
  if (!text) {
    return res.status(400).json({ error: 'Uploaded file contains no readable text' });
  }

  const docId = genId('doc');
  db.prepare('INSERT INTO knowledge_docs (id, site_id, title, source_type, source_url, raw_content) VALUES (?, ?, ?, ?, ?, ?)')
    .run(docId, site.id, origName, ext, '', text);
  const chunks = indexDocumentChunks(site.id, docId, text);
  db.prepare('DELETE FROM response_cache WHERE site_id = ?').run(site.id);
  const doc = db.prepare('SELECT * FROM knowledge_docs WHERE id = ?').get(docId);
  res.status(201).json({ doc, chunks });
});

app.post('/api/sites/:siteId/knowledge/url', async (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const { url, title } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Valid http(s) URL is required' });
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch URL: HTTP ${response.status}` });
    }
    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const extractedTitle = title || (titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : url);
    const cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      return res.status(400).json({ error: 'No readable text extracted from URL' });
    }

    const docId = genId('doc');
    db.prepare('INSERT INTO knowledge_docs (id, site_id, title, source_type, source_url, raw_content) VALUES (?, ?, ?, ?, ?, ?)')
      .run(docId, site.id, extractedTitle, 'url', url, cleanText.slice(0, 30000));
    const chunks = indexDocumentChunks(site.id, docId, cleanText.slice(0, 30000));
    db.prepare('DELETE FROM response_cache WHERE site_id = ?').run(site.id);
    const doc = db.prepare('SELECT * FROM knowledge_docs WHERE id = ?').get(docId);
    res.status(201).json({ doc, chunks });
  } catch (err) {
    res.status(400).json({ error: `URL indexing failed: ${err.message}` });
  }
});

app.post('/api/sites/:siteId/knowledge/search', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Query is required' });
  const results = searchKnowledge(site.id, query, 5);
  res.json({ results });
});

app.post('/api/sites/:siteId/knowledge/:docId/sync', async (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const doc = db.prepare('SELECT * FROM knowledge_docs WHERE id = ? AND site_id = ?').get(req.params.docId, site.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  let content = doc.raw_content;
  if (doc.source_type === 'url' && doc.source_url) {
    try {
      const response = await fetch(doc.source_url, { signal: AbortSignal.timeout(6000) });
      if (response.ok) {
        const html = await response.text();
        content = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 30000);
        db.prepare('UPDATE knowledge_docs SET raw_content = ? WHERE id = ? AND site_id = ?').run(content, doc.id, site.id);
      }
    } catch (err) {
      return res.status(400).json({ error: `Sync failed: ${err.message}` });
    }
  }
  const chunks = indexDocumentChunks(site.id, doc.id, content);
  db.prepare('DELETE FROM response_cache WHERE site_id = ?').run(site.id);
  res.json({ synced: true, chunks });
});

app.delete('/api/sites/:siteId/knowledge/:docId', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  db.prepare('DELETE FROM knowledge_docs WHERE id = ? AND site_id = ?').run(req.params.docId, site.id);
  db.prepare('DELETE FROM response_cache WHERE site_id = ?').run(site.id);
  res.json({ deleted: true });
});

// FAQs
app.get('/api/sites/:siteId/faqs', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const faqs = db.prepare('SELECT * FROM faqs WHERE site_id = ? ORDER BY created_at DESC').all(site.id);
  res.json({ faqs });
});

app.post('/api/sites/:siteId/faqs', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const { question, answer, source_label } = req.body || {};
  if (!question || !answer) {
    return res.status(400).json({ error: 'Fields "question" and "answer" are required' });
  }
  const id = genId('faq');
  db.prepare('INSERT INTO faqs (id, site_id, question, answer, source_label) VALUES (?, ?, ?, ?, ?)')
    .run(id, site.id, String(question).trim(), String(answer).trim(), source_label || 'FAQ');
  const faq = db.prepare('SELECT * FROM faqs WHERE id = ?').get(id);
  res.status(201).json({ faq });
});

app.delete('/api/sites/:siteId/faqs/:faqId', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  db.prepare('DELETE FROM faqs WHERE id = ? AND site_id = ?').run(req.params.faqId, site.id);
  res.json({ deleted: true });
});

// Live Products / Catalog
app.get('/api/sites/:siteId/products', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const products = db.prepare('SELECT * FROM live_products WHERE site_id = ? ORDER BY updated_at DESC, name ASC').all(site.id);
  res.json({ products });
});

app.post('/api/sites/:siteId/products', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const { sku, name, category = 'Общее', price, old_price = null, currency = '€', stock = 10, url = '', description = '' } = req.body || {};
  if (!sku || !name || price === undefined || Number.isNaN(Number(price))) {
    return res.status(400).json({ error: 'Fields "sku", "name", and numeric "price" are required' });
  }
  const id = genId('prd');
  db.prepare('INSERT INTO live_products (id, site_id, sku, name, category, price, old_price, currency, stock, url, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, site.id, String(sku).trim(), String(name).trim(), category, Number(price), old_price ? Number(old_price) : null, currency, Number(stock), url, description);
  const product = db.prepare('SELECT * FROM live_products WHERE id = ?').get(id);
  res.status(201).json({ product });
});

app.patch('/api/sites/:siteId/products/:productId', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const existing = db.prepare('SELECT * FROM live_products WHERE id = ? AND site_id = ?').get(req.params.productId, site.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  const price = req.body.price !== undefined ? Number(req.body.price) : existing.price;
  const stock = req.body.stock !== undefined ? Number(req.body.stock) : existing.stock;
  const old_price = req.body.old_price !== undefined ? (req.body.old_price === null || req.body.old_price === '' ? null : Number(req.body.old_price)) : existing.old_price;
  const name = req.body.name !== undefined ? String(req.body.name).trim() : existing.name;

  db.prepare("UPDATE live_products SET name = ?, price = ?, old_price = ?, stock = ?, updated_at = datetime('now') WHERE id = ? AND site_id = ?")
    .run(name, price, old_price, stock, existing.id, site.id);
  const product = db.prepare('SELECT * FROM live_products WHERE id = ?').get(existing.id);
  res.json({ product });
});

app.delete('/api/sites/:siteId/products/:productId', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  db.prepare('DELETE FROM live_products WHERE id = ? AND site_id = ?').run(req.params.productId, site.id);
  res.json({ deleted: true });
});

// Chat endpoint (used by JS widget, iframe, and REST API)
app.post('/api/chat', chatRateLimit, async (req, res) => {
  const { site_id, message, dialog_id, visitor_id, language, channel } = req.body || {};
  if (!site_id || !message || !String(message).trim()) {
    return res.status(400).json({ error: 'Fields "site_id" and non-empty "message" are required' });
  }
  const site = getSiteOr404(site_id, res);
  if (!site) return;

  try {
    const result = await handleChat({
      site,
      query: String(message),
      dialogId: dialog_id,
      visitorId: visitor_id,
      language,
      channel: channel || 'widget',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `Chat processing error: ${err.message}` });
  }
});

// Confirmed Actions (Orders / Bookings with user confirmation)
app.post('/api/actions/confirm', (req, res) => {
  const { site_id, dialog_id = '', action_type = 'create_order', payload = {} } = req.body || {};
  if (!site_id) return res.status(400).json({ error: 'site_id is required' });
  const site = getSiteOr404(site_id, res);
  if (!site) return;

  if (payload.product_id) {
    const prod = db.prepare('SELECT * FROM live_products WHERE id = ? AND site_id = ?').get(payload.product_id, site.id);
    if (!prod || prod.stock <= 0) {
      return res.status(400).json({ error: 'Товар отсутствует на складе' });
    }
    db.prepare("UPDATE live_products SET stock = stock - 1, updated_at = datetime('now') WHERE id = ? AND site_id = ?").run(prod.id, site.id);
  }

  const actionId = genId('act');
  db.prepare('INSERT INTO confirmed_actions (id, site_id, dialog_id, action_type, payload_json) VALUES (?, ?, ?, ?, ?)')
    .run(actionId, site.id, dialog_id, action_type, JSON.stringify(payload));

  if (dialog_id) {
    db.prepare('INSERT INTO messages (id, dialog_id, site_id, role, content, model_used) VALUES (?, ?, ?, ?, ?, ?)')
      .run(genId('msg'), dialog_id, site.id, 'assistant', `✅ Действие подтверждено (${actionId}): ${payload.name || action_type}. Менеджер получил заявку.`, 'action-executor');
  }

  res.status(201).json({ confirmed: true, action_id: actionId });
});

// Dialogs & Unanswered Questions & Analytics
app.get('/api/sites/:siteId/dialogs', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const dialogs = db.prepare(`
    SELECT d.*,
      (SELECT content FROM messages m WHERE m.dialog_id = d.id ORDER BY m.created_at ASC LIMIT 1) AS first_message,
      (SELECT COUNT(*) FROM messages m WHERE m.dialog_id = d.id) AS message_count
    FROM dialogs d
    WHERE d.site_id = ?
    ORDER BY d.updated_at DESC
    LIMIT 50
  `).all(site.id);
  res.json({ dialogs });
});

app.get('/api/sites/:siteId/dialogs/:dialogId', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const dialog = db.prepare('SELECT * FROM dialogs WHERE id = ? AND site_id = ?').get(req.params.dialogId, site.id);
  if (!dialog) return res.status(404).json({ error: 'Dialog not found' });
  const messages = db.prepare('SELECT * FROM messages WHERE dialog_id = ? AND site_id = ? ORDER BY created_at ASC').all(dialog.id, site.id);
  res.json({ dialog, messages });
});

app.get('/api/sites/:siteId/unanswered', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const items = db.prepare('SELECT * FROM unanswered_questions WHERE site_id = ? AND resolved = 0 ORDER BY created_at DESC').all(site.id);
  res.json({ items });
});

app.post('/api/sites/:siteId/unanswered/:id/resolve', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const item = db.prepare('SELECT * FROM unanswered_questions WHERE id = ? AND site_id = ?').get(req.params.id, site.id);
  if (!item) return res.status(404).json({ error: 'Unanswered item not found' });
  const { answer } = req.body || {};
  if (answer && String(answer).trim()) {
    db.prepare('INSERT INTO faqs (id, site_id, question, answer, source_label) VALUES (?, ?, ?, ?, ?)')
      .run(genId('faq'), site.id, item.question, String(answer).trim(), 'FAQ (из неотвеченных)');
  }
  db.prepare('UPDATE unanswered_questions SET resolved = 1 WHERE id = ? AND site_id = ?').run(item.id, site.id);
  res.json({ resolved: true });
});

app.get('/api/sites/:siteId/analytics', (req, res) => {
  const site = getSiteOr404(req.params.siteId, res);
  if (!site) return;
  const totalDialogs = db.prepare('SELECT COUNT(*) AS cnt FROM dialogs WHERE site_id = ?').get(site.id).cnt;
  const totalMessages = db.prepare('SELECT COUNT(*) AS cnt FROM messages WHERE site_id = ?').get(site.id).cnt;
  const assistantMessages = db.prepare("SELECT COUNT(*) AS cnt FROM messages WHERE site_id = ? AND role = 'assistant'").get(site.id).cnt;
  const cacheHits = db.prepare("SELECT COUNT(*) AS cnt FROM messages WHERE site_id = ? AND role = 'assistant' AND cache_hit = 1").get(site.id).cnt;
  const faqHits = db.prepare("SELECT COUNT(*) AS cnt FROM messages WHERE site_id = ? AND role = 'assistant' AND model_used = 'faq-direct'").get(site.id).cnt;
  const handoffs = db.prepare('SELECT COUNT(*) AS cnt FROM dialogs WHERE site_id = ? AND needs_human = 1').get(site.id).cnt;
  const unansweredCount = db.prepare('SELECT COUNT(*) AS cnt FROM unanswered_questions WHERE site_id = ? AND resolved = 0').get(site.id).cnt;
  const docsCount = db.prepare('SELECT COUNT(*) AS cnt FROM knowledge_docs WHERE site_id = ?').get(site.id).cnt;
  const productsCount = db.prepare('SELECT COUNT(*) AS cnt FROM live_products WHERE site_id = ?').get(site.id).cnt;
  const conversionsCount = db.prepare('SELECT COUNT(*) AS cnt FROM confirmed_actions WHERE site_id = ?').get(site.id).cnt;
  const savingsPct = assistantMessages > 0 ? Math.round(((cacheHits + faqHits) / assistantMessages) * 100) : 0;

  res.json({
    totalDialogs,
    totalMessages,
    assistantMessages,
    cacheHits,
    faqHits,
    savingsPct,
    handoffs,
    unansweredCount,
    docsCount,
    productsCount,
    conversionsCount,
    tokensUsed: site.tokens_used,
    tokenBudget: site.token_budget,
    estimatedCostUsd: Number(((site.tokens_used / 1000) * 0.0004).toFixed(4)),
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SiteMind AI microservice running at http://localhost:${PORT}`);
  });
}

module.exports = { app };
