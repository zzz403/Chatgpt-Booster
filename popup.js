function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'booster-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  // 触发动画
  setTimeout(() => toast.classList.add('show'), 10);

  // 2秒后消失
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

document.addEventListener("DOMContentLoaded", () => {
  const maxMsgsInput = document.getElementById("maxMsgsInput");
  const saveBtn = document.getElementById("saveBtn");
  const langSelect = document.getElementById("langSelect");

  // 读取当前设置
  chrome.storage.sync.get(["maxMsgs", "lang"], (res) => {
    if (res.maxMsgs) maxMsgsInput.value = res.maxMsgs;
    if (res.lang) langSelect.value = res.lang;
    applyLang(res.lang || 'en');
  });

  // 保存按钮
  saveBtn.addEventListener("click", () => {
    const maxMsgs = parseInt(maxMsgsInput.value, 10) || 10;
    const lang = langSelect.value;
  
    chrome.storage.sync.set({ maxMsgs, preferredLang: lang }, () => {
      showToast(lang === 'zh' ? '保存成功！' : 'Saved successfully!');
    });
  });  

  // 语言切换
  langSelect.addEventListener("change", () => {
    const lang = langSelect.value;
    chrome.storage.sync.set({ lang }, () => {
      applyLang(lang);
    });
  });
});

function applyLang(lang) {
  document.getElementById('title').textContent
    = lang === 'zh' ? 'ChatGPT Booster 设置' : 'ChatGPT Booster Settings';
  document.getElementById('label-max-msgs').textContent
    = lang === 'zh' ? '最大保留消息数：' : 'Max visible messages:';
  document.getElementById('label-language').textContent
    = lang === 'zh' ? '语言：' : 'Language:';
  document.getElementById('saveBtn').textContent
    = lang === 'zh' ? '保存' : 'Save';
}