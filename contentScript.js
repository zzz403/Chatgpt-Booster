console.log("=== ChatGPT Booster content script loaded ===");

const DEFAULT_MAX_MSGS = 10;
const RESTORE_COUNT = 3;
let restoredCount = 0;

const i18n = chrome.i18n.getMessage;

// ===== 样式 =====
const style = document.createElement("style");
style.textContent = `
  .booster-hidden { display: none !important; }
  .booster-collapsed .flex.flex-col { display: none !important; }
  .booster-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
  .booster-toggle { cursor: pointer; font-size: 12px; color: #999; margin-left: auto; }
  .booster-summary { display: none; font-size: 12px; color: #999; padding: 2px 6px; background: rgba(255,255,255,0.05); border-radius: 4px; line-height: 1.4; word-break: break-word; text-align: left; max-width: 100%; }
  .booster-copy-btn { position: absolute; top: -18px; right: 0; background: #444; color: #fff; font-size: 10px; border: none; padding: 2px 4px; cursor: pointer; border-radius: 4px; z-index: 9999; }
  .katex:hover { background-color: rgba(200,200,200,0.1); border-radius: 4px; cursor: pointer; }
  `;
document.head.appendChild(style);

// ===== Toast 样式 =====
const toastStyle = document.createElement('style');
toastStyle.textContent = `
  .booster-toast {
    position: fixed;
    bottom: 50px;
    right: 20px;
    background: rgba(0,0,0,0.8);
    color: white;
    font-size: 14px;
    padding: 6px 12px;
    border-radius: 6px;
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.3s, transform 0.3s;
    transform: translateY(20px);
    pointer-events: none;
  }
  .booster-toast.show {
    opacity: 1;
    transform: translateY(0);
  }
`;
document.head.appendChild(toastStyle);

// ===== Toast 逻辑 =====
function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'booster-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  // 延迟触发动画
  setTimeout(() => toast.classList.add('show'), 10);

  // 自动消失
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// 监听点击三点按钮
const observer = new MutationObserver(() => {
  const menu = document.querySelector('div[role="menu"]');
  if (!menu || menu.querySelector('.booster-auto-hide-btn')) return;

  const isChatOptionMenu = menu.querySelector('[data-testid="delete-chat-menu-item"]');
  if (!isChatOptionMenu) return;  // 不是聊天的 menu，继续观察别人

  const template = menu.querySelector('div[role="menuitem"]');
  const dividerOrigin = menu.querySelector('div[class*="border"]');
  if (!template || !dividerOrigin) return;

  const divider = dividerOrigin.cloneNode(true);
  const newItem = template.cloneNode(true);
  newItem.textContent = i18n('auto_hide_btn_text');
  newItem.classList.add('booster-auto-hide-btn');

  newItem.addEventListener('click', (e) => {
    e.stopPropagation();
    setupAutoHide();
    showToast('自动隐藏已激活！');
  });

  menu.appendChild(divider);
  menu.appendChild(newItem);

  console.log('[Booster] 成功注入按钮，断开observer监听！');

  // 注入后永久断开，不再监听
  observer.disconnect();
});

observer.observe(document.body, { childList: true, subtree: true });



// ===== Latex hover复制功能 =====
document.body.addEventListener('mouseover', (e) => {
  const wrapper = e.target.closest('.katex-display, .katex');
  if (!wrapper) return;

  wrapper.style.cursor = 'pointer';
  wrapper.style.backgroundColor = 'rgba(200,200,200,0.1)';

  wrapper.addEventListener('mouseleave', () => {
    wrapper.style.backgroundColor = '';
    wrapper.style.cursor = '';
  }, { once: true });
});

