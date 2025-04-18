console.log("=== ChatGPT Booster content script loaded ===");

const DEFAULT_MAX_MSGS = 10;
const RESTORE_COUNT = 3;
let restoredCount = 0;

const i18n = chrome.i18n.getMessage.bind(chrome.i18n);

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
  if (!menu) return;

  // 已经加过就不加了
  if (menu.querySelector('.booster-auto-hide-btn')){
    console.log('已经插入过按钮，退出');
    return;
  };

  // 只处理聊天三点menu（通过data-testid）
  const isChatOptionMenu = menu.querySelector('[data-testid="delete-chat-menu-item"]');
  if (!isChatOptionMenu) return;

  const template = menu.querySelector('div[role="menuitem"]');
  const dividerOrigin = menu.querySelector('div[class*="border"]');
  if (!template) return;
  
  const booster_start_btn = template.cloneNode(true);

  booster_start_btn.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <img src="${chrome.runtime.getURL('icons/bolt.svg')}" 
          style="width: 18px; height: 18px;">
      ${i18n('auto_hide_btn_text')}
    </div>
  `;

  booster_start_btn.classList.add('booster-auto-hide-btn');

  booster_start_btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setupAutoHide();
    showToast('自动隐藏已激活！');
  });

  save_to_pdf_btn = template.cloneNode(true);

  save_to_pdf_btn.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <img src="${chrome.runtime.getURL('icons/pdf.svg')}" 
          style="width: 18px; height: 18px;">
      ${i18n('save_to_pdf_btn_text')}
    </div>
  `;

  save_to_pdf_btn.classList.add('booster-save-to-pdf-btn');

  save_to_pdf_btn.addEventListener('click', (e) => {
    loadHtml2Pdf()
    .then(() => {
      exportAllGPTChatsAsPDF();
      showToast('PDF 导出中...');
    })
    .catch(err => {
      console.error(err);
      alert('PDF 导出失败！');
    });

  });

  if (dividerOrigin){
    const divider = dividerOrigin.cloneNode(true);
    menu.appendChild(divider);
  }
  
  menu.appendChild(booster_start_btn);
  menu.appendChild(save_to_pdf_btn);

  // console.log('[Booster] Auto Hide 按钮插入成功！');
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
  navigator.clipboard.writeText(`${latexSource}`).then(() => {
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
      // 当滚动到距离顶部较近时触发
      if (scrollContainer.scrollTop <= 100) {
        // 先检查是否还有隐藏内容
        const hidden = document.querySelectorAll('.booster-hidden');
        if (hidden.length === 0) return; // 如果没有隐藏的消息，则直接退出

        // 从隐藏的消息中取出可恢复数量（这里 RESTORE_COUNT 定义每次加载的数量）
        const restoreNum = Math.min(RESTORE_COUNT, hidden.length);
        if (restoreNum <= 0) return; // 如果没有需要恢复的，也退出

        // 此处选择“锚点”为第一个仍然可见的消息（也可以根据实际需要选择其他锚点）
        const anchor = [...document.querySelectorAll("article[data-testid^='conversation-turn-']")]
                         .find(m => !m.classList.contains('booster-hidden'));

        // 这里从数组的末尾（即离当前视区最近的隐藏消息）恢复 restoreNum 条
        for (let i = hidden.length - 1; i >= hidden.length - restoreNum; i--) {
          hidden[i].classList.remove('booster-hidden', 'booster-auto-hidden');
        }
        restoredCount += restoreNum;

        // 如果有锚点，再滚动到该锚点位置，平滑调整界面，防止画面抖动
        if (anchor) {
          setTimeout(() => {
            anchor.scrollIntoView({ block: 'start', behavior: 'auto' });
          }, 0);
        }
      }
    });
  });
}

