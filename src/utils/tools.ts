export const sendMessageToActiveTab = (message: any) => new Promise<any>((resolve, reject) => {
  chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (!tabId) {
      reject(new Error('active_tab_not_found'));
      return;
    }

    chrome.tabs.sendMessage(tabId, message, (response) => {
      console.log('response', response);
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(response);
    });
  });
});
