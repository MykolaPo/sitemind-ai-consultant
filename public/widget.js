(function () {
  const scriptEl = document.currentScript || document.querySelector('script[data-site-id]');
  if (!scriptEl) return;

  const siteId = scriptEl.getAttribute('data-site-id');
  if (!siteId) return;

  const origin = new URL(scriptEl.src, window.location.href).origin;
  const overrideLang = scriptEl.getAttribute('data-lang');
  const overridePos = scriptEl.getAttribute('data-position');
  const overrideColor = scriptEl.getAttribute('data-color');

  const visitorKey = `sitemind_vis_${siteId}`;
  const dialogKey = `sitemind_dlg_${siteId}`;
  let visitorId = localStorage.getItem(visitorKey);
  if (!visitorId) {
    visitorId = 'vis_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(visitorKey, visitorId);
  }
  let dialogId = localStorage.getItem(dialogKey) || '';

  const host = document.createElement('div');
  host.id = 'sitemind-widget-host';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatRichText(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  }

  async function init() {
    let cfg = {
      widget_title: 'AI-Консультант',
      widget_welcome: 'Здравствуйте! Чем могу помочь?',
      widget_color: '#0284c7',
      widget_position: 'bottom-right',
      language: 'ru',
    };
    try {
      const res = await fetch(`${origin}/api/sites/${encodeURIComponent(siteId)}/widget-config`);
      if (res.ok) cfg = await res.json();
    } catch (_e) {}

    const color = overrideColor || cfg.widget_color || '#0284c7';
    const bg = cfg.widget_bg || '#ffffff';
    const shape = cfg.widget_shape || 'rounded';
    const avatar = (cfg.widget_avatar || '').trim();
    const pos = overridePos || cfg.widget_position || 'bottom-right';
    const lang = overrideLang || cfg.language || 'ru';
    const isLeft = pos === 'bottom-left';

    const panelRadius = shape === 'sharp' ? '6px' : shape === 'pill' ? '24px' : '16px';
    const btnRadius = shape === 'sharp' ? '10px' : '9999px';
    const msgRadius = shape === 'sharp' ? '6px' : shape === 'pill' ? '18px' : '12px';

    function renderAvatarHtml(sizePx) {
      if (avatar && (/^https?:\/\//i.test(avatar) || avatar.startsWith('data:image/'))) {
        return `<img src="${escapeHtml(avatar)}" alt="Avatar" style="width:${sizePx}px;height:${sizePx}px;border-radius:9999px;object-fit:cover;display:block;" />`;
      }
      if (avatar) {
        return `<span style="font-size:${Math.round(sizePx * 0.6)}px;line-height:1;">${escapeHtml(avatar)}</span>`;
      }
      return `<svg width="${Math.round(sizePx * 0.6)}" height="${Math.round(sizePx * 0.6)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
    }

    shadow.innerHTML = `
      <style>
        :host { all: initial; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .sm-wrap {
          position: fixed;
          bottom: 20px;
          ${isLeft ? 'left: 20px;' : 'right: 20px;'}
          z-index: 2147483000;
          display: flex;
          flex-direction: column;
          align-items: ${isLeft ? 'flex-start' : 'flex-end'};
          gap: 12px;
        }
        .sm-btn {
          width: 56px;
          height: 56px;
          border-radius: ${btnRadius};
          border: none;
          background: ${color};
          color: #ffffff;
          cursor: pointer;
          box-shadow: 0 10px 25px -5px rgba(2, 132, 199, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .sm-btn:hover { transform: translateY(-2px); }
        .sm-panel {
          width: 380px;
          max-width: calc(100vw - 24px);
          height: 520px;
          max-height: calc(100vh - 100px);
          background: ${bg};
          border: 1px solid #e2e8f0;
          border-radius: ${panelRadius};
          box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.18);
          display: none;
          flex-direction: column;
          overflow: hidden;
        }
        .sm-panel.open { display: flex; }
        .sm-head {
          background: ${bg};
          border-bottom: 1px solid #e2e8f0;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .sm-title-wrap { display: flex; align-items: center; gap: 10px; }
        .sm-avatar {
          width: 32px;
          height: 32px;
          border-radius: 9999px;
          background: ${color};
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }
        .sm-dot { width: 8px; height: 8px; border-radius: 9999px; background: #10b981; display: inline-block; margin-right: 4px; }
        .sm-title { font-weight: 700; font-size: 14px; color: #0f172a; }
        .sm-sub { font-size: 11px; color: #64748b; display: flex; align-items: center; }
        .sm-close {
          background: transparent;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          width: 28px;
          height: 28px;
          cursor: pointer;
          color: #64748b;
          font-size: 16px;
          line-height: 1;
        }
        .sm-msgs {
          flex: 1;
          overflow-y: auto;
          padding: 14px;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sm-msg {
          max-width: 86%;
          padding: 10px 12px;
          border-radius: ${msgRadius};
          font-size: 13px;
          line-height: 1.45;
          word-wrap: break-word;
        }
        .sm-msg.bot {
          align-self: flex-start;
          background: ${bg};
          border: 1px solid #e2e8f0;
          color: #0f172a;
        }
        .sm-msg.user {
          align-self: flex-end;
          background: ${color};
          color: #ffffff;
        }
        .sm-sources {
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px solid #f1f5f9;
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .sm-badge {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 6px;
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          color: #0369a1;
          text-decoration: none;
        }
        .sm-meta {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10px;
          color: #94a3b8;
          margin-top: 4px;
        }
        .sm-form {
          display: flex;
          gap: 8px;
          padding: 10px 12px;
          background: ${bg};
          border-top: 1px solid #e2e8f0;
        }
        .sm-input {
          flex: 1;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 13px;
          outline: none;
          color: #0f172a;
        }
        .sm-input:focus { border-color: ${color}; }
        .sm-send {
          border: none;
          border-radius: 10px;
          background: ${color};
          color: #ffffff;
          padding: 0 14px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
        }
        .sm-send:disabled { opacity: 0.6; cursor: not-allowed; }
      </style>
      <div class="sm-wrap">
        <div class="sm-panel" id="smPanel" role="dialog" aria-label="AI Consultant">
          <div class="sm-head">
            <div class="sm-title-wrap">
              <div class="sm-avatar">${renderAvatarHtml(32)}</div>
              <div>
                <div class="sm-title">${escapeHtml(cfg.widget_title)}</div>
                <div class="sm-sub"><span class="sm-dot"></span>Проверенные данные · Live API</div>
              </div>
            </div>
            <button class="sm-close" id="smClose" aria-label="Закрыть">×</button>
          </div>
          <div class="sm-msgs" id="smMsgs">
            <div class="sm-msg bot">${formatRichText(cfg.widget_welcome)}</div>
          </div>
          <form class="sm-form" id="smForm">
            <input class="sm-input" id="smInput" type="text" placeholder="${lang === 'en' ? 'Ask about products, prices...' : 'Спросите о товаре, цене, доставке...'}" autocomplete="off" />
            <button class="sm-send" id="smSend" type="submit">→</button>
          </form>
        </div>
        <button class="sm-btn" id="smToggle" aria-label="Открыть чат с AI-консультантом">
          ${renderAvatarHtml(34)}
        </button>
      </div>
    `;

    const panel = shadow.getElementById('smPanel');
    const toggle = shadow.getElementById('smToggle');
    const closeBtn = shadow.getElementById('smClose');
    const form = shadow.getElementById('smForm');
    const input = shadow.getElementById('smInput');
    const sendBtn = shadow.getElementById('smSend');
    const msgs = shadow.getElementById('smMsgs');

    toggle.addEventListener('click', () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) input.focus();
    });
    closeBtn.addEventListener('click', () => panel.classList.remove('open'));

    function appendMessage(role, text, meta) {
      const div = document.createElement('div');
      div.className = `sm-msg ${role}`;
      let html = formatRichText(text);
      if (role === 'bot' && meta) {
        if (meta.sources && meta.sources.length > 0) {
          html += '<div class="sm-sources">';
          for (const s of meta.sources) {
            if (s.url) {
              html += `<a class="sm-badge" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a>`;
            } else {
              html += `<span class="sm-badge">${escapeHtml(s.title)}</span>`;
            }
          }
          html += '</div>';
        }
        if (meta.model_used) {
          html += `<div class="sm-meta">${escapeHtml(meta.model_used)}${meta.cache_hit ? ' · cached' : ''}</div>`;
        }
      }
      div.innerHTML = html;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      appendMessage('user', text);
      sendBtn.disabled = true;

      try {
        const res = await fetch(`${origin}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            site_id: siteId,
            message: text,
            dialog_id: dialogId || undefined,
            visitor_id: visitorId,
            language: lang,
            channel: 'widget',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          appendMessage('bot', data.error || 'Ошибка сервиса');
        } else {
          if (data.dialog_id) {
            dialogId = data.dialog_id;
            localStorage.setItem(dialogKey, dialogId);
          }
          appendMessage('bot', data.answer, data);
        }
      } catch (_err) {
        appendMessage('bot', 'Не удалось связаться с сервером консультанта.');
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
