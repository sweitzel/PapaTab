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

  // hotkeys
  browser.commands.onCommand.addListener((name) => {
    if (debug) {
      console.debug('browser.onCommand listener fired: name=%s', name);
    }
    switch (name) {
      // switch to the next Browser window
      case 'switch-next-window':
        switchToWindow('next')
          .then()
          .catch(err => console.warn('switchToWindow problem: %O', err));
        break;
      // switch to the last Browser window
      case 'switch-last-window':
        switchToWindow('last')
          .then()
          .catch(err => console.warn('switchToWindow problem: %O', err));
        break;
    }
  });

  //add listeners for session monitoring
  browser.tabs.onCreated.addListener(function (tab) {
    if (debug) {
      console.debug('tab.onCreated listener fired: %O', tab);
    }
    // send event to inform all instances about the created Tab and update their sidebar / main view if needed
    sendRuntimeMessage('TabCreated', {tab: tab});
  });

  browser.tabs.onRemoved.addListener(function (tabId, removeInfo) {
    if (debug) {
      console.debug('tab(%d).onRemoved listener fired: %s', tabId, JSON.stringify(removeInfo));
    }
    // window closing, no need to update anybody (todo check if this is true)
    if (removeInfo.isWindowClosing === false) {
      // send event to inform all instances about the removed Tab and update their sidebar / main view if needed
      sendRuntimeMessage('TabRemoved', {tabId: tabId, removeInfo: removeInfo});
    }
  });

  browser.tabs.onMoved.addListener(function (tabId, moveInfo) {
    if (debug) {
      console.debug('tab(%d).onMoved listener fired: %s', tabId, JSON.stringify(moveInfo));
    }
    // send event to inform all instances about the moved Tab and update their main view if needed
    sendRuntimeMessage('TabMoved', {tabId: tabId, moveInfo: moveInfo});
  });

  browser.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (debug) {
      console.debug('tab(%d).onUpdated listener fired: %s', tabId, JSON.stringify(changeInfo));
    }
    // URL changed?
    // send event to inform all instances about the updated Tab and update their sidebar / main view if needed
    sendRuntimeMessage('TabUpdated', {tabId: tabId, changeInfo: changeInfo, tab: tab});
  });

  browser.tabs.onReplaced.addListener(function (addedTabId, removedTabId) {
    if (debug) {
      console.debug('tab().onReplaced listener fired: addedTabId=%d, removedTabId=%d', addedTabId, removedTabId);
    }
    // send event to inform all instances about the updated Tab and update their sidebar / main view if needed
    sendRuntimeMessage('TabReplaced', {addedTabId: addedTabId, removedTabId: removedTabId});
  });


  browser.windows.onRemoved.addListener(function (windowId) {
    if (debug) {
      console.debug('window(%d).onRemoved listener fired.', windowId);
    }
    // send event to inform all instances about the removed Window and update their sidebar
    sendRuntimeMessage('WindowRemoved', {windowId: windowId});
  });

  browser.windows.onCreated.addListener((window) => {
    if (debug) {
      console.debug('window.onCreated listener fired: %O', window);
    }
    // auto-load Papatab popup (no problem if already open)
    openPapaTab({windowId: window.id}).then(() => {
      // send event to inform all instances about the new Window and update their sidebar
      sendRuntimeMessage('WindowCreated', {window: window});
    }).catch(err => console.error('window created - openPapaTab failed: %O', err));
  });

  //add listeners for tab and window focus changes
  //when a tab or window is changed, close the move tab popup if it is open
  browser.windows.onFocusChanged.addListener(function (windowId) {
    if (debug) {
      console.debug('window(%d).onFocusChanged listener fired', windowId);
    }
    // Prevent a click in the popup on Ubuntu or ChromeOS from closing the
    // popup prematurely.
    if (windowId === browser.windows.WINDOW_ID_NONE) {
      return;
    }
  });

  //add listeners for message requests from other extension pages (popup.html)
  browser.runtime.onMessage.addListener((request, sender) => {
    if (debug) {
      console.debug('onMessage listener fired: request=%O, sender=%O', request, sender);
    }
    // endpoints called by popup.js
    switch (request.action) {
      case 'CreateWindow':
        // CreateWindow - handle in background.js
        console.debug("CreateWindow() request=%O", request);
        // return promise
        return handleCreateWindow();
    }
  });

  //runtime extension install listener
  browser.runtime.onInstalled.addListener(function (details) {
    if (details.reason === "install") {
      console.debug("This is a first install!");
      if (debug) {
        console.info('Extension freshly installed!');
      }
    } else if (details.reason === "update") {
      let thisVersion = browser.runtime.getManifest().version;
      if (details.previousVersion !== thisVersion) {
        console.info('Updated from version %s to %s!', details.previousVersion, thisVersion);
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

function sendRuntimeMessage(action, detail, thenAction) {
  if (browser.runtime.onMessage.hasListeners()) {
    browser.runtime.sendMessage({
      action: action,
      detail: detail
    }).then(thenAction)
    // todo: check how to prevent this: Could not establish connection. Receiving end does not exist. (happens if popup not open)
      .catch(err => console.info('%s sendMessage problem: %s', action, err.message));
  }
}

async function openPapaTab(param) {
  // query tab for specified or current window with extension URL
  let tabs = await browser.tabs.query({
    windowId: (param && 'windowId' in param) ? param.windowId : browser.windows.WINDOW_ID_CURRENT,
    url: browser.extension.getURL('popup.html')
  });
  for (let i = 0; i < tabs.length; i++) {
    if (i > 0) {
      await browser.tabs.remove(tabs[i].id);
      console.debug("Closed additional PapaTab instance");
      continue;
    }
    // if open, ensure it is pinned (user might have accidentally un-pinned it)
    browser.tabs.update(tabs[i].id, {pinned: true, highlighted: true, active: true, autoDiscardable: false});
  }
  if (tabs.length === 0) {
    await browser.tabs.create({
      url: browser.extension.getURL('popup.html'),
      windowId: (param && 'windowId' in param) ? param.windowId : browser.windows.WINDOW_ID_CURRENT,
      pinned: true
    });
  }
}

/*
 * Activate or Open Papatab when extension action is clicked
 *   this calls the openPapaTab with tabs.tab as parameter
 */
browser.browserAction.onClicked.addListener(openPapaTab);

/*
// open Papatab in all Window
browser.windows.getAll({populate: false})
  .then((windows) => {
    for (win of windows) {
      openPapaTab({windowId: win.id});
    }
  }).catch(err => console.warn('Browser Window getAll problem: %O', err));
*/