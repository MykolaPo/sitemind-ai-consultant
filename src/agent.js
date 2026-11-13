const crypto = require('node:crypto');
const { db, genId } = require('./db');
const { normalizeText, tokenize, searchKnowledge, matchFaq } = require('./rag');
const { generateWithProvider } = require('./llm');

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /forget\s+(your\s+)?(rules|instructions|system)/i,
  /reveal\s+(your\s+)?(system\s+prompt|api\s+key|secrets)/i,
  /игнорируй\s+(все\s+)?(предыдущие\s+)?инструкции/i,
  /забудь\s+(все\s+)?правила/i,
  /покажи\s+(системный\s+промпт|api\s*ключ)/i,
  /придумай\s+(цену|скидку|товар)/i,
];

const COMMERCIAL_KEYWORDS = [
  'цена', 'стоит', 'стоимость', 'прайс', 'сколько', 'грн', 'евро', '$', '€', 'uah', '₴', 'eur', 'pln',
  'скидк', 'акци', 'налич', 'остаток', 'купить', 'заказ', 'оформ', 'доставк', 'товар', 'услуг',
  'price', 'cost', 'how much', 'discount', 'stock', 'available', 'buy', 'order',
  'ціна', 'скільки', 'знижк', 'наявн', 'купити', 'замов',
];

const HUMAN_HANDOFF_KEYWORDS = [
  'оператор', 'человек', 'менеджер', 'поддержк', 'жалоб', 'возврат денег',
  'human', 'agent', 'manager', 'support', 'operator',
];

