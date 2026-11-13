let sites = [];
let currentSiteId = '';
let currentDialogId = '';

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatRichText(str) {
  return escapeHtml(str)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
    if (tab === 'analytics') loadAnalyticsAndDialogs();
  });
});

async function loadSites() {
  const data = await api('/api/sites');
  sites = data.sites;
  const sel = $('siteSelector');
  sel.innerHTML = sites.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  if (!currentSiteId || !sites.some((s) => s.id === currentSiteId)) {
    currentSiteId = sites[0]?.id || '';
  }
  sel.value = currentSiteId;
  await refreshCurrentSite();
}

function getCurrentSite() {
  return sites.find((s) => s.id === currentSiteId);
}

async function refreshCurrentSite() {
  const site = getCurrentSite();
  if (!site) return;
  currentDialogId = '';

  $('siteHeaderName').textContent = site.name;
  $('siteHeaderDomain').textContent = site.domain;
  $('siteHeaderKey').textContent = site.api_key;

  const origin = window.location.origin;
  $('embedScriptCode').textContent = `<script src="${origin}/widget.js" data-site-id="${site.id}" data-lang="${site.language}" data-position="${site.widget_position}" data-color="${site.widget_color}" async></script>`;
  $('embedApiCode').textContent = `curl -X POST ${origin}/api/chat -H "Content-Type: application/json" -d '{"site_id":"${site.id}","message":"Сколько стоит товар?"}'`;

  $('cfgTitle').value = site.widget_title || '';
  $('cfgWelcome').value = site.widget_welcome || '';
  $('cfgColor').value = site.widget_color || '#0284c7';
  $('cfgPos').value = site.widget_position || 'bottom-right';
  $('cfgLang').value = site.language || 'ru';
  $('cfgPrompt').value = site.system_prompt || '';
  $('cfgStrict').checked = Boolean(site.strict_mode);

  $('priceApiUrlInput').value = site.price_api_url || '';
  $('simulateOfflineToggle').checked = Boolean(site.price_api_offline);

  $('previewTitle').textContent = site.widget_title || 'AI-Консультант';
  $('chatSendBtn').style.backgroundColor = site.widget_color || '#0284c7';

  resetChatPreview();
  await Promise.all([loadKnowledge(), loadFaqs(), loadProducts(), loadAnalyticsAndDialogs()]);
}

function resetChatPreview() {
  currentDialogId = '';
  const site = getCurrentSite();
  $('chatMessages').innerHTML = '';
  appendChatMessage('bot', site?.widget_welcome || 'Здравствуйте! Чем могу помочь?');
}

function appendChatMessage(role, text, meta = null) {
  const site = getCurrentSite();
  const color = site?.widget_color || '#0284c7';
  const wrap = document.createElement('div');
  wrap.className = role === 'user' ? 'flex justify-end' : 'flex justify-start';

  const bubble = document.createElement('div');
  bubble.className = role === 'user'
    ? 'max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] text-white shadow-sm'
    : 'max-w-[90%] rounded-xl px-3.5 py-2.5 text-[13px] bg-white border border-slate-200 text-slate-900 shadow-sm';
  if (role === 'user') bubble.style.backgroundColor = color;

  let html = formatRichText(text);
  if (role === 'bot' && meta) {
    if (meta.sources && meta.sources.length > 0) {
      html += '<div class="mt-2 pt-1.5 border-t border-slate-100 flex flex-wrap gap-1">';
      for (const s of meta.sources) {
        const badge = `<span class="font-label-code-sm text-[10px] px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-700">${escapeHtml(s.title)}</span>`;
        html += s.url ? `<a href="${escapeHtml(s.url)}" target="_blank">${badge}</a>` : badge;
      }
      html += '</div>';
    }
    if (meta.model_used) {
      html += `<div class="mt-1 font-label-code-sm text-[10px] text-slate-400">${escapeHtml(meta.model_used)} · ${meta.tokens_used || 0} tok${meta.cache_hit ? ' · cache' : ''}</div>`;
    }
  }
  bubble.innerHTML = html;
  wrap.appendChild(bubble);
  const box = $('chatMessages');
  box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;
}

$('siteSelector').addEventListener('change', (e) => {
  currentSiteId = e.target.value;
  refreshCurrentSite();
});

