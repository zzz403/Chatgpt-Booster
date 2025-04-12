console.log("=== ChatGPT Booster content script loaded ===");

const DEFAULT_MAX_MSGS = 10;
const RESTORE_COUNT = 3;
let restoredCount = 0;

// 样式
const style = document.createElement("style");
style.textContent = `
  .booster-hidden {
    display: none !important;
  }
  .booster-collapsed .flex.flex-col {
    display: none !important;
  }
  .booster-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .booster-toggle {
    cursor: pointer;
    font-size: 12px;
    color: #999;
    margin-left: auto;
  }
  .booster-summary {
    display: none;
    font-size: 12px;
    color: #999;
    padding: 2px 6px;
    background: rgba(255,255,255,0.05);
    border-radius: 4px;
    line-height: 1.4;
    word-break: break-word;
    text-align: left;
    max-width: 100%;
  }
`;
document.head.appendChild(style);

function generateSummary(text, maxLen = 50) {
  if (!text) return '';
  return text.length <= maxLen ? text : text.slice(0, maxLen) + '...';
}

function addToggleToUserMessages() {
  const userMessages = [...document.querySelectorAll('article[data-testid^="conversation-turn-"]')].filter(msg =>
    msg.querySelector('[data-message-author-role="user"]')
  );

  userMessages.forEach(msg => {
    if (msg.querySelector('.booster-toggle')) return;

    const toggleBtn = document.createElement('span');
    toggleBtn.textContent = '[折叠回复]';
    toggleBtn.className = 'booster-toggle';

    const next = msg.nextElementSibling;
    let assistantSummary = '';

    if (next && next.matches('article[data-testid^="conversation-turn-"]') && next.querySelector('[data-message-author-role="assistant"]')) {
      const gptText = next.innerText.trim().replace(/\n/g, ' ');
      assistantSummary = generateSummary(gptText, 50);
    }

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'booster-summary';
    summaryDiv.textContent = `GPT: ${assistantSummary}`;

    const headerWrapper = document.createElement('div');
    headerWrapper.className = 'booster-header';
    headerWrapper.appendChild(summaryDiv);
    headerWrapper.appendChild(toggleBtn);

    toggleBtn.addEventListener('click', () => {
      if (next) {
        const collapsed = next.classList.toggle('booster-collapsed');
        summaryDiv.style.display = collapsed ? 'block' : 'none';
        toggleBtn.textContent = collapsed ? '[展开回复]' : '[折叠回复]';
      }
    });

    const contentArea = msg.querySelector('[data-message-author-role="user"]') || msg.querySelector('.text-message') || msg;
    contentArea.appendChild(headerWrapper);
  });
}

const activateButton = document.createElement("button");
activateButton.textContent = "激活自动隐藏";
activateButton.style.position = "fixed";
activateButton.style.top = "50px";
activateButton.style.right = "10px";
activateButton.style.zIndex = "9999";
document.body.appendChild(activateButton);

activateButton.addEventListener("click", () => {
  chrome.storage.sync.get(["maxMsgs"], (result) => {
    const maxMsgs = result.maxMsgs || DEFAULT_MAX_MSGS;
    console.log("激活自动隐藏, maxMsgs =", maxMsgs);

    const mainContainer = document.querySelector('main#main') || document.querySelector('main') || document.body;
    const scrollContainer = mainContainer.querySelector('[class*="overflow-y-auto"]') || mainContainer;

    const hideOldMessages = () => {
      const messages = document.querySelectorAll("article[data-testid^='conversation-turn-']");
      const realMaxMsgs = maxMsgs + restoredCount;
      if (messages.length > realMaxMsgs) {
        const visibleMsgs = [...messages].filter(m => !m.classList.contains('booster-hidden'));
        for (let i = 0; i < visibleMsgs.length - realMaxMsgs; i++) {
          if (!visibleMsgs[i].classList.contains('booster-auto-hidden')) {
            visibleMsgs[i].classList.add('booster-auto-hidden');
          }
          visibleMsgs[i].classList.add('booster-hidden');
        }
      }
    };

    hideOldMessages();

    const observer = new MutationObserver(() => {
      hideOldMessages();
      addToggleToUserMessages();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    scrollContainer.addEventListener('scroll', () => {
      if (scrollContainer.scrollTop <= 100) {
        const hiddenMessages = document.querySelectorAll('.booster-hidden');
        if (!hiddenMessages.length) return;

        const total = hiddenMessages.length;
        const restoreNum = Math.min(RESTORE_COUNT, total);

        const visibleMsgs = [...document.querySelectorAll("article[data-testid^='conversation-turn-']")]
          .filter(m => !m.classList.contains('booster-hidden'));
        const anchor = visibleMsgs[0];

        for (let i = total - 1; i >= total - restoreNum; i--) {
          hiddenMessages[i].classList.remove('booster-hidden');
          hiddenMessages[i].classList.remove('booster-auto-hidden');
        }

        restoredCount += restoreNum;

        setTimeout(() => {
          if (anchor) anchor.scrollIntoView({ block: 'start', behavior: 'auto' });
        }, 0);
      }
    });

    addToggleToUserMessages();
  });
});