function detectPromptInjection(text) {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

function isCommercialQuery(text, siteProducts = []) {
  const norm = normalizeText(text);
  if (COMMERCIAL_KEYWORDS.some((kw) => norm.includes(kw))) return true;
  const qTokens = tokenize(text);
  for (const prod of siteProducts) {
    const pTokens = tokenize(`${prod.name} ${prod.sku} ${prod.category}`);
    if (qTokens.some((qt) => qt.length >= 3 && pTokens.some((pt) => pt.includes(qt) || qt.includes(pt)))) {
      return true;
    }
  }
  return false;
}

function wantsHumanHandoff(text) {
  const norm = normalizeText(text);
  return HUMAN_HANDOFF_KEYWORDS.some((kw) => norm.includes(kw));
}

async function fetchLiveProducts(site) {
  if (site.price_api_offline) {
    return { ok: false, error: 'LIVE_API_UNAVAILABLE', products: [], sourceLabel: 'Live Price API (Offline)' };
  }

  if (site.price_api_url && site.price_api_url.trim()) {
    try {
      const res = await fetch(site.price_api_url.trim(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) {
        return { ok: false, error: `LIVE_API_HTTP_${res.status}`, products: [], sourceLabel: site.price_api_url };
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : Array.isArray(data.products) ? data.products : [];
      return {
        ok: true,
        products: list,
        sourceLabel: `Live API (${site.price_api_url})`,
        fetchedAt: new Date().toISOString(),
      };
    } catch (_err) {
      return { ok: false, error: 'LIVE_API_UNAVAILABLE', products: [], sourceLabel: site.price_api_url };
    }
  }

  const products = db.prepare('SELECT * FROM live_products WHERE site_id = ? ORDER BY name ASC').all(site.id);
  return {
    ok: true,
    products,
    sourceLabel: 'Live Catalog DB',
    fetchedAt: new Date().toISOString(),
  };
}

function matchProducts(products, query) {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];

  const scored = products.map((p) => {
    const hay = normalizeText(`${p.sku} ${p.name} ${p.category} ${p.description || ''}`);
    const pTokens = tokenize(`${p.sku} ${p.name} ${p.category} ${p.description || ''}`);
    let hits = 0;
    for (const qt of qTokens) {
      if (hay.includes(qt) || pTokens.some((pt) => qt.length >= 4 && pt.startsWith(qt.slice(0, 4)))) {
        hits++;
      }
    }
    return { product: p, hits };
  });

  const matched = scored.filter((s) => s.hits > 0).sort((a, b) => b.hits - a.hits);
  return matched.slice(0, 5).map((m) => m.product);
}

function formatPriceLine(p) {
  const cur = p.currency || '€';
  const priceStr = `${Number(p.price).toLocaleString('ru-RU')} ${cur}`;
  const oldStr = p.old_price ? ` (было ${Number(p.old_price).toLocaleString('ru-RU')} ${cur})` : '';
  const stockStr = Number(p.stock) > 0 ? `в наличии: ${p.stock} шт.` : 'нет в наличии';
  return `• **${p.name}** (${p.sku}) — **${priceStr}**${oldStr} · ${stockStr}`;
}

function getLangMessages(lang = 'ru') {
  if (lang === 'en') {
    return {
      injectionBlocked: 'I cannot follow instructions that override my verification rules. I can only answer using verified site knowledge and live pricing.',
      budgetExceeded: 'The AI token budget for this site has been reached. Please contact the site administrator.',
      apiUnavailable: 'The live pricing and availability source is currently unavailable. To avoid providing outdated or inaccurate prices, I cannot confirm the current price right now. Please check the product page or contact support.',
      noData: 'I could not find verified information for your request in this site’s knowledge base or live catalog. I have logged this question for the team—would you like me to connect you with a human specialist?',
      handoff: 'I have flagged this conversation for a human specialist. An operator will follow up with you shortly.',
      livePrefix: 'Verified live catalog data:',
      kbPrefix: 'From the verified knowledge base:',
      orderReady: 'To place an order, open the product link above or provide your contact details for our manager.',
      orderOutOfStock: 'This item is currently out of stock (0 available), so an immediate order cannot be placed.',
    };
  }
  if (lang === 'uk') {
    return {
      injectionBlocked: 'Запит відхилено системою захисту: я відповідаю лише за перевіреною базою знань та актуальним прайсом.',
      budgetExceeded: 'Вичерпано ліміт токенів для цього сайту. Зверніться до адміністратора.',
      apiUnavailable: 'Джерело актуальних цін та наявності зараз недоступне. Щоб не надати застарілу ціну, я не можу назвати вартість прямо зараз.',
      noData: 'У мене немає підтвердженої інформації за цим запитом у базі знань та каталозі сайту. Я зберіг питання для команди — передати діалог оператору?',
      handoff: 'Я передав ваш запит оператору. Спеціаліст підключиться найближчим часом.',
      livePrefix: 'Актуальні дані з каталогу (перевірено в реальному часі):',
      kbPrefix: 'За даними бази знань сайту:',
      orderReady: 'Для оформлення замовлення перейдіть за посиланням на товар вище або залиште контакт менеджеру.',
      orderOutOfStock: 'Наразі цього товару немає в наявності (0 шт.), тому миттєве замовлення недоступне.',
    };
  }
  return {
    injectionBlocked: 'Запрос отклонён системой защиты: я не могу менять правила работы или выдумывать данные. Я отвечаю строго по проверенной базе знаний и актуальному прайсу.',
    budgetExceeded: 'Исчерпан лимит токенов для данного сайта. Обратитесь к администратору.',
    apiUnavailable: 'Источник актуальных цен и наличия сейчас недоступен. Чтобы не выдать устаревшую или выдуманную цену, я не могу назвать стоимость прямо сейчас. Пожалуйста, уточните на странице товара или у оператора.',
    noData: 'У меня нет подтверждённой информации по этому вопросу в базе знаний и каталоге сайта. Я сохранил ваш вопрос для команды — передать диалог оператору?',
    handoff: 'Я передал ваш запрос оператору. Специалист подключится к диалогу и поможет с решением вопроса.',
    livePrefix: 'Актуальные данные из каталога (проверено в реальном времени):',
    kbPrefix: 'По данным базы знаний сайта:',
    orderReady: 'Для оформления заказа перейдите по ссылке товара выше или оставьте контакт менеджеру.',
    orderOutOfStock: 'К сожалению, выбранный товар сейчас отсутствует на складе (0 шт.), поэтому оформить заказ нельзя.',
  };
}

function ensureDialog(siteId, dialogId, visitorId, language, channel) {
  if (dialogId) {
    const existing = db.prepare('SELECT * FROM dialogs WHERE id = ? AND site_id = ?').get(dialogId, siteId);
    if (existing) {
      db.prepare("UPDATE dialogs SET updated_at = datetime('now') WHERE id = ?").run(existing.id);
      return existing;
    }
  }
  const newId = genId('dlg');
  db.prepare(
    'INSERT INTO dialogs (id, site_id, visitor_id, language, channel) VALUES (?, ?, ?, ?, ?)'
  ).run(newId, siteId, visitorId || genId('vis'), language || 'ru', channel || 'widget');
  return db.prepare('SELECT * FROM dialogs WHERE id = ?').get(newId);
}

function saveMessage(dialogId, siteId, role, content, meta = {}) {
  const id = genId('msg');
  db.prepare(`
    INSERT INTO messages (id, dialog_id, site_id, role, content, sources_json, model_used, cache_hit, tokens_used, needs_human)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    dialogId,
    siteId,
    role,
    content,
    JSON.stringify(meta.sources || []),
    meta.model_used || '',
    meta.cache_hit ? 1 : 0,
    meta.tokens_used || 0,
    meta.needs_human ? 1 : 0
  );
  return id;
}

async function handleChat({ site, query, dialogId, visitorId, language, channel = 'widget' }) {
  const lang = language || site.language || 'ru';
  const msg = getLangMessages(lang);
  const cleanQuery = String(query || '').trim();
  const dialog = ensureDialog(site.id, dialogId, visitorId, lang, channel);

  saveMessage(dialog.id, site.id, 'user', cleanQuery);

  // 1. Prompt injection guard
  if (detectPromptInjection(cleanQuery)) {
    const reply = msg.injectionBlocked;
    saveMessage(dialog.id, site.id, 'assistant', reply, { model_used: 'security-guard', tokens_used: 0 });
    return { dialog_id: dialog.id, answer: reply, sources: [], model_used: 'security-guard', cache_hit: false, tokens_used: 0, needs_human: false };
  }

  // 2. Token budget check
  if (site.tokens_used >= site.token_budget) {
    const reply = msg.budgetExceeded;
    saveMessage(dialog.id, site.id, 'assistant', reply, { model_used: 'budget-guard', tokens_used: 0 });
    return { dialog_id: dialog.id, answer: reply, sources: [], model_used: 'budget-guard', cache_hit: false, tokens_used: 0, needs_human: false };
  }

  // 3. Human handoff request
  if (wantsHumanHandoff(cleanQuery)) {
    db.prepare('UPDATE dialogs SET needs_human = 1 WHERE id = ?').run(dialog.id);
    const reply = msg.handoff;
    saveMessage(dialog.id, site.id, 'assistant', reply, { model_used: 'handoff-router', tokens_used: 0, needs_human: true });
    return { dialog_id: dialog.id, answer: reply, sources: [], model_used: 'handoff-router', cache_hit: false, tokens_used: 0, needs_human: true };
  }

  // Load site products lightly to detect product mentions
  const localSiteProducts = db.prepare('SELECT name, sku, category FROM live_products WHERE site_id = ?').all(site.id);
  const commercial = isCommercialQuery(cleanQuery, localSiteProducts);

  // 4. Resource saving: Response Cache & FAQ Direct Match (only for non-commercial queries so prices are NEVER stale)
  const queryHash = crypto.createHash('sha256').update(`${lang}:${normalizeText(cleanQuery)}`).digest('hex');
  if (!commercial) {
    const cached = db.prepare('SELECT * FROM response_cache WHERE site_id = ? AND query_hash = ?').get(site.id, queryHash);
    if (cached) {
      db.prepare('UPDATE response_cache SET hits = hits + 1 WHERE id = ?').run(cached.id);
      const sources = JSON.parse(cached.sources_json || '[]');
      saveMessage(dialog.id, site.id, 'assistant', cached.answer, {
        sources,
        model_used: 'cache-hit',
        cache_hit: true,
        tokens_used: 0,
      });
      return { dialog_id: dialog.id, answer: cached.answer, sources, model_used: 'cache-hit', cache_hit: true, tokens_used: 0, needs_human: false };
    }

    const faq = matchFaq(site.id, cleanQuery);
    if (faq) {
      db.prepare('UPDATE faqs SET hits = hits + 1 WHERE id = ?').run(faq.id);
      const sources = [{ title: faq.source_label || 'FAQ', type: 'faq', score: faq.score }];
      saveMessage(dialog.id, site.id, 'assistant', faq.answer, {
        sources,
        model_used: 'faq-direct',
        cache_hit: false,
        tokens_used: 0,
      });
      return { dialog_id: dialog.id, answer: faq.answer, sources, model_used: 'faq-direct', cache_hit: false, tokens_used: 0, needs_human: false };
    }
  }

  // 5. Fetch Live Price/Catalog data if commercial or relevant
  let liveResult = { ok: true, products: [], sourceLabel: '' };
  let matchedProducts = [];
  if (commercial) {
    liveResult = await fetchLiveProducts(site);
    if (!liveResult.ok) {
      // Strict anti-hallucination rule: NEVER return stale or invented price when live source is unavailable
      saveMessage(dialog.id, site.id, 'assistant', msg.apiUnavailable, {
        sources: [{ title: liveResult.sourceLabel, type: 'live-api-error' }],
        model_used: 'factuality-guard',
        tokens_used: 0,
        needs_human: true,
      });
      db.prepare('UPDATE dialogs SET needs_human = 1 WHERE id = ?').run(dialog.id);
      return {
        dialog_id: dialog.id,
        answer: msg.apiUnavailable,
        sources: [{ title: liveResult.sourceLabel, type: 'live-api-error' }],
        model_used: 'factuality-guard',
        cache_hit: false,
        tokens_used: 0,
        needs_human: true,
      };
    }
    matchedProducts = matchProducts(liveResult.products, cleanQuery);
    // If user asked general catalog/price list without a specific product name, show top 3 live items
    if (matchedProducts.length === 0 && /каталог|прайс|товар|услуг|catalog|price/i.test(cleanQuery)) {
      matchedProducts = liveResult.products.slice(0, 4);
    }
  }

  // 6. RAG Knowledge Base search
  const kbHits = searchKnowledge(site.id, cleanQuery, 3);

  // 7. Strict Factuality: if neither live products nor KB hits found -> honestly admit & log unanswered
  if (matchedProducts.length === 0 && kbHits.length === 0) {
    db.prepare('INSERT INTO unanswered_questions (id, site_id, question, dialog_id) VALUES (?, ?, ?, ?)')
      .run(genId('unans'), site.id, cleanQuery, dialog.id);
    saveMessage(dialog.id, site.id, 'assistant', msg.noData, {
      sources: [],
      model_used: 'factuality-guard',
      tokens_used: 0,
      needs_human: true,
    });
    return {
      dialog_id: dialog.id,
      answer: msg.noData,
      sources: [],
      model_used: 'factuality-guard',
      cache_hit: false,
      tokens_used: 0,
      needs_human: true,
    };
  }

  // 8. Grounded Response Synthesis & Model Tier Routing
  const complexityScore = kbHits.length + matchedProducts.length;
  const modelUsed = complexityScore >= 3 ? 'local-pro' : 'local-fast';

  const parts = [];
  const sources = [];
  let actionProposal = null;

  if (matchedProducts.length > 0) {
    parts.push(msg.livePrefix);
    for (const p of matchedProducts) {
      parts.push(formatPriceLine(p));
      if (p.url) {
        sources.push({ title: `${p.name} (${p.sku})`, url: p.url, type: 'live-api' });
      }
    }
    if (sources.filter((s) => s.type === 'live-api').length === 0) {
      sources.push({ title: liveResult.sourceLabel, type: 'live-api' });
    }
    if (/заказ|оформ|купить|order|buy|замов|запис/i.test(cleanQuery)) {
      const inStockItem = matchedProducts.find((p) => Number(p.stock) > 0);
      parts.push(inStockItem ? msg.orderReady : msg.orderOutOfStock);
      if (inStockItem) {
        actionProposal = {
          type: 'create_order',
          label: `Подтвердить заказ: ${inStockItem.name} (${inStockItem.price} ${inStockItem.currency || '€'})`,
          product_id: inStockItem.id,
          sku: inStockItem.sku,
          name: inStockItem.name,
          price: inStockItem.price,
          currency: inStockItem.currency || '€',
        };
      }
    }
  }

  if (kbHits.length > 0) {
    if (parts.length > 0) parts.push('');
    parts.push(msg.kbPrefix);
    for (const hit of kbHits) {
      parts.push(hit.content);
      if (!sources.some((s) => s.title === hit.title)) {
        sources.push({
          title: hit.title,
          url: hit.source_url || '',
          type: hit.source_type,
          score: hit.score,
        });
      }
    }
  }

  let answer = parts.join('\n');
  let tokensUsed = Math.max(18, Math.ceil((cleanQuery.length + answer.length) / 4));
  let finalModelUsed = modelUsed;

  if (site.llm_provider && site.llm_provider !== 'local') {
    try {
      const llmRes = await generateWithProvider({
        site,
        query: cleanQuery,
        contextText: answer,
        lang,
        isComplex: complexityScore >= 3,
      });
      if (llmRes && llmRes.text) {
        answer = llmRes.text;
        tokensUsed = llmRes.tokensUsed;
        finalModelUsed = llmRes.modelUsed;
      }
    } catch (_err) {
      // Safe fallback to deterministic grounded response if external LLM fails
    }
  }

  db.prepare('UPDATE sites SET tokens_used = tokens_used + ? WHERE id = ?').run(tokensUsed, site.id);

  // Cache non-commercial RAG responses to save resources on repeat queries
  if (!commercial && kbHits.length > 0) {
    db.prepare(`
      INSERT INTO response_cache (id, site_id, query_hash, query_text, answer, sources_json, hits)
      VALUES (?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(site_id, query_hash) DO UPDATE SET answer = excluded.answer, sources_json = excluded.sources_json
    `).run(genId('cac'), site.id, queryHash, cleanQuery, answer, JSON.stringify(sources));
  }

  saveMessage(dialog.id, site.id, 'assistant', answer, {
    sources,
    model_used: finalModelUsed,
    cache_hit: false,
    tokens_used: tokensUsed,
  });

  return {
    dialog_id: dialog.id,
    answer,
    sources,
    model_used: finalModelUsed,
    cache_hit: false,
    tokens_used: tokensUsed,
    needs_human: false,
    action_proposal: actionProposal,
  };
}

module.exports = {
  handleChat,
  detectPromptInjection,
  isCommercialQuery,
};
