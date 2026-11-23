(function () {
  const scriptEl = document.currentScript || document.querySelector('script[data-site-id]');
  if (!scriptEl) return;

  const siteId = scriptEl.getAttribute('data-site-id');
  if (!siteId) return;

  const origin = new URL(scriptEl.src, window.location.href).origin;
  const overrideLang = scriptEl.getAttribute('data-lang');
  const overridePos = scriptEl.getAttribute('data-position');
  const overrideColor = scriptEl.getAttribute('data-color');
  const overrideTheme = (scriptEl.getAttribute('data-theme') || '').toLowerCase();

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
    const isWin98 = overrideTheme === 'win98';
    const isLeft = pos === 'bottom-left';
    const isEn = lang === 'en';

    const panelRadius = isWin98 ? '0px' : (shape === 'sharp' ? '6px' : shape === 'pill' ? '24px' : '16px');
    const btnRadius = isWin98 ? '0px' : (shape === 'sharp' ? '10px' : '9999px');
    const msgRadius = isWin98 ? '0px' : (shape === 'sharp' ? '6px' : shape === 'pill' ? '18px' : '12px');

    const subtitleText = isEn ? 'Verified 24/7 AI Concierge · Online' : 'Проверенные данные · Live API';
    const placeholderText = isEn ? 'Ask about treatments, prices, or booking...' : 'Спросите о товаре, цене, доставке...';
    const closeLabel = isEn ? 'Close' : 'Закрыть';
    const toggleLabel = isEn ? 'Open AI Concierge chat' : 'Открыть чат с AI-консультантом';

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
        :host { all: initial; font-family: ${isWin98 ? "'Tahoma', 'MS Sans Serif', 'Segoe UI', sans-serif" : "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"}; }
        .sm-wrap {
          position: fixed;
          bottom: ${isWin98 ? '48px' : '20px'};
          ${isLeft ? 'left: 20px;' : 'right: 20px;'}
          z-index: 2147483000;
          display: flex;
          flex-direction: column;
          align-items: ${isLeft ? 'flex-start' : 'flex-end'};
          gap: 10px;
        }
        .sm-btn {
          ${isWin98 ? `
          height: 40px;
          padding: 0 14px;
          border-radius: 0;
          background: #c0c0c0;
          color: #000000;
          border: 2px solid;
          border-color: #ffffff #000000 #000000 #ffffff;
          box-shadow: inset 1px 1px 0 #dfdfdf, inset -1px -1px 0 #808080, 3px 3px 0 rgba(0,0,0,0.35);
          font-weight: 700;
          font-size: 12px;
          gap: 8px;
          ` : `
          width: 56px;
          height: 56px;
          border-radius: ${btnRadius};
          border: none;
          background: ${color};
          color: #ffffff;
          box-shadow: 0 10px 25px -5px rgba(2, 132, 199, 0.45);
          `}
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }
        .sm-btn:hover { transform: translateY(-2px); }
        ${isWin98 ? `.sm-btn:active { border-color: #000000 #ffffff #ffffff #000000; box-shadow: inset 1px 1px 0 #808080; transform: translate(1px, 1px); }` : ''}
        .sm-panel {
          width: 380px;
          max-width: calc(100vw - 24px);
          height: 500px;
          max-height: calc(100vh - 120px);
          background: ${isWin98 ? '#c0c0c0' : bg};
          border: ${isWin98 ? '2px solid' : '1px solid #e2e8f0'};
          ${isWin98 ? 'border-color: #ffffff #000000 #000000 #ffffff; box-shadow: inset 1px 1px 0 #dfdfdf, inset -1px -1px 0 #808080, 4px 4px 0 rgba(0,0,0,0.4); padding: 3px;' : 'box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.18);'}
          border-radius: ${panelRadius};
          display: none;
          flex-direction: column;
          overflow: hidden;
        }
        .sm-panel.open { display: flex; }
        .sm-head {
          background: ${isWin98 ? 'linear-gradient(90deg, #000080, #1084d0)' : bg};
          border-bottom: ${isWin98 ? '2px solid #c0c0c0' : '1px solid #e2e8f0'};
          padding: ${isWin98 ? '5px 8px' : '14px 16px'};
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .sm-title-wrap { display: flex; align-items: center; gap: 8px; }
        .sm-avatar {
          width: ${isWin98 ? '22px' : '32px'};
          height: ${isWin98 ? '22px' : '32px'};
          border-radius: ${isWin98 ? '0px' : '9999px'};
          background: ${isWin98 ? '#008080' : color};
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }
        .sm-dot { width: 8px; height: 8px; border-radius: ${isWin98 ? '0' : '9999px'}; background: #10b981; display: inline-block; margin-right: 4px; }
        .sm-title { font-weight: 700; font-size: ${isWin98 ? '12px' : '14px'}; color: ${isWin98 ? '#ffffff' : '#0f172a'}; }
        .sm-sub { font-size: 10px; color: ${isWin98 ? '#dbeafe' : '#64748b'}; display: flex; align-items: center; }
        .sm-close {
          background: ${isWin98 ? '#c0c0c0' : 'transparent'};
          border: ${isWin98 ? '1px solid' : '1px solid #e2e8f0'};
          ${isWin98 ? 'border-color: #ffffff #000000 #000000 #ffffff; box-shadow: inset 1px 1px 0 #dfdfdf, inset -1px -1px 0 #808080; width: 16px; height: 14px; color: #000000; display: inline-flex; align-items: center; justify-content: center;' : 'border-radius: 8px; width: 28px; height: 28px; color: #64748b; font-size: 16px;'}
          cursor: pointer;
          line-height: 1;
          padding: 0;
        }
        .sm-msgs {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          background: ${isWin98 ? '#ffffff' : '#f8fafc'};
          ${isWin98 ? 'border: 2px solid; border-color: #808080 #ffffff #ffffff #808080; box-shadow: inset 1px 1px 0 #000000; margin: 4px 2px;' : ''}
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sm-msg {
          max-width: 86%;
          padding: 9px 11px;
          border-radius: ${msgRadius};
          font-size: ${isWin98 ? '12px' : '13px'};
          line-height: 1.45;
          word-wrap: break-word;
        }
        .sm-msg.bot {
          align-self: flex-start;
          background: ${isWin98 ? '#f0f0f0' : bg};
          border: 1px solid ${isWin98 ? '#808080' : '#e2e8f0'};
          color: #0f172a;
        }
        .sm-msg.user {
          align-self: flex-end;
          background: ${isWin98 ? '#000080' : color};
          color: #ffffff;
        }
        .sm-sources {
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px solid ${isWin98 ? '#c0c0c0' : '#f1f5f9'};
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .sm-badge {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: ${isWin98 ? '0' : '6px'};
          background: ${isWin98 ? '#dfdfdf' : '#f0f9ff'};
          border: 1px solid ${isWin98 ? '#808080' : '#bae6fd'};
          color: ${isWin98 ? '#000080' : '#0369a1'};
          text-decoration: none;
        }
        .sm-meta {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10px;
          color: #64748b;
          margin-top: 4px;
        }
        .sm-form {
          display: flex;
          gap: 6px;
          padding: ${isWin98 ? '6px 2px 4px' : '10px 12px'};
          background: ${isWin98 ? '#c0c0c0' : bg};
          border-top: ${isWin98 ? 'none' : '1px solid #e2e8f0'};
        }
        .sm-input {
          flex: 1;
          border: ${isWin98 ? '2px solid' : '1px solid #cbd5e1'};
          ${isWin98 ? 'border-color: #808080 #ffffff #ffffff #808080; box-shadow: inset 1px 1px 0 #000000; border-radius: 0; font-size: 12px;' : 'border-radius: 10px; font-size: 13px;'}
          padding: 7px 10px;
          outline: none;
          color: #0f172a;
          background: #ffffff;
        }
        ${isWin98 ? '' : `.sm-input:focus { border-color: ${color}; }`}
        .sm-send {
          ${isWin98 ? `
          border: 2px solid;
          border-color: #ffffff #000000 #000000 #ffffff;
          box-shadow: inset 1px 1px 0 #dfdfdf, inset -1px -1px 0 #808080;
          border-radius: 0;
          background: #c0c0c0;
          color: #000000;
          padding: 0 12px;
          font-size: 12px;
          ` : `
          border: none;
          border-radius: 10px;
          background: ${color};
          color: #ffffff;
          padding: 0 14px;
          font-size: 13px;
          `}
          font-weight: 700;
          cursor: pointer;
        }
        .sm-send:disabled { opacity: 0.6; cursor: not-allowed; }
      </style>
      <div class="sm-wrap">
        <div class="sm-panel" id="smPanel" role="dialog" aria-label="AI Consultant">
          <div class="sm-head">
            <div class="sm-title-wrap">
              <div class="sm-avatar">${renderAvatarHtml(isWin98 ? 18 : 32)}</div>
              <div>
                <div class="sm-title">${escapeHtml(cfg.widget_title)}</div>
                <div class="sm-sub"><span class="sm-dot"></span>${subtitleText}</div>
              </div>
            </div>
            <button class="sm-close" id="smClose" aria-label="${closeLabel}">${isWin98 ? '<svg width="8" height="7" viewBox="0 0 8 7" shape-rendering="crispEdges"><path fill="#000" d="M0 0h2v1h1v1h2V1h1V0h2v1H7v1H6v1H5v1h1v1h1v1h1v1H6V6H5V5H3v1H2v1H0V6h1V5h1V4h1V3H2V2H1V1H0V0z"/></svg>' : '×'}</button>
          </div>
          <div class="sm-msgs" id="smMsgs">
            <div class="sm-msg bot">${formatRichText(cfg.widget_welcome)}</div>
          </div>
          <form class="sm-form" id="smForm">
            <input class="sm-input" id="smInput" type="text" placeholder="${placeholderText}" autocomplete="off" />
            <button class="sm-send" id="smSend" type="submit">${isWin98 ? 'Send' : '→'}</button>
          </form>
        </div>
        <button class="sm-btn" id="smToggle" aria-label="${toggleLabel}">
          ${isWin98 ? `<span style="width:8px;height:8px;background:#10b981;display:inline-block;border:1px solid #000;"></span><span>${escapeHtml(cfg.widget_title)} (Online)</span>` : renderAvatarHtml(34)}
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
          appendMessage('bot', data.error || (isEn ? 'Service error' : 'Ошибка сервиса'));
        } else {
          if (data.dialog_id) {
            dialogId = data.dialog_id;
            localStorage.setItem(dialogKey, dialogId);
          }
          appendMessage('bot', data.answer, data);
        }
      } catch (_err) {
        appendMessage('bot', isEn ? 'Unable to reach the AI Concierge server.' : 'Не удалось связаться с сервером консультанта.');
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