$('copyScriptBtn').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('embedScriptCode').textContent);
  $('copyScriptBtn').textContent = 'Скопировано!';
  setTimeout(() => {
    $('copyScriptBtn').innerHTML = '<span class="material-symbols-outlined text-[14px]">content_copy</span> Копировать';
  }, 1500);
});

// Save Site Settings
$('siteSettingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await api(`/api/sites/${currentSiteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      widget_title: $('cfgTitle').value,
      widget_welcome: $('cfgWelcome').value,
      widget_color: $('cfgColor').value,
      widget_position: $('cfgPos').value,
      language: $('cfgLang').value,
      system_prompt: $('cfgPrompt').value,
      strict_mode: $('cfgStrict').checked,
    }),
  });
  sites = sites.map((s) => (s.id === currentSiteId ? res.site : s));
  $('settingsSavedBadge').classList.remove('hidden');
  setTimeout(() => $('settingsSavedBadge').classList.add('hidden'), 2000);
  refreshCurrentSite();
});

// Knowledge Base
async function loadKnowledge() {
  const data = await api(`/api/sites/${currentSiteId}/knowledge`);
  $('docsCountBadge').textContent = data.docs.length;
  const list = $('docsList');
  if (data.docs.length === 0) {
    list.innerHTML = '<p class="text-[12px] text-slate-400">Документов пока нет.</p>';
    return;
  }
  list.innerHTML = data.docs.map((d) => `
    <div class="rounded-lg bg-slate-50 border border-slate-200 p-3 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-semibold text-[13px] text-slate-900">${escapeHtml(d.title)}</span>
          <span class="font-label-code-sm text-[10px] px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-700 uppercase">${escapeHtml(d.source_type)}</span>
          <span class="font-label-numeric text-[11px] text-slate-500">${d.chunk_count} фрагм.</span>
        </div>
        <p class="text-[12px] text-slate-500 mt-1 line-clamp-2">${escapeHtml(d.preview)}</p>
      </div>
      <button onclick="deleteDoc('${d.id}')" class="text-slate-400 hover:text-red-600 p-1" title="Удалить">
        <span class="material-symbols-outlined text-[18px]">delete</span>
      </button>
    </div>
  `).join('');
}

window.deleteDoc = async (docId) => {
  await api(`/api/sites/${currentSiteId}/knowledge/${docId}`, { method: 'DELETE' });
  await loadKnowledge();
};

$('uploadFileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = $('kbFileInput').files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  await api(`/api/sites/${currentSiteId}/knowledge/upload`, { method: 'POST', body: fd });
  $('kbFileInput').value = '';
  await loadKnowledge();
});

$('addTextDocForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api(`/api/sites/${currentSiteId}/knowledge/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: $('kbTextTitle').value, content: $('kbTextContent').value }),
  });
  $('kbTextTitle').value = '';
  $('kbTextContent').value = '';
  await loadKnowledge();
});

$('addUrlForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api(`/api/sites/${currentSiteId}/knowledge/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: $('kbUrlInput').value }),
    });
    $('kbUrlInput').value = '';
    await loadKnowledge();
  } catch (err) {
    alert(err.message);
  }
});

// FAQs
async function loadFaqs() {
  const data = await api(`/api/sites/${currentSiteId}/faqs`);
  $('faqsCountBadge').textContent = data.faqs.length;
  const list = $('faqsList');
  if (data.faqs.length === 0) {
    list.innerHTML = '<p class="text-[12px] text-slate-400">FAQ-пар пока нет.</p>';
    return;
  }
  list.innerHTML = data.faqs.map((f) => `
    <div class="rounded-lg bg-slate-50 border border-slate-200 p-3 flex items-start justify-between gap-3">
      <div>
        <div class="font-semibold text-[13px] text-slate-900">${escapeHtml(f.question)}</div>
        <div class="text-[12px] text-slate-600 mt-0.5">${escapeHtml(f.answer)}</div>
        <div class="font-label-code-sm text-[10px] text-sky-700 mt-1">Использований: ${f.hits} (0 токенов)</div>
      </div>
      <button onclick="deleteFaq('${f.id}')" class="text-slate-400 hover:text-red-600 p-1">
        <span class="material-symbols-outlined text-[18px]">delete</span>
      </button>
    </div>
  `).join('');
}

