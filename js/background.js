/*
 * background.js - Mainly for setup of event listeners
 * ===================================================
 *
 * By Sebastian Weitzel, sebastian.weitzel@gmail.com
 *   Code partially based on Spaces from Dean Oemcke (https://github.com/deanoemcke/spaces)
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

var papaTabs = (function () {
  'use strict';
  let debug = true;

  // LISTENERS
  //browser.tabs.onCreated.addListener()

  //add listeners for session monitoring
  chrome.tabs.onCreated.addListener(function (tab) {
    if (debug) {
      console.log('tab.onCreated listener fired: %O', tab);
    }
    // send event to inform all instances about the created Tab and update their sidebar / main view if needed
    chrome.runtime.sendMessage({
      action: 'TabCreated',
      detail: {tab: tab}
    });
  });

  chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
    if (debug) {
      console.log(`tab(${tabId}).onRemoved listener fired:` + JSON.stringify(removeInfo));
    }
    // window closing, no need to update anybody (todo check if this is true)
    if (removeInfo.isWindowClosing === false) {
      // send event to inform all instances about the removed Tab and update their sidebar / main view if needed
      chrome.runtime.sendMessage({
        action: 'TabRemoved',
        detail: {tabId: tabId, removeInfo: removeInfo}
      });
    }
  });

  chrome.tabs.onMoved.addListener(function (tabId, moveInfo) {
    if (debug) {
      console.log(`tab(${tabId}).onMoved listener fired:` + JSON.stringify(moveInfo));
    }
    // send event to inform all instances about the moved Tab and update their main view if needed
    chrome.runtime.sendMessage({
      action: 'TabMoved',
      detail: {tabId: tabId, moveInfo: moveInfo}
    });
  });

  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (debug) {
      console.log(`tab(${tabId}).onUpdated listener fired:` + JSON.stringify(changeInfo));
    }
    // URL changed?
    // send event to inform all instances about the updated Tab and update their sidebar / main view if needed
    chrome.runtime.sendMessage({
      action: 'TabUpdated',
      detail: {tabId: tabId, changeInfo: changeInfo, tab: tab}
    });
  });

  chrome.windows.onRemoved.addListener(function (windowId) {
    if (debug) {
      console.log(`window(${windowId}).onRemoved listener fired.`);
    }
    // send event to inform all instances about the removed Window and update their sidebar
    chrome.runtime.sendMessage({
      action: 'WindowRemoved',
      detail: {windowId: windowId}
    });
  });

  chrome.windows.onCreated.addListener(function (window) {
    if (debug) {
      console.log(`window.onCreated listener fired:` + JSON.stringify(window));
    }
    // send event to inform all instances about the new Window and update their sidebar
    chrome.runtime.sendMessage({
      action: 'WindowCreated',
      detail: {window: window}
    });
  });

  //add listeners for tab and window focus changes
  //when a tab or window is changed, close the move tab popup if it is open
  chrome.windows.onFocusChanged.addListener(function (windowId) {
    if (debug) {
      console.log(`window(${windowId}).onFocusChanged listener fired`);
    }
    // Prevent a click in the popup on Ubuntu or ChromeOS from closing the
    // popup prematurely.
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      return;
    }
  });

  //add listeners for message requests from other extension pages (popup.html)
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (debug) {
      console.log('onMessage listener fired: request=%O, sender=%O, sendResponse=%O', request, sender, sendResponse);
    }
    let topicId, windowId, tabId;

    // endpoints called by popup.js
    switch (request.action) {
      case 'loadSession':
        topicId = request.topicId;
        if (topicId) {
          handleLoadTopic(topicId);
          sendResponse(true);
        }
        return true;
        break;
      case 'loadWindow':
        windowId = request.windowId;
        if (windowId) {
          handleLoadWindow(windowId);
          sendResponse(true);
        }
        return true;
        break;
      case 'loadTabInSession':
        topicId = request.topicId;
        if (topicId && request.tabUrl) {
          handleLoadTopic(topicId, request.tabUrl);
          sendResponse(true);
        }
        return true;
        break;
      case 'loadTabInWindow':
        console.log("loadTabInWindow() request=%O", request);
        windowId = request.windowId;
        if (windowId && request.tabUrl) {
          handleLoadWindow(windowId, request.tabUrl);
          sendResponse(true);
        }
        return true;
        break;
      case 'CreateWindow':
        // CreateWindow - handle in background.js
        console.log("CreateWindow() request=%O", request);
        handleCreateWindow()
          .then(newWindowId => sendResponse(newWindowId))
          .catch(err => console.error("handleCreateWindow() error: %s", err));
        return true;
        break;
      default:
        return false;
    }
  });

  //runtime extension install listener
  chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason === "install") {
      console.log("This is a first install!");
      if (debug) {
        console.log('Extension fresh installed!');
        debugger;
      }
    } else if (details.reason === "update") {
      let thisVersion = chrome.runtime.getManifest().version;
      if (details.previousVersion !== thisVersion) {
        console.log(`Updated from ${details.previousVersion} to ${thisVersion}!`);
      }
    }
  });

  //region handlers

  async function handleCreateWindow() {
    let newWindow = await browser.windows.create({
      url: browser.extension.getURL('popup.html'),
    });
    if (newWindow) {
      await openPapaTab({windowId: newWindow.id});
    }
    return newWindow.id;
  }

  //endregion

}()); // end papaTabs

async function openPapaTab(param) {
  // query tab for specified or current window with extension URL
  let tabs = await browser.tabs.query({
    windowId: (param && 'windowId' in param) ? param.windowId : chrome.windows.WINDOW_ID_CURRENT,
    url: chrome.extension.getURL('popup.html')
  });
  for (let i = 0; i < tabs.length; i++) {
    if (i > 0) {
      await browser.tabs.remove(tabs[i].id);
      console.debug("Closed additional PapaTab instance");
      continue;
    }
    // if open, ensure it is pinned (user might have accidentally un-pinned it)
    browser.tabs.update(tabs[i].id, {pinned: true, highlighted: true, active: true});
  }
  if (tabs.length === 0) {
    await browser.tabs.create({
      url: chrome.extension.getURL('popup.html'),
      windowId: (param && 'windowId' in param) ? param.windowId : chrome.windows.WINDOW_ID_CURRENT,
      pinned: true
    });
  }
}

/*
 * Activate or Open Papatab when extension action is clicked
 *   this calls the openPapaTab with tabs.tab as parameter
 */
chrome.browserAction.onClicked.addListener(openPapaTab);