// ===== prompt区替换功能 =====
function waitForPromptArea(callback) {
  const promptArea = document.getElementById("prompt-textarea");
  if (promptArea) {
    callback(promptArea);
    return;
  }
  
  const observer = new MutationObserver((mutations, obs) => {
    const promptArea = document.getElementById("prompt-textarea");
    if (promptArea) {
      obs.disconnect();
      callback(promptArea);
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

waitForPromptArea((promptArea) => {
  console.log("=== Prompt area found ===");

  // 解析json
  let triggersMap = {};

  fetch(chrome.runtime.getURL('storage/prompt.json'))
    .then(response => response.json())
    .then(data => {
      triggersMap = data; // 这里就是 JSON 文件内容解析后的对象
      console.log('成功解析 triggersMap:', triggersMap);
      // 接下来就可以使用 triggersMap 了
    })
    .catch(error => {
      console.error('解析 triggers.json 失败:', error);
    });  

  // ===================== 辅助函数 =====================
  // 用于将光标移至 contentEditable 的末尾
  function placeCaretAtEnd(el) {
    el.focus();
    if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // 显示提示框
  function showSuggestionBox(message) {
    let suggestionBox = document.getElementById('trigger-suggestion-box');
    if (!suggestionBox) {
      suggestionBox = document.createElement('div');
      suggestionBox.id = 'trigger-suggestion-box';
      suggestionBox.className = 'trigger-suggestion-box';
      // 样式
      suggestionBox.style.position = 'absolute';
      suggestionBox.style.background = 'rgba(255, 255, 255, 0.95)';
      suggestionBox.style.padding = '6px 10px';
      suggestionBox.style.borderRadius = '6px';
      suggestionBox.style.fontSize = '13px';
      suggestionBox.style.color = '#444';
      suggestionBox.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
      suggestionBox.style.zIndex = '1000';
      // 初始透明度和位移，用于淡入动画
      suggestionBox.style.opacity = '0';
      suggestionBox.style.transform = 'translateY(5px)';
      suggestionBox.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      document.body.appendChild(suggestionBox);
    }
    suggestionBox.innerText = message;

    // 定位在 promptArea 的下方
    const rect = promptArea.getBoundingClientRect();
    suggestionBox.style.top = (rect.bottom + window.scrollY + 5) + 'px';
    suggestionBox.style.left = (rect.left + window.scrollX) + 'px';
    suggestionBox.style.display = 'block';

    // 触发淡入动画
    requestAnimationFrame(() => {
      suggestionBox.style.opacity = '1';
      suggestionBox.style.transform = 'translateY(0)';
    });
  }

  // 隐藏提示框
  function hideSuggestionBox() {
    const suggestionBox = document.getElementById('trigger-suggestion-box');
    if (suggestionBox) {
      suggestionBox.style.display = 'none';
    }
  }

  // 判断文本末尾是否匹配到（多）触发词中的任意一个
  // 匹配到了就返回对应的触发词，否则返回 null
  function findTriggerAtEnd(text) {
    const trimmed = text.trim();
    for (const triggerKey in triggersMap) {
      if (trimmed.endsWith(triggerKey)) {
        return triggerKey;
      }
    }
    return null;
  }

  // ===================== 事件监听 =====================
  let currentMatchedTrigger = null; // 记录当前匹配到的触发词

  // 监听输入，每次都检查输入末尾是否出现任意触发词
  promptArea.addEventListener("input", () => {
    const currentText = promptArea.innerText;
    currentMatchedTrigger = findTriggerAtEnd(currentText);

    if (currentMatchedTrigger) {
      // 如果匹配到触发词，则显示提示框
      showSuggestionBox(i18n("trigger_hint_replace_by_space"));
    } else {
      // 否则隐藏提示框
      hideSuggestionBox();
    }
  });

  // 监听键盘事件——如果提示框出现并按下空格，则执行替换
  promptArea.addEventListener("keydown", (event) => {
    const suggestionBox = document.getElementById('trigger-suggestion-box');
    if (suggestionBox && suggestionBox.style.display === 'block') {
      if (event.key === " ") {
        // 用户按下空格，确认替换
        event.preventDefault(); // 阻止默认空格
        if (currentMatchedTrigger) {
          const fullText = promptArea.innerText;
          // 找到末尾触发词的起始位置
          const idx = fullText.lastIndexOf(currentMatchedTrigger);
          if (idx !== -1) {
            // 用预设文本替换触发词
            const before = fullText.substring(0, idx);
            // 取出 triggersMap 中的预设文本进行替换
            promptArea.innerText = before + triggersMap[currentMatchedTrigger];
            hideSuggestionBox();
            placeCaretAtEnd(promptArea);
          }
        }
      } else {
        // 如果按下的不是空格，则取消提示框（不做替换）
        hideSuggestionBox();
      }
    }
  });
});

// ===== Load from libs =====

function loadHtml2Pdf() {
  return new Promise((resolve, reject) => {
    if (window.html2pdf) {
      resolve(window.html2pdf);
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('libs/html2pdf.bundle.min.js');

    script.onload = () => {
      if (window.html2pdf) {
        console.log('html2pdf loaded');
        resolve(window.html2pdf);
      } else if (typeof html2pdf !== 'undefined') {
        // 兜底：有些版本只挂到 local scope
        window.html2pdf = html2pdf;
        resolve(window.html2pdf);
      } else {
        reject('html2pdf 加载失败或未暴露全局变量');
      }
    };

    script.onerror = () => reject('html2pdf 加载失败');

    document.head.appendChild(script);
  });
}

function loadHtml2Canvas() {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) {
      resolve(window.html2canvas);
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('libs/html2canvas.min.js');

    script.onload = () => {
      if (window.html2canvas) {
        console.log('html2canvas loaded');
        resolve(window.html2canvas);
      } else {
        reject('html2canvas 加载失败或未暴露全局变量');
      }
    };

    script.onerror = () => reject('html2canvas 加载失败');

    document.head.appendChild(script);
  }
  );
}

function loadOklch2RgbLib() {
  return new Promise((resolve, reject) => {
    if (window.oklch2rgbClamped) return resolve(); // 已加载

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('libs/oklch2rgb.min.js');
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}



// contentScript.js 里加入
async function exportAllGPTChatsAsPDF() {
  const turns = document.querySelectorAll('article[data-testid^="conversation-turn-"]');
  if (turns.length === 0) {
    alert(i18n('no_conversation_found'));
    return;
  }

  const container = document.createElement('div');

  // 标题
  const title = document.createElement('h1');
  title.innerText = document.title || i18n('export_title');
  title.style = 'text-align: center; margin-bottom: 20px;';
  container.appendChild(title);

  // 时间
  const time = document.createElement('div');
  time.innerText = `${i18n('export_time')}: ${new Date().toLocaleString()}`;
  time.style = 'text-align: center; margin-bottom: 40px; color: #888;';
  container.appendChild(time);

  turns.forEach(turn => {
    const userMsg = turn.querySelector('[data-message-author-role="user"]');
    const assistantMsg = turn.querySelector('[data-message-author-role="assistant"]');

    if (userMsg) {
      const userDiv = document.createElement('div');
      userDiv.innerHTML = `<strong>${i18n('user_name')}：</strong><br>${userMsg.innerHTML}`;
      userDiv.className = 'user-msg';
      container.appendChild(userDiv);
    }

    if (assistantMsg) {
      const gptDiv = document.createElement('div');
      gptDiv.innerHTML = `<strong>ChatGPT：</strong><br>${assistantMsg.innerHTML}`;
      gptDiv.className = 'gpt-msg';
      container.appendChild(gptDiv);
    }
  });

  // 页脚
  const footer = document.createElement('div');
  footer.innerText = 'Powered by ChatGPT Booster';
  footer.style = 'text-align: center; margin-top: 40px; color: #aaa;';
  container.appendChild(footer);

  await replaceImgWithBase64(container);

  // clear styles
  container.querySelectorAll('.horzScrollShadows, .tableContainer').forEach(el => {
    el.style.boxShadow = 'none';
    el.style.background = 'transparent';
  });

  applyPDFStyles(container);

  // 添加到页面中（隐藏，不影响布局）
  const new_container = container.cloneNode(true);

  new_container.style.position = 'fixed';
  new_container.style.top = '-9999px';
  new_container.style.opacity = '0';
  document.body.appendChild(new_container);

  // 等待渲染帧，确保内容撑开
  await new Promise(requestAnimationFrame);

  // 现在再测量就有了
  const height = new_container.scrollHeight;
  console.log("实际渲染高度:", height);

  if (height > 40000) {
    alert(i18n('export_too_long'));
    document.body.removeChild(new_container);
    return;
  }

  html2pdf().from(container).set({
    margin: 10,
    filename: 'chatgpt-conversation.pdf',
    html2canvas: {
      scale: 2,
      useCORS: true,
      scrollY: 0
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] }
  }).save();  
}

function applyPDFStyles(container) {
  container.style.cssText = `
    font-family: Inter, Helvetica, Arial, sans-serif;
    font-size: 14px;
    color: #2e2e2e;
    line-height: 1.8;
    max-width: 750px;
    margin: 0 auto;
    padding: 30px;
  `;

  container.querySelectorAll('.user-msg').forEach(el => {
    el.style.cssText = `
      margin: 16px 0;
      padding: 16px;
      background:rgb(250, 253, 255);
      border-left: 4px solid #4285f4;
      border-radius: 6px;
    `;
  });

  container.querySelectorAll('.gpt-msg').forEach(el => {
    el.style.cssText = `
      margin: 16px 0;
      padding: 16px;
      background:rgb(252, 252, 252);
      border-left: 4px solid #34a853;
      border-radius: 6px;
    `;
  });

  container.querySelectorAll('pre, code').forEach(el => {
    el.style.cssText = `
      background: #f6f8fa;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      padding: 12px;
      border-radius: 4px;
      display: block;
      white-space: pre-wrap;
      overflow-x: auto;
      margin-top: 8px;
    `;
  });
}

async function replaceImgWithBase64(container) {
  const imgElements = container.querySelectorAll('img');

  for (const img of imgElements) {
    const src = img.src;

    try {
      const res = await fetch(src);
      const blob = await res.blob();

      const reader = new FileReader();
      reader.readAsDataURL(blob);

      await new Promise(resolve => {
        reader.onloadend = () => {
          img.src = reader.result;
          resolve();
        };
      });
    } catch (e) {
      console.warn('图片转换失败:', src);
    }
  }
}

function setupImageCopyButton() {
  const answerSelector = ".flex.justify-start > div[class*='items-center']";

  let globalPopup;
  function createGlobalPopupIfNeeded() {
    if (globalPopup) return;
  
    globalPopup = document.createElement('div');
    Object.assign(globalPopup.style, {
      position: 'absolute',
      display: 'none',
      background: '#000',
      color: '#fff',
      padding: '6px 12px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: '600',
      zIndex: 9999,
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      transition: 'opacity 0.2s ease',
      lineHeight: '1.8',
    });
  
    // 文字部分
    const popupText = document.createElement('div');
    popupText.innerText = i18n('image_copy_hint');
    globalPopup.appendChild(popupText);
  
    // 小箭头直接挂在 globalPopup 上（不是 popupText）
    const arrow = document.createElement('div');
    Object.assign(arrow.style, {
      position: 'absolute',
      top: '-7px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 0,
      height: 0,
      borderLeft: '7px solid transparent',
      borderRight: '7px solid transparent',
      borderBottom: '8px solid #000',
    });
    globalPopup.appendChild(arrow);
  
    // 添加到页面中
    document.body.appendChild(globalPopup);
  
    // 提供方法供动态修改内容
    globalPopup.setText = (text) => {
      popupText.innerText = text;
    };
  }
  
  

  function injectImageButton(container, attempt = 0) {
    const MAX_ATTEMPTS = 10;
    const RETRY_DELAY = 1000;

    const article = container.closest("article");
  
    const modelBtnSpan = article?.querySelector('span[data-state="closed"] button[aria-haspopup="menu"]')
    ?.closest('span[data-state="closed"]');
  
    const check = container.closest("article")?.querySelector("div.flex.absolute.start-0.end-0.flex.justify-start");
    if (!modelBtnSpan || !check) {
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(() => injectImageButton(container, attempt + 1), RETRY_DELAY);
      }
      return;
    }
  
    if (modelBtnSpan.previousSibling?.querySelector?.('[data-testid="turn-to-image-button"]')) {
      return;
    }
  
    // --- 创建 wrapper + 按钮 ---
    const spanWrapper = document.createElement('span');
    spanWrapper.setAttribute('data-state', 'closed');
    spanWrapper.style.position = 'relative';
    spanWrapper.style.display = 'inline-block';
  
    const btn = document.createElement('button');
    btn.className = 'text-token-text-secondary hover:bg-token-main-surface-secondary rounded-lg';
    btn.setAttribute('aria-label', '转录为图片');
    btn.setAttribute('data-testid', 'turn-to-image-button');
  
    const icon = document.createElement('span');
    icon.className = 'touch:w-[38px] flex h-[30px] w-[30px] items-center justify-center';
    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('icons/copy-image.svg');
    img.width = 20;
    img.height = 20;
    icon.appendChild(img);
  
    btn.appendChild(icon);
    spanWrapper.appendChild(btn);
  
    // --- 全局浮层绑定 ---
    createGlobalPopupIfNeeded();
  
    btn.addEventListener('mouseenter', () => {
      const rect = btn.getBoundingClientRect();
      globalPopup.style.left = `${rect.left + rect.width / 2}px`;
      globalPopup.style.top = `${rect.bottom + 8 + window.scrollY}px`;
      globalPopup.style.transform = 'translateX(-50%)';
      globalPopup.style.display = 'block';
      globalPopup.style.opacity = '1';
    });
  
    btn.addEventListener('mouseleave', () => {
      globalPopup.style.opacity = '0';
      setTimeout(() => {
        globalPopup.style.display = 'none';
      }, 200);
    });
    

    // --- 点击触发截图逻辑 ---
    btn.addEventListener('click', async () => {
      const html2canvas = await loadHtml2Canvas();
      if (!html2canvas) {
        return;
      }

      const assistantMsg = container.closest('article')?.querySelector('[data-message-author-role="assistant"]');
      if (!assistantMsg) {
        return;
      }

      const clone = assistantMsg.cloneNode(true);
      const wrapper = document.createElement('div');
      wrapper.style.padding = '20px';
      wrapper.style.background = 'white';
      wrapper.style.color = '#333';
      wrapper.style.fontFamily = 'sans-serif';
      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);
      wrapper.style.position = 'fixed';
      wrapper.style.top = '-9999px';

      await replaceOklchColors(wrapper);

      wrapper.querySelectorAll("table").forEach(table => {
        table.style.border = "1px solid #ccc";
        table.style.borderCollapse = "collapse";
        table.style.background = "white";
        table.style.boxShadow = "none";
        table.style.overflow = "visible";
        table.style.color = "#000";
      });

      wrapper.querySelectorAll("th, td").forEach(cell => {
        cell.style.border = "1px solid #ccc";
        cell.style.padding = "6px 8px";
        cell.style.background = "white";
        cell.style.boxShadow = "none";
      });

      if (hasOklchColors(wrapper)) {
        console.warn('❗ 仍然存在 oklch(...) 样式，可能转换失败');
      } else {
        console.log('✅ 所有 oklch(...) 样式已成功替换为 rgb(...)');
      }

      const canvas = await html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        onclone: doc => replaceOklchColors(doc.body),
      });

      document.body.removeChild(wrapper);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          alert(i18n('image_copy_failed'));
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          showToast('✅' + i18n('image_copy_success'));
        } catch (err) {
          console.error(err);
          alert(i18n('image_copy_failed'));
        }
      }, 'image/png');
    });

    if (modelBtnSpan.closest("article") != null) {
      modelBtnSpan.insertAdjacentElement('beforebegin', spanWrapper);
    }

    // console.log('转录按钮插入成功！');
  }

  const observer = new MutationObserver(() => {
    document.querySelectorAll(answerSelector).forEach(c => injectImageButton(c));
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.querySelectorAll(answerSelector).forEach(c => injectImageButton(c));
}

setInterval(() => {
  setupImageCopyButton();
}, 100);


/* ---------- 1. 解析 & 转换 ---------- */
function oklchStringToRgb(str) {
  // okLCH 正则：l  c  h  /a   （l 可以有 %，α 可以选）
  const re = /oklch\s*\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/gi;

  return str.replace(re, (_, l, isPct, c, h, a) => {
    // 1) 归一化 L；C/H 没单位；α 可能是 %
    let lNum = parseFloat(l);
    if (isPct) lNum /= 100;
    const cNum = parseFloat(c);
    const hNum = parseFloat(h);

    // 2) OKLCH → sRGB
    const [r, g, b] = oklch2rgbClamped([lNum, cNum, hNum]).map(v =>
      Math.round(v * 255)
    );

    // 3) 透明度
    if (a !== undefined) {
      let alpha = parseFloat(a);
      if (String(a).endsWith('%')) alpha /= 100;
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return `rgb(${r},${g},${b})`;
  });
}

/* ---------- 2. 全属性扫描 ---------- */
function replaceOklchColors(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  for (let el; (el = walker.nextNode()); ) {
    const style = getComputedStyle(el);
    // 遍历计算样式里所有属性名
    for (const prop of style) {
      const val = style.getPropertyValue(prop);
      if (val.includes('oklch(')) {
        // 把 okLCH 片段逐一替换
        el.style.setProperty(prop, oklchStringToRgb(val), 'important');
      }
    }
  }
}

function hasOklchColors(root) {
  let found = false;

  root.querySelectorAll('*').forEach(el => {
    const style = getComputedStyle(el);

    if (
      (style.color && style.color.includes('oklch')) ||
      (style.backgroundColor && style.backgroundColor.includes('oklch')) ||
      (style.borderColor && style.borderColor.includes('oklch'))
    ) {
      found = true;
    }
  });

  return found;
}