window.deleteFaq = async (faqId) => {
  await api(`/api/sites/${currentSiteId}/faqs/${faqId}`, { method: 'DELETE' });
  await loadFaqs();
};

$('addFaqForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api(`/api/sites/${currentSiteId}/faqs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: $('faqQuestion').value, answer: $('faqAnswer').value }),
  });
  $('faqQuestion').value = '';
  $('faqAnswer').value = '';
  await loadFaqs();
});

// Live Pricing
async function loadProducts() {
  const data = await api(`/api/sites/${currentSiteId}/products`);
  const tbody = $('productsTableBody');
  if (data.products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-[12px] text-slate-400">Товаров/услуг пока нет.</td></tr>';
    return;
  }
  tbody.innerHTML = data.products.map((p) => `
    <tr>
      <td class="py-2 pr-3 font-label-code-sm text-[12px] text-slate-600">${escapeHtml(p.sku)}</td>
      <td class="py-2 pr-3 font-medium text-slate-900">${escapeHtml(p.name)}</td>
      <td class="py-2 pr-3">
        <input id="price_${p.id}" type="number" step="0.01" value="${p.price}" class="w-24 rounded-md border-slate-200 text-[12px] font-label-numeric py-1 px-2" />
      </td>
      <td class="py-2 pr-3">
        <input id="stock_${p.id}" type="number" value="${p.stock}" class="w-16 rounded-md border-slate-200 text-[12px] font-label-numeric py-1 px-2" />
      </td>
      <td class="py-2 text-right space-x-1 whitespace-nowrap">
        <button onclick="saveProduct('${p.id}')" class="px-2 py-1 rounded bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-[11px] font-semibold">Обновить</button>
        <button onclick="deleteProduct('${p.id}')" class="px-2 py-1 rounded text-slate-400 hover:text-red-600 text-[11px]">Удалить</button>
      </td>
    </tr>
  `).join('');
}

window.saveProduct = async (productId) => {
  const price = Number($(`price_${productId}`).value);
  const stock = Number($(`stock_${productId}`).value);
  await api(`/api/sites/${currentSiteId}/products/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ price, stock }),
  });
  await loadProducts();
};

window.deleteProduct = async (productId) => {
  await api(`/api/sites/${currentSiteId}/products/${productId}`, { method: 'DELETE' });
  await loadProducts();
};

$('addProductForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api(`/api/sites/${currentSiteId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sku: $('prodSku').value,
      name: $('prodName').value,
      price: Number($('prodPrice').value),
      stock: Number($('prodStock').value),
    }),
  });
  $('prodSku').value = '';
  $('prodName').value = '';
  $('prodPrice').value = '';
  await loadProducts();
});

$('priceApiForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await api(`/api/sites/${currentSiteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ price_api_url: $('priceApiUrlInput').value }),
  });
  sites = sites.map((s) => (s.id === currentSiteId ? res.site : s));
});

