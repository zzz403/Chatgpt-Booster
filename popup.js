// popup.js 负责与 chrome.storage 通信，把用户输入的最大消息数存储起来
document.addEventListener("DOMContentLoaded", () => {
    const maxMsgsInput = document.getElementById("maxMsgsInput");
    const saveBtn = document.getElementById("saveBtn");
  
    // 在 popup 打开时，从 storage 中读取现有的设置
    chrome.storage.sync.get(["maxMsgs"], (result) => {
      if (result.maxMsgs) {
        maxMsgsInput.value = result.maxMsgs;
      }
    });
  
    // 用户点击“保存”按钮时，把最新的值写入 storage
    saveBtn.addEventListener("click", () => {
      const maxMsgs = parseInt(maxMsgsInput.value, 10) || 10; // 默认为 10
      chrome.storage.sync.set({ maxMsgs }, () => {
        alert("已保存最大消息数：" + maxMsgs);
      });
    });
  });
  