document.body.addEventListener('click', (e) => {
  const wrapper = e.target.closest('.katex-display, .katex');
  if (!wrapper) return;

  // 拿到对应的 .katex-mathml 节点
  let mathml = wrapper.querySelector('.katex-mathml');
  if (!mathml) {
    mathml = wrapper.previousElementSibling?.classList.contains('katex-mathml')
      ? wrapper.previousElementSibling
      : wrapper.querySelector('.katex-mathml');
  }
  if (!mathml) {
    console.warn('没找到 .katex-mathml，原html:', wrapper.innerHTML);
    return;
  }

  // 拿到具体 <annotation encoding="application/x-tex"> 节点
  const annotation = mathml.querySelector('annotation[encoding="application/x-tex"]');
  if (!annotation) {
    console.warn('没找到 annotation，原html:', wrapper.innerHTML);
    return;
  }

  // 改成用 textContent（或者 innerHTML）来获取内容
  const latexSource = annotation.textContent.trim();
  if (!latexSource) {
    console.warn('annotation 里没有 textContent:', annotation.innerHTML);
    return;
  }

  // 写入剪贴板，这里以双美元符号包裹，代表 Markdown 里的块级公式
  navigator.clipboard.writeText(`$$ ${latexSource} $$`).then(() => {
    showToast(i18n("latex_copy_success"));
  });
});



// ===== 消息折叠功能 =====
function generateSummary(text, maxLen = 50) {
  if (!text) return '';
  return text.length <= maxLen ? text : text.slice(0, maxLen) + '...';
}

function addToggleToUserMessages() {
  const userMessages = [...document.querySelectorAll('article[data-testid^="conversation-turn-"]')].filter(m =>
    m.querySelector('[data-message-author-role="user"]')
  );

  userMessages.forEach(msg => {
    if (msg.querySelector('.booster-toggle')) return;

    const toggleBtn = document.createElement('span');
    toggleBtn.textContent = i18n('toggle_hide_text');
    toggleBtn.className = 'booster-toggle';

    const next = msg.nextElementSibling;
    let summary = '';

    if (next && next.matches('article[data-testid^="conversation-turn-"]') && next.querySelector('[data-message-author-role="assistant"]')) {
      summary = generateSummary(next.innerText.trim().replace(/\n/g, ' '), 50);
    }

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'booster-summary';
    summaryDiv.textContent = summary;

    const header = document.createElement('div');
    header.className = 'booster-header';
    header.append(summaryDiv, toggleBtn);

    toggleBtn.addEventListener('click', () => {
      if (next) {
        const collapsed = next.classList.toggle('booster-collapsed');
        summaryDiv.style.display = collapsed ? 'block' : 'none';
        toggleBtn.textContent = collapsed ? i18n('toggle_show_text') : i18n('toggle_hide_text');
      }
    });

    (msg.querySelector('[data-message-author-role="user"]') || msg).appendChild(header);
  });
}

// ===== 自动隐藏功能 =====
function setupAutoHide() {
  chrome.storage.sync.get(["maxMsgs"], (res) => {
    const maxMsgs = res.maxMsgs || DEFAULT_MAX_MSGS;
    const mainContainer = document.querySelector('main#main') || document.querySelector('main') || document.body;
    const scrollContainer = mainContainer.querySelector('[class*="overflow-y-auto"]') || mainContainer;

    const hideOldMessages = () => {
      const messages = document.querySelectorAll("article[data-testid^='conversation-turn-']");
      const realMaxMsgs = maxMsgs + restoredCount;
      const visibleMsgs = [...messages].filter(m => !m.classList.contains('booster-hidden'));

      if (messages.length > realMaxMsgs) {
        for (let i = 0; i < visibleMsgs.length - realMaxMsgs; i++) {
          visibleMsgs[i].classList.add('booster-auto-hidden', 'booster-hidden');
        }
      }
    };

    hideOldMessages();

    new MutationObserver(() => {
      hideOldMessages();
      addToggleToUserMessages();
    }).observe(document.body, { childList: true, subtree: true });

    scrollContainer.addEventListener('scroll', () => {
      if (scrollContainer.scrollTop <= 100) {
        const hidden = document.querySelectorAll('.booster-hidden');
        const restoreNum = Math.min(RESTORE_COUNT, hidden.length);
        const anchor = [...document.querySelectorAll("article[data-testid^='conversation-turn-']")].find(m => !m.classList.contains('booster-hidden'));

        for (let i = hidden.length - 1; i >= hidden.length - restoreNum; i--) {
          hidden[i].classList.remove('booster-hidden', 'booster-auto-hidden');
        }
        restoredCount += restoreNum;
        setTimeout(() => anchor?.scrollIntoView({ block: 'start', behavior: 'auto' }), 0);
      }
    });
  });
}