$('simulateOfflineToggle').addEventListener('change', async (e) => {
  const res = await api(`/api/sites/${currentSiteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ price_api_offline: e.target.checked }),
  });
  sites = sites.map((s) => (s.id === currentSiteId ? res.site : s));
});

// Analytics & Dialogs
async function loadAnalyticsAndDialogs() {
  const [an, dl, un] = await Promise.all([
    api(`/api/sites/${currentSiteId}/analytics`),
    api(`/api/sites/${currentSiteId}/dialogs`),
    api(`/api/sites/${currentSiteId}/unanswered`),
  ]);

  $('kpiDialogs').textContent = an.totalDialogs;
  $('kpiSavings').textContent = `${an.savingsPct}%`;
  $('kpiTokens').textContent = `${an.tokensUsed.toLocaleString('ru-RU')} ($${an.estimatedCostUsd})`;
  $('kpiUnanswered').textContent = an.unansweredCount;

  const unList = $('unansweredList');
  if (un.items.length === 0) {
    unList.innerHTML = '<p class="text-[12px] text-slate-400">Все вопросы имеют подтверждённые ответы.</p>';
  } else {
    unList.innerHTML = un.items.map((u) => `
      <div class="rounded-lg bg-amber-50/70 border border-amber-200 p-3 space-y-2">
        <div class="text-[13px] font-semibold text-slate-900">${escapeHtml(u.question)}</div>
        <div class="flex gap-2">
          <input id="ans_${u.id}" type="text" placeholder="Введите точный ответ для добавления в FAQ..." class="flex-1 rounded-md border-slate-200 text-[12px] py-1" />
          <button onclick="resolveUnanswered('${u.id}')" class="px-3 py-1 rounded-md bg-sky-600 text-white text-[11px] font-semibold">В FAQ</button>
        </div>
      </div>
    `).join('');
  }

  const dlList = $('dialogsList');
  if (dl.dialogs.length === 0) {
    dlList.innerHTML = '<p class="text-[12px] text-slate-400">Диалогов пока нет.</p>';
  } else {
    dlList.innerHTML = dl.dialogs.map((d) => `
      <button onclick="openDialog('${d.id}')" class="w-full text-left rounded-lg bg-slate-50 hover:bg-sky-50 border border-slate-200 p-2.5 transition-colors">
        <div class="flex items-center justify-between text-[11px] font-label-code-sm text-slate-500">
          <span>${escapeHtml(d.visitor_id)}</span>
          <span>${d.message_count} сообщ.</span>
        </div>
        <div class="text-[12px] font-medium text-slate-900 truncate mt-1">${escapeHtml(d.first_message || 'Новый диалог')}</div>
      </button>
    `).join('');
  }
}

window.resolveUnanswered = async (id) => {
  const answer = $(`ans_${id}`).value;
  await api(`/api/sites/${currentSiteId}/unanswered/${id}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  });
  await Promise.all([loadAnalyticsAndDialogs(), loadFaqs()]);
};

window.openDialog = async (dialogId) => {
  const data = await api(`/api/sites/${currentSiteId}/dialogs/${dialogId}`);
  $('dialogDetail').innerHTML = data.messages.map((m) => `
    <div class="mb-2.5 p-2 rounded-lg ${m.role === 'user' ? 'bg-sky-50 border border-sky-100' : 'bg-white border border-slate-200'}">
      <div class="flex items-center justify-between text-[10px] font-label-code-sm text-slate-400 mb-1">
        <span>${m.role === 'user' ? 'Посетитель' : 'AI-Агент'}</span>
        <span>${escapeHtml(m.model_used || '')}</span>
      </div>
      <div class="text-[12px] text-slate-800">${formatRichText(m.content)}</div>
    </div>
  `).join('');
};

// Interactive Sandbox Chat
async function sendChat(text) {
  if (!text.trim()) return;
  appendChatMessage('user', text);
  $('chatSendBtn').disabled = true;
  try {
    const data = await api('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_id: currentSiteId,
        message: text,
        dialog_id: currentDialogId || undefined,
        visitor_id: 'admin_sandbox',
        channel: 'sandbox',
      }),
    });
    currentDialogId = data.dialog_id;
    appendChatMessage('bot', data.answer, data);
    loadAnalyticsAndDialogs();
  } catch (err) {
    appendChatMessage('bot', `Ошибка: ${err.message}`);
  } finally {
    $('chatSendBtn').disabled = false;
  }
}

$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const val = $('chatInput').value;
  $('chatInput').value = '';
  sendChat(val);
});

$('resetChatBtn').addEventListener('click', resetChatPreview);
document.querySelectorAll('.quick-q').forEach((btn) => {
  btn.addEventListener('click', () => sendChat(btn.dataset.q));
});

// New Site Modal
$('openNewSiteBtn').addEventListener('click', () => $('newSiteModal').classList.remove('hidden'));
$('closeNewSiteBtn').addEventListener('click', () => $('newSiteModal').classList.add('hidden'));
$('cancelNewSiteBtn').addEventListener('click', () => $('newSiteModal').classList.add('hidden'));
$('newSiteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await api('/api/sites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: $('newSiteName').value, domain: $('newSiteDomain').value }),
  });
  $('newSiteName').value = '';
  $('newSiteDomain').value = '';
  $('newSiteModal').classList.add('hidden');
  currentSiteId = res.site.id;
  await loadSites();
});

loadSites();
