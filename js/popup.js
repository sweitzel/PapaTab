/*
 * popup.js - Popup / Workspace window
 * ===================================================
 *
 * By Sebastian Weitzel, sebastian.weitzel@gmail.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

/*
  Ideas for improvements:
    https://github.com/juliangarnier/anime
 */

/*
 * PopupSidebar
 *   the sidebar mainly supports the user selecting the Topic/Windows to work on
 */
class PopupSidebar {
  constructor(pt) {
    // to trigger event (e.g. on modal)
    this.pt = pt;
    // Topic array to keep track of existing Topics
    this.topics = [];
    // BrowsingWindow array to keep track of open Browser Windows
    this.windows = [];

    // DOM Nodes
    this.nodes = {
      divSidebar: document.getElementById('divSidebar'),
      navSidebar: document.getElementById('navSidebar'),
      divOverlay: document.getElementById('divOverlay'),
      ulSidebarTopics: document.getElementById('ulSidebarTopics'),
      ulSidebarWindows: document.getElementById('ulSidebarWindows'),
      butSideBarMenu: document.getElementById('butSidebarMenu'),
      butAddTopic: document.getElementById('butAddTopic'),
      butAddWindow: document.getElementById('butAddWindow'),
    };

    // This could be better
    this.draw = this.draw.bind(this);
    this.drawTopics = this.drawTopics.bind(this);
    this.drawWindows = this.drawWindows.bind(this);
    this.addTopic = this.addTopic.bind(this);
    this.addWindow = this.addWindow.bind(this);
    this.toggleDisplay = this.toggleDisplay.bind(this);
    this.registerEvents = this.registerEvents.bind(this);
    this.saveTopicOrderToDb = this.saveTopicOrderToDb.bind(this);

    this.getTopicForWindowId = this.getTopicForWindowId.bind(this);

    this.draw()
      .then()
      .catch(err => console.error("PopupSidebar.constructor(): draw() failed with err=%s", err));
  }

  // Toggle between showing and hiding the sidebar, and add overlay effect
  toggleDisplay() {
    // hide the sidebar if its shown, else show it
    if (this.nodes.divSidebar.style.display === 'block') {
      this.nodes.divSidebar.style.display = 'none';
      this.nodes.divOverlay.style.display = "none";
    } else {
      this.nodes.divSidebar.style.display = 'block';
      this.nodes.divOverlay.style.display = "block";
    }
  }

  // draw - completely refreshes the sidebar
  async draw() {
    await this.drawTopics();
    this.drawWindows();
    // menu button (only for small screens)
    this.nodes.butSideBarMenu.onclick = this.toggleDisplay;
  }

  async drawTopics() {
    this.nodes.ulSidebarTopics.innerHTML = '';
    if (typeof this.sortableTopics !== 'undefined') {
      this.sortableTopics.destroy();
    }

    // get topics from Database
    let topics = await dbGetTopicsAsArray();
    topics.forEach(this.addTopic);

    // apply Sortable.js to sidebar topics
    let options = {
      handle: '.drag-handle',
      onUpdate: (evt) => {
        if (evt.from === evt.to) {
          console.debug("Moved Topic %s (id=%s) from %d to %d", evt.item.innerText, evt.item.id, evt.oldIndex, evt.newIndex);
          this.saveTopicOrderToDb().then(() => {
            // Send global MoveTopic event, so all other Sidebar instances can get it
            browser.runtime.sendMessage({
              action: 'TopicMove',
              detail: {id: evt.item.id, from: evt.oldIndex, to: evt.newIndex}
            });
          });
        } else {
          console.warn("Moved Topic to unsupported destination (from=%O, to=%O).", evt.from, evt.to);
        }
      }
    };
    this.sortableTopics = Sortable.create(this.nodes.ulSidebarTopics, options);
  }

  drawWindows() {
    this.nodes.ulSidebarWindows.innerHTML = '';
    // get all Windows
    browser.windows.getAll({populate: false})
      .then((windows) => {
        for (let win of windows) {
          // only draw if this is not a topic window
          if (typeof this.getTopicForWindowId(win.id) === 'undefined') {
            this.addWindow(win);
          }
        }
      });
  }

  // add one (existing or new) topic to the topic list
  addTopic(item) {
    if ('deleted' in item) {
      console.debug("Sidebar.addTopic() skipped for deleted topic: %O", item);
      return undefined;
    }
    console.debug("Sidebar.addTopic(): Adding topic=%O", item);
    /*
    // check if Topic was a BrowsingWindow - then remove it
    if (item.windowId) {
      this.removeWindow(item.windowId);
    }
    */
    let newTopic = new Topic({
      pt: this.pt,
      id: item.id,
      name: item.name,
      color: item.color,
      windowId: item.windowId,
      tabs: item.tabs,
      favorites: item.favorites
    });
    if (typeof newTopic.id === 'undefined') {
      console.error("Sidebar.addTopic() new topic id is undefined!");
      return false;
    }
    newTopic.add(this.nodes.ulSidebarTopics);
    this.topics.push(newTopic);
    return newTopic;
  }

  // removes a topic from Topic list
  removeTopic(item) {
    console.debug("Sidebar.removeTopic() id=%d", item.id);
    this.topics.find(topic => topic.id === item.id).remove(this.nodes.ulSidebarTopics);
    this.topics = this.topics.filter(topic => topic.id !== item.id);
  }

  moveTopic(detail) {
    // currently redraw whole topics content
    this.drawTopics().then();
  }

  // store the (updated) order of the Topics to the DB by checking <li> order
  async saveTopicOrderToDb() {
    for (let i = 0; i < this.nodes.ulSidebarTopics.childNodes.length; i++) {
      let topicId = this.nodes.ulSidebarTopics.childNodes[i].id;
      let updated = await debe.topics.update(Topic.idToInt(topicId), {order: i});
      if (updated)
        console.debug("saveTopicOrderToDb(): Topic %d order=%d", Topic.idToInt(topicId), i);
      else
        console.debug("Nothing was updated for Topic %d", Topic.idToInt(topicId));
    }
  }

  // add one window to the sidebar window list
  addWindow(win) {
    console.debug("Sidebar.addWindow(): Adding window with id %d", win.id);
    let newWindow = new BrowsingWindow(this.pt, win);
    if (typeof newWindow.id === 'undefined') {
      console.error("Sidebar.addWindow() window id is undefined!");
      return false;
    }
    newWindow.add(this.nodes.ulSidebarWindows);
    this.windows.push(newWindow);
  }

  // remove window with specified window id
  removeWindow(windowId) {
    console.debug("Sidebar.removeWindow(): Removing window with id %d", windowId);
    let win = this.windows.find(win => win.id === windowId);
    if (win) {
      win.remove(this.nodes.ulSidebarWindows);
    }
    this.windows = this.windows.filter((window) => window.id !== windowId);
  }

  /*
   * Update certain information when a Tab Opened/Closed/Updated:
   *   - For Topic update the Topic Info
   *   - For Windows update the Title
   */
  updateWindowInfo(windowId) {
    console.debug("Sidebar.updateWindowInfo(): Update info for window with id %d", windowId);
    let win = this.windows.find(win => win.id === windowId);
    if (win) {
      win.updateWindowTitle();
    } else {
      console.info('PopupSidebar.updateWindowInfo(): Window with id=%d does not exist', windowId);
    }
  }

  // called when TopicTabUpdated event received
  updateTopicInfo(detail) {
    let topic = this.topics.find(topic => detail.topicId === topic.id);
    if (topic) {
      console.debug("Sidebar.updateTopicInfo(id=%d), detail=%O", detail.topicId, detail);
      if ('tabs' in detail) {
        topic.tabs = detail.tabs;
      }
      if ('name' in detail) {
        topic.name = detail.name;
      }
      if ('color' in detail) {
        topic.color = detail.color;
      }
      // update sidebar info
      topic.updateInfo();
    }
  }

  // determine if the specific window belongs to a Topic
  getTopicForWindowId(windowId) {
    return this.topics.find(topic => {
      return topic.windowId === windowId
    });
  }

  registerEvents() {
    // listen to local 'TopicAdd' (received from ModalAddTopic)
    this.nodes.navSidebar.addEventListener('TopicAdd', (params) => {
      console.debug("Sidebar.AddTopic event: params=%O", params);
      this.addTopic(params.detail);
    });
    // listen to local 'TopicRemove')
    this.nodes.navSidebar.addEventListener('TopicRemove', (params) => {
      console.debug("Sidebar.RemoveTopic event: params=%O", params);
      this.removeTopic(params.detail);
    });
    // listen to global 'AddTopic' (received from other chrome window)
    browser.runtime.onMessage.addListener((request, sender) => {
      // endpoints called by popup.js
      let topic;
      switch (request.action) {
        case 'TopicAdd':
          console.debug("Custom AddTopic event received: detail=%O", request.detail);
          this.addTopic(request.detail);
          break;
        case 'TopicRemove':
          console.debug("Custom TopicRemove event received: detail=%O", request.detail);
          this.removeTopic(request.detail);
          break;
        case 'TopicMove':
          console.debug("Custom TopicMove event received: detail=%O", request.detail);
          this.moveTopic(request.detail);
          break;
        case 'TopicInfoUpdated':
          console.debug("PopupSidebar - Custom TopicInfoUpdated event received: detail=%O", request.detail);
          this.updateTopicInfo(request.detail);
          break;
        case 'TopicLoaded':
          console.debug("Custom TopicLoaded event received: detail=%O", request.detail);
          // a WindowCreated event can happen before TopicLoaded is received, therefore first cleanup the window
          let win = this.windows.find(win => request.detail.windowId === win.id);
          if (win) {
            console.debug("Browser event TopicLoaded event; removing (wrong) Sidebar Window");
            this.removeWindow(request.detail.windowId);
          }
          topic = this.topics.find(topic => request.detail.id === topic.id);
          if (topic) {
            topic.windowId = request.detail.windowId;
            topic.setOpen();
          }
          break;
        case 'WindowCreated':
          console.debug("Custom WindowCreated event received: detail=%O, topics=%O", request.detail, this.topics);
          if (this.windows.find(win => win.id === request.detail.window.id)) {
            // when a session is restored, the windows are open but WindowCreated is sent again
            console.debug("Ignored WindowCreated event for existing window id (%d)", request.detail.window.id);
          }
          // if a Topic is loaded, WindowCreated will also be sent
          // Note: if WindowCreated happens before TopicLoaded, then windowId is unknown and this will not work here
          else if (topic = this.getTopicForWindowId(request.detail.window.id)) {
            topic.setOpen();
          }
          else {
            this.addWindow(request.detail.window);
          }
          break;
        case 'WindowRemoved':
          console.debug("Custom WindowRemoved event received: detail=%O", request.detail);
          if ('converted' in request.detail) {
            // a Topic can be converted to a Window, in that case WindowRemoved should not touch the Topic
            this.removeWindow(request.detail.windowId);
          } else if (topic = this.getTopicForWindowId(request.detail.windowId)) {
            // A WindowRemoved for a Topic, set Topic to closed
            topic.setClosed();
            this.removeWindow(request.detail.windowId);
          } else {
            this.removeWindow(request.detail.windowId);
          }
          break;
        case 'UpdateWindowInfo':
          console.debug("Custom UpdateWindowInfo event received: detail=%O", request.detail);
          this.updateWindowInfo(request.detail.windowId);
          break;
      }
    });
    // when add topic button clicked, dispatch to modal
    this.nodes.butAddTopic.addEventListener('click', () => {
      let event = new Event('TopicAdd');
      this.pt.refModalAddTopic.nodes.div.dispatchEvent(event);
    });

    // when add window button clicked
    this.nodes.butAddWindow.addEventListener('click', () => {
      // Send global CreateWindow event
      browser.runtime.sendMessage({
        action: 'CreateWindow'
      }).then(retVal => console.debug("CreateWindow complete: %s", JSON.stringify(retVal)))
        .catch(err => console.warn("CreateWindow failed: %O", err));
    });
  }

}

/*
 * MainView
 *   main section containing open Windows/Topics
 *   Note: the Main view *always* shows the tabs of the current window.
 */
class PopupMain {
  constructor(pt) {
    this.pt = pt;
    // DOM Nodes
    this.nodes = {
      div: document.getElementById('divMainFlex'),
      divOptions: document.getElementById('divOptions'),
      header: document.getElementById('hMainHeader'),
      ulActiveTabs: document.getElementById('ulMainActiveTabs'),
      ulSavedTabs: document.getElementById('ulMainSavedTabs'),
      butAddTab: document.getElementById('butAddTab'),
      inputSearchBar: document.getElementById('inputSearchBar')
    };
    // store instances of Tab, with index = tab.id
    this.tabs = [];
    this.favorites = [];

    this.drawTabs = this.drawTabs.bind(this);
    this.addTab = this.addTab.bind(this);
    this.updateTitle = this.updateTitle.bind(this);

    this.drawTopicOptions();
    this.drawTabs();
    this.drawSavedTabs();
    this.setupFilter();
    // restore previously open tabs (Topic)
    this.restoreTabs()
      .then()
      .catch(err => console.error("PopupMain.constructor(): restoreTabs failed with %s", err));
  }

  // draw active tabs in current Window or Topic
  drawTabs() {
    while (this.nodes.ulActiveTabs.firstChild) {
      this.nodes.ulActiveTabs.removeChild(this.nodes.ulActiveTabs.firstChild);
    }
    this.nodes.ulActiveTabs.style.width = '800px';
    // add active tabs
    for (let tab of this.pt.whoIAm.currentWindow.tabs) {
      this.addTab(tab);
    }
    // apply Sortable.js to active tab list
    let options = {
      handle: '.drag-handle',
      draggable: '.can-be-dragged',
      onAdd: function (evt) {
        console.debug('onAdd.Tab:', [evt.item, evt.from]);
      },
      onRemove: function (evt) {
        console.debug('onRemove.Tab:', [evt.item, evt.from]);
      },
      onStart: function (evt) {
        console.debug('onStart.Tab:', [evt.item, evt.from]);
      },
      onSort: function (evt) {
        console.debug('onSort.Tab:', [evt.item, evt.from]);
      },
      onEnd: function (evt) {
        console.debug('onEnd.Tab:', [evt.item, evt.from])
      },
      onUpdate: (evt) => {
        // same window (from = to)?
        if (evt.from === evt.to) {
          console.debug("Moved Tab %s (id=%s) from %d to %d", evt.item.innerText, evt.item.id, evt.oldIndex, evt.newIndex);
          this.moveTabInWindow(evt);
          return true;
        } else {
          console.warn("Moved Tab to unsupported destination (from=%O, to=%O).", evt.from, evt.to);
          return false;
        }
      }
    };
    this.sortableTabs = Sortable.create(this.nodes.ulActiveTabs, options);
  }

  // draw tabs saved by user (Topic only)
  drawSavedTabs() {
    if (!this.pt.whoIAm || !this.pt.whoIAm.currentTopic) {
      document.getElementById('divMainSavedTabs').classList.add('w3-hide');
      return;
    } else {
      if (this.pt.whoIAm.currentTopic.favorites && this.pt.whoIAm.currentTopic.favorites.length > 0) {
        while (this.nodes.ulSavedTabs.firstChild) {
          this.nodes.ulSavedTabs.removeChild(this.nodes.ulSavedTabs.firstChild);
        }
        this.nodes.ulSavedTabs.style.width = '600px';
        // add saved/favorite tabs
        for (let savedTab of this.pt.whoIAm.currentTopic.favorites) {
          this.addFavoriteTab(savedTab);
        }
      } else {
        document.getElementById('divMainSavedTabs').classList.add('w3-hide');
      }
    }
  }

  // draw options for current Topic
  drawTopicOptions() {
    this.nodes.divOptions.innerHTML = "";
    // themeSwitcher (maybe not the best location)
    let light = document.getElementById("lightTheme");
    let dark = document.getElementById("darkTheme");
    // get theme state from storage area
    dark.disabled = true;
    light.disabled = false;
    getLocalConfig('darkThemeEnabled')
      .then((prop) => {
        if ('darkThemeEnabled' in prop && prop['darkThemeEnabled'] === true) {
          dark.disabled = false;
          light.disabled = true;
          butt.checked = true;
        }
      })
      .catch(err => console.warn('drawTopicOptions(): Unable to get option from browser storage: %O', err));
    let butt = document.getElementById("cb1");
    butt.onclick = function () {
      if (butt.checked) {
        light.disabled = true;
        dark.disabled = false;
        setLocalConfig('darkThemeEnabled', true);
      } else {
        light.disabled = false;
        dark.disabled = true;
        setLocalConfig('darkThemeEnabled', false);
      }
    };

    if (!this.pt.whoIAm || !this.pt.whoIAm.currentTopic) {
      // its a regular Window
      // add button to convert to Topic
      let divConvert = document.createElement('div');
      divConvert.classList.add('w3-display-topright', 'w3-xxlarge', 'w3-text-theme-light', 'far', 'fa-save', 'tooltip', 'my-zoom-hover');
      divConvert.id = 'tipSaveAsTopic';
      divConvert.style.marginRight = '35px';
      divConvert.style.marginTop = '60px';
      divConvert.style.position = 'absolute';
      let spanConvertHelp = document.createElement('span');
      spanConvertHelp.classList.add('tooltiptext', 'w3-text-theme-light');
      spanConvertHelp.innerText = getTranslationFor("tipSaveAsTopic");
      spanConvertHelp.style.top = '130px';
      spanConvertHelp.style.right = '0';

      divConvert.addEventListener('click', (e) => {
        e.preventDefault();
        // find BrowsingWindow instance;
        let browsingWindow = this.pt.refSidebar.windows.find(win => win.id === this.pt.whoIAm.currentWindow.id);
        if (browsingWindow) {
          // call convert
          browsingWindow.saveAsTopic()
            .then()
            .catch(err => console.warn('PopupMain converting window to topic failed: %O', err));
        } else {
          console.warn("Cannot convert Window to Topic, window not found in %O (current=%O)",
            this.pt.refSidebar.windows, this.pt.whoIAm.currentWindow)
        }
      });

      this.nodes.divOptions.appendChild(divConvert);
      this.nodes.divOptions.appendChild(spanConvertHelp);
      return;
    }
    // Name
    let inputName = document.createElement('input');
    inputName.classList.add('w3-border-bottom', 'w3-margin-bottom', 'w3-hover-border-theme');
    inputName.name = 'Topic Name';
    inputName.type = 'text';
    inputName.value = this.pt.whoIAm.currentTopic.name;
    inputName.autocomplete = false;
    inputName.maxLength = 32;
    inputName.required = true;
    inputName.align = 'middle';
    inputName.spellcheck = false;
    inputName.style.border = 'none';
    inputName.style.fontSize = '2em';
    inputName.style.height = '50px';
    inputName.style.width = '400px';
    inputName.style.background = 'unset';
    inputName.style.color = '36px';

    let spanCreateTime = document.createElement('span');
    spanCreateTime.classList.add('w3-small', 'w3-opacity-min', 'w3-text-theme-light');
    spanCreateTime.innerText = getTranslationFor('Created') + ' ' + timeDifference(this.pt.whoIAm.currentTopic.createdTime);
    spanCreateTime.style.userSelect = 'none';
    spanCreateTime.style.right = '6%';
    spanCreateTime.style.top = '97%';
    spanCreateTime.style.position = 'fixed';

    let divOptionsRight = document.createElement('div');
    divOptionsRight.classList.add('w3-right');

    // Topic to Trash
    let iTrash = document.createElement('i');
    iTrash.classList.add('w3-xxlarge', 'w3-padding-24', 'w3-margin-right', 'w3-text-theme', 'w3-hover-text-red', 'fa', 'fa-trash-alt', 'my-zoom-hover', 'tooltip');
    iTrash.id = 'tipTopicToTrash';
    let spanTrashTip = document.createElement('span');
    spanTrashTip.classList.add('tooltiptext', 'w3-text-theme-light');
    spanTrashTip.style.right = '40px';
    spanTrashTip.style.top = '150px';
    spanTrashTip.innerText = getTranslationFor('tipMoveTopicToTrash', 'Move Topic to Trash');

    divOptionsRight.appendChild(iTrash);
    divOptionsRight.appendChild(spanTrashTip);

    // Color
    let inputColor = document.createElement('input');
    inputColor.id = 'tipTopicColor';
    inputColor.classList.add('w3-border', 'w3-right', 'w3-margin', 'my-zoom-hover', 'colorChooser', 'tooltip');
    inputColor.name = 'Topic Color';
    inputColor.type = 'color';
    inputColor.value = this.pt.whoIAm.currentTopic.color;
    inputColor.style.height = '42px';
    inputColor.style.width = '42px';
    inputColor.style.cursor = 'pointer';
    let spanColorTip = document.createElement('span');
    spanColorTip.classList.add('tooltiptext', 'w3-text-theme-light');
    spanColorTip.style.right = '20px';
    spanColorTip.style.top = '150px';
    spanColorTip.innerText = getTranslationFor('tipChangeTopicColor', 'Change topic color');

    divOptionsRight.appendChild(inputColor);
    divOptionsRight.appendChild(spanColorTip);

    inputName.addEventListener('focusout', () => {
      // save new name to DB
      dbUpdateTopic(this.pt.whoIAm.currentTopic.id, {name: inputName.value})
        .then(() => {
          console.log("Topic Name update succeeded");
          // update main
          this.pt.refMain.updateTitle(inputName.value, inputColor.value);
          PopupMain.updateFavicon(inputName.value, inputColor.value);
          this.pt.whoIAm.currentTopic.name = inputName.value;
          // update sidebar
          this.pt.refSidebar.updateTopicInfo({
            topicId: this.pt.whoIAm.currentTopic.id,
            name: inputName.value,
            color: inputColor.value
          });
          // inform other browser window instances about the updated tabs
          browser.runtime.sendMessage({
            action: 'TopicInfoUpdated',
            detail: {
              source: 'PopupMain.drawTopicOptions',
              topicId: this.pt.whoIAm.currentTopic.id,
              name: inputName.value,
              color: inputColor.value
            }
          });
          // reset input validation error
          inputName.setCustomValidity("");
        })
        .catch(err => {
          console.warn("Topic Name update failed: %O", err);
          inputName.value = this.pt.whoIAm.currentTopic.name;
          inputName.setCustomValidity("Unable to save - invalid name");
        });
    });
    inputName.addEventListener("keyup", function (event) {
      // Cancel the default action, if needed
      event.preventDefault();
      // Number 13 is the "Enter" key on the keyboard
      if (event.keyCode === 13) {
        inputName.blur();
      }
    });
    inputColor.addEventListener('change', () => {
      // save new color to DB
      dbUpdateTopic(this.pt.whoIAm.currentTopic.id, {color: inputColor.value})
        .then(() => {
          console.log("Topic Color update succeeded");
          // update main
          this.pt.refMain.updateTitle(inputName.value, inputColor.value);
          PopupMain.updateFavicon(inputName.value, inputColor.value);
          // update sidebar
          this.pt.refSidebar.updateTopicInfo({
            topicId: this.pt.whoIAm.currentTopic.id,
            name: inputName.value,
            color: inputColor.value
          });
          // inform other browser window instances about the updated tabs
          browser.runtime.sendMessage({
            action: 'TopicInfoUpdated',
            detail: {
              source: 'PopupMain.drawTopicOptions',
              topicId: this.pt.whoIAm.currentTopic.id,
              name: inputName.value,
              color: inputColor.value
            }
          }).then().catch(err => console.warn('Unable to send browser message: %O', err));
        })
        .catch(err => {
          console.warn("Topic Color update failed: %s", err);
          inputColor.value = this.pt.whoIAm.currentTopic.color;
          inputColor.setCustomValidity("Unable to save - invalid color?");
        });
    });

    iTrash.addEventListener('click', (e) => {
      e.preventDefault();
      // find Topic instance, then call delete on it
      let topic = this.pt.refSidebar.topics.find(topic => topic.id === this.pt.whoIAm.currentTopic.id);
      if (topic) {
        topic.moveToTrash();
      } else {
        console.warn("Cannot delete Topic, Topic not found in %O (current=%O)", this.pt.refSidebar.topics, this.pt.whoIAm.currentTopic)
      }
    });

    this.nodes.divOptions.appendChild(inputName);
    this.nodes.divOptions.appendChild(spanCreateTime);

    this.nodes.divOptions.appendChild(divOptionsRight);

    // delete button
  }

  /* on load, restore saved Topic tabs
   * Note: This has to be done before PopupMain event listeners are registered
   *       Tabs will be initialized by PopupMain.draw()
   */
  async restoreTabs() {
    // close undesired tabs
    async function closeSomeTabs() {
      let tabs = await browser.tabs.query({currentWindow: true});
      let tabCount = tabs.length;
      for (let tab of tabs) {
        if (tab.url.startsWith('about:') || tab.url.startsWith('chrome://newtab')) {
          console.debug('restoreTabs() closed tab before restore: %d=%s', tab.index, tab.url);
          await browser.tabs.remove(tab.id);
          tabCount--;
        }
      }
      return tabCount;
    }
    let tabCount = await closeSomeTabs();

    if (this.pt.whoIAm && this.pt.whoIAm.currentTopic && 'tabs' in this.pt.whoIAm.currentTopic) {
      // check if restore is needed (might be just a popup page refresh, or session restore)
      if (tabCount !== 1) {
        console.debug("PopupMain.restoreTabs(); restoring Tabs aborted, already %d tabs present", tabCount);
        return false;
      }
      console.debug("PopupMain.restoreTabs(); restoring Tabs for Topic %s", this.pt.whoIAm.currentTopic.name);
      // topic tabs are already loaded from Db by Topic init
      for (let tab of this.pt.whoIAm.currentTopic.tabs) {
        /*
        if (tab.url.startsWith('about:')) {
          continue;
        }
        */
        // url
        // active
        // title
        // pinned
        // openerTabId (todo this is more difficult as the old tabId has to be matched first)
        await browser.tabs.create({url: tab.url, active: tab.active, pinned: tab.pinned});
      }
      return true;
    }
    return false;
  }

  // updates the title according to which window or topic is open
  updateTitle(newTitle, newColor) {
    document.title = newTitle;
    let title = document.createElement('h4');
    title.innerText = newTitle;
    if (newColor) {
      title.style.color = newColor;
    } else {
      title.style.color = "#ccc";
    }
    title.style.animation = 'fadein';
    title.style.animationDuration = '5s';

    this.nodes.header.innerHTML = '';
    this.nodes.header.appendChild(title);
  }

  // add a tab to topic or window
  addTab(tab) {
    console.debug("PopupMain.addTab(): Adding tab with id %d", tab.id);
    let newTab = new Tab(this.pt, tab);
    if (typeof newTab.id === 'undefined') {
      console.error("PopupMain.addTab(): new tab id is undefined!");
      return false;
    }
    newTab.add(this.nodes.ulActiveTabs);
    newTab.saveTabsToDb();
    this.tabs.push(newTab);
  }

  removeTab(tabId) {
    console.debug("PopupMain.removeTab(): Removing tab with id %d", tabId);
    let tab = this.tabs.find(tab => tab.id === tabId);
    if (tab) {
      tab.remove(this.nodes.ulActiveTabs);
      this.tabs = this.tabs.filter(tab => tab.id !== tabId);
      tab.saveTabsToDb();
    }
  }

  updateTab(tabId, newTab, changeInfo) {
    console.debug("PopupMain.updateTab(): Updating tab with id %d; %s, allTabs=%O", tabId, JSON.stringify(changeInfo), this.tabs);
    let tab = this.tabs.find(tab => tab.id === tabId);
    if (tab) {
      tab.update(this.nodes.ulActiveTabs, newTab, changeInfo);
      // TODO updateTab is called often (loading/complete status), optimization of DB saving should be considered)
      tab.saveTabsToDb();
    }
  }

  /*
   * Reorder tabs in Sortable list
   *   called when a tab is moved one Browser Window
   */
  moveTab(tabId, moveInfo) {
    console.debug("PopupMain.moveTab(): Moving tab with id %d; %s", tabId, JSON.stringify(moveInfo));
    let tab = this.tabs.find(tab => tab.id === tabId);
    if (tab) {
      tab.move(this.nodes.ulActiveTabs, moveInfo.fromIndex, moveInfo.toIndex);
      tab.saveTabsToDb();
    }
  }

  /*
   * Reorder tabs in Browser Window
   *   called when a tab is moved within one Sortable list
   */
  moveTabInWindow(evt) {
    // get tab by tabId
    let tabId = Tab.idToInt(evt.item.id);
    let tab = this.tabs.find(tab => tab.id === tabId);
    if (tab) {
      console.debug("PopupMain.moveTabInWindow() tab id=%d , %O", tabId, evt);
      browser.tabs.move(tabId, {index: evt.newIndex});
    }
  }

  // add a favorite tab to the list (it has already been saved to DB)
  addFavoriteTab(savedTab) {
    console.debug("PopupMain.addFavoriteTab(): Adding a saved tab - %O", savedTab);
    if (document.getElementById('divMainSavedTabs').classList.contains('w3-hide')) {
      document.getElementById('divMainSavedTabs').classList.remove('w3-hide');
    }
    let newSavedTab = new FavoriteTab(this.pt, savedTab);
    newSavedTab.add(this.nodes.ulSavedTabs);
    this.favorites.push(newSavedTab);
  }

  // remove a favorite tab from the list (it has already been updated in DB)
  removeFavoriteTab(savedTab) {
    console.debug("PopupMain.removeFavoriteTab(): Removing saved tab %O", savedTab);
    let removeTab = this.favorites.find(tab => tab.url === savedTab.url);
    if (removeTab) {
      // remove from <li>
      removeTab.remove(this.nodes.ulSavedTabs);
      // and update the FavoriteTab array
      this.favorites = this.favorites.filter(tab => tab.url !== savedTab.url);
    }
    if (this.favorites.length === 0) {
      document.getElementById('divMainSavedTabs').classList.add('w3-hide');
    }
  }

  /*
   * called when any tab is opened, closed or changed
   * if the tab belongs to a Topic window - the tabs will be saved to the Topics DB
   */

  /* moved this to tab
  saveTabsToDb(tab) {
    if (this.pt.refSidebar.getTopicForWindowId(tab.windowId)) {
      console.debug("saveTabsToDb() Tab with id=%d belongs to Topic window with id %d %O", tab.id, tab.windowId, tab);
    } else {
      console.debug("saveTabsToDb() Tab with id=%d does not belong to a Topic (window id %d)", tab.id, tab.windowId);
    }
  }
  */

  static updateFavicon(title, color) {
    let favUrl = createFavicon(title, color);
    if (favUrl) {
      favUrl.id = "favicon";
      let head = document.getElementsByTagName('head')[0];
      if (document.getElementById('favicon')) {
        head.removeChild(document.getElementById('favicon'));
      }
      head.appendChild(favUrl);
    }
  }

  /*
   * initialize List filter which is fed by the search bar
   */
  setupFilter() {
    // search bar place holder
    this.nodes.inputSearchBar.placeholder = getTranslationFor('SearchBarPlaceholder');
    // jump to searchBar if 's' key is pressed
    document.addEventListener('keyup', (event) => {
      if ('key' in event) {
        if (event.key === 's' && (document.activeElement && document.activeElement.nodeName !== 'INPUT')) {
          this.nodes.inputSearchBar.focus();
        }
      }
    });
    // search bar event listener
    this.nodes.inputSearchBar.addEventListener('keyup', () => {
      this.filterTabs(this.nodes.inputSearchBar.value);
      this.filterFavorites(this.nodes.inputSearchBar.value);
    });
    this.nodes.inputSearchBar.addEventListener('search', () => {
      this.filterTabs(this.nodes.inputSearchBar.value);
      this.filterFavorites(this.nodes.inputSearchBar.value);
    });
  }

  filterTabs(searchTerm) {
    console.debug("NEW filterTabs(): Search for %s", searchTerm);
    if (!this.tabs || typeof searchTerm === 'undefined') {
      return;
    }
    let foundByTitle = 0;
    let foundByUrl = 0;
    for (let tab of this.tabs) {
      let title = tab.spanTabTitle.textContent;
      let url = tab.spanTabUrl.textContent;
      if (title && title.toUpperCase().indexOf(searchTerm.toUpperCase()) > -1) {
        foundByTitle++;
        tab.li.style.display = 'block';
      } else if (url && url.toUpperCase().indexOf(searchTerm.toUpperCase()) > -1) {
        foundByUrl++;
        tab.li.style.display = 'block';
      } else {
        // hide the LI
        tab.li.style.display = 'none';
      }
    }
    console.debug("DONE filterTabs(): Search for %s in active Tabs (foundByTitle=%d, foundByUrl=%d)",
      searchTerm, foundByTitle, foundByUrl);
  }

  filterFavorites(searchTerm) {
    if (!this.favorites) {
      return;
    }
    let foundByTitle = 0;
    let foundByUrl = 0;
    for (let fav of this.favorites) {
      let title = fav.spanTabTitle.textContent;
      let url = fav.spanTabUrl.textContent;
      if (title.toUpperCase().indexOf(searchTerm.toUpperCase()) > -1) {
        foundByTitle++;
        fav.li.style.display = 'block';
      } else if (url.toUpperCase().indexOf(searchTerm.toUpperCase()) > -1) {
        foundByUrl++;
        fav.li.style.display = 'block';
      } else {
        // hide the LI
        fav.li.style.display = 'none';
      }
    }
    console.debug("filterFavorites(): Search for %s in favorite Tabs (foundByTitle=%d, foundByUrl=%d)",
      searchTerm, foundByTitle, foundByUrl);
  }

  registerEvents() {
    // listen to global events (received from other Browser window or background script)
    browser.runtime.onMessage.addListener((request) => {
      // endpoints called by popup.js
      switch (request.action) {
        case 'TabCreated':
          if (this.pt.whoIAm.currentWindow.id === request.detail.tab.windowId) {
            console.debug("Browser Event TabCreated received: detail=%O", request.detail);
            this.addTab(request.detail.tab);
            // update title (sidebar + main)
            this.pt.refSidebar.updateWindowInfo(request.detail.tab.windowId);
            browser.runtime.sendMessage({
              action: 'UpdateWindowInfo',
              detail: {windowId: request.detail.tab.windowId}
            });
          }
          break;
        case 'TabRemoved':
          if (this.pt.whoIAm.currentWindow.id === request.detail.removeInfo.windowId) {
            console.debug("Browser Event TabRemoved received: detail=%O", request.detail);
            this.removeTab(request.detail.tabId);
            // update title (sidebar + main)
            this.pt.refSidebar.updateWindowInfo(request.detail.removeInfo.windowId);
            browser.runtime.sendMessage({
              action: 'UpdateWindowInfo',
              detail: {windowId: request.detail.removeInfo.windowId}
            });
          }
          break;
        case 'TabMoved':
          if (this.pt.whoIAm.currentWindow.id === request.detail.moveInfo.windowId) {
            console.debug("Browser Event TabMoved received: detail=%O", request.detail);
            this.moveTab(request.detail.tabId, request.detail.moveInfo);
            // update title of other windows (sidebar + main)
            this.pt.refSidebar.updateWindowInfo(request.detail.moveInfo.windowId);
            browser.runtime.sendMessage({
              action: 'UpdateWindowInfo',
              detail: {windowId: request.detail.moveInfo.windowId}
            });
          }
          break;
        case 'TabUpdated':
          if (request.detail.tab && this.pt.whoIAm.currentWindow.id === request.detail.tab.windowId) {
            console.debug("Browser Event TabUpdated received: detail=%O", request.detail);
            this.updateTab(request.detail.tabId, request.detail.tab, request.detail.changeInfo);
            // changeInfo.status == Complete, URL/Title changed?
            if (request.detail.changeInfo && 'status' in request.detail.changeInfo && request.detail.changeInfo.status === 'complete') {
              // update title on other instances (sidebar + main)
              this.pt.refSidebar.updateWindowInfo(request.detail.tab.windowId);
              browser.runtime.sendMessage({
                action: 'UpdateWindowInfo',
                detail: {windowId: request.detail.tab.windowId}
              });
            }
          }
          break;
        case 'TabReplaced':
          // TabReplaced can happen e.g. when Tab gets discarded.
          // No windowId is received, so check if old TabId is know to this window
          let tab = this.tabs.find(tab => tab.id === request.detail.removedTabId);
          if (tab) {
            console.debug("Browser Event TabReplaced received: detail=%O", request.detail);
            tab.id = request.detail.addedTabId;
          }
          break;
      }
    });

    // when add tab button clicked
    this.nodes.butAddTab.addEventListener('click',() => {
      browser.tabs.create({})
        .then()
        .catch(err => console.warn('Tab creation problem: %O', err));
    });
  }
}

/*
 * Topic
 */
class Topic {
  constructor(params) {
    this.pt = params.pt;
    // Topic id might be undefined (means its a new topic to be saved)
    this.id = params.id;
    // reference to window (from DB; can be stale)
    this.windowId = params.windowId;
    this.name = params.name;
    this.color = params.color;
    // reference to tabs (from DB)
    this.tabs = params.tabs;
    // favorite tabs (from DB)
    this.favorites = params.favorites;

    // sidebar related
    this.li = "";
    this.icon = {};
    this.divTopicTitle = {};
    this.divTopicInfo = {};
    this.divTopicOpen = {};

    // if topic is current window, update (stale) windowId
    if (this.pt.whoIAm && this.pt.whoIAm.currentTopic && this.id === this.pt.whoIAm.currentTopic.id) {
      this.windowId = this.pt.whoIAm.currentWindow.id;
    }

    // bind this
    this.add = this.add.bind(this);
    this.addToDb = this.addToDb.bind(this);
    this.load = this.load.bind(this);
    this.moveToTrash = this.moveToTrash.bind(this);

    this.setOpen = this.setOpen.bind(this);
    this.setClosed = this.setClosed.bind(this);
  }

  // add one topic to the Sidebar topic list
  add(ul) {
    this.li = document.createElement('li');
    this.li.classList.add('w3-bar', 'w3-button', 'w3-hover-theme', 'hidden-info');
    this.li.style.padding = '4px';
    this.li.style.lineHeight = '16px';
    this.li.style.height = '45px';
    this.li.style.width = '285px';
    // item.id is the Dexie database id
    if (typeof this.id !== 'undefined') {
      this.li.setAttribute('id', 'topic-' + this.id);
    } else {
      console.error("addTopic(): Dexie database id unknown for topic %s!", this.name);
    }

    // color-icon
    this.icon = document.createElement('img');
    this.icon.classList.add('w3-bar-item', 'w3-image', 'w3-circle', 'drag-handle');
    let favLink = createFavicon(this.name, this.color);
    if (favLink) {
      this.icon.setAttribute('src', favLink.href);
    }
    this.icon.style.filter = 'opacity(20%)';
    this.icon.style.padding = 'unset';
    this.icon.style.marginLeft = '5px';
    this.icon.style.height = '36px';

    // topic div
    this.divTopic = document.createElement('div');
    this.divTopic.classList.add('w3-bar-item', 'w3-left-align', 'w3-padding-small');
    this.divTopic.style.width = '220px';
    this.divTopicTitle = document.createElement('div');
    this.divTopicTitle.classList.add('w3-medium');
    this.divTopicTitle.innerText = this.name;
    this.divTopicInfo = document.createElement('div');
    this.divTopicInfo.classList.add('w3-small', 'hidden-text');
    this.updateInfo(); // initially set the Topic Info hidden-info
    this.divTopic.appendChild(this.divTopicTitle);
    this.divTopic.appendChild(this.divTopicInfo);

    /* create status bar with various icons, these will be hidden by default */
    let divStatus = document.createElement('div');
    divStatus.classList.add('w3-bar-item', 'tabStatusBar');

    this.divTopicOpen = document.createElement('div');
    this.divTopicOpen.innerText = getTranslationFor('Open');
    this.divTopicOpen.style.fontVariant = 'no-common-ligatures';
    this.divTopicOpen.classList.add('w3-tiny', 'w3-round-large', 'w3-badge', 'w3-card-4', 'w3-theme-d4', 'w3-display-right', 'w3-hide');
    divStatus.appendChild(this.divTopicOpen);

    // if current window, then add selected css class and update main title
    if (this.windowId === this.pt.whoIAm.currentWindow.id) {
      this.li.classList.add('statusSelected');
      this.pt.refMain.updateTitle(this.name, this.color);
      PopupMain.updateFavicon(this.name, this.color);
    }
    this.isOpen().then(result => {
      if (result) {
        this.divTopicOpen.classList.remove('w3-hide');
      }
    });

    //add event listener for each tab link
    this.li.addEventListener('mouseenter', () => {
      //this.li.style = `border-left: 5px solid ${this.color}`;
      //this.icon.style.filter = 'opacity(100%)';
      this.li.classList.add('statusSelected');
    });
    this.li.addEventListener('mouseleave', () => {
      //this.li.style = "border-left: 0; margin-left: 5px";
      //this.icon.style.filter = 'opacity(20%)';
      if (this.windowId !== this.pt.whoIAm.currentWindow.id) {
        this.li.classList.remove('statusSelected');
      }
    });
    this.li.addEventListener('click', (e) => {
      e.preventDefault();
      this.load()
        .then(() => console.debug("Topic load successful"))
        .catch(err => console.error("Topic load failed; %s", err));
    });

    this.li.appendChild(this.icon);
    this.li.appendChild(this.divTopic);
    this.li.appendChild(divStatus);
    ul.appendChild(this.li);
  }

  // add Topic to DB
  async addToDb() {
    this.id = await dbAddTopic(this.name, this.color);
    // inform local Sidebar about new topic
    this.pt.refSidebar.addTopic({
      id: this.id,
      name: this.name,
      color: this.color,
      windowId: this.windowId,
      tabs: this.tabs,
      favorites: this.favorites
    });
    // Send global TopicAdd event, so all other Sidebar instances can get it
    browser.runtime.sendMessage({
      action: 'TopicAdd',
      detail: {id: this.id, name: this.name, color: this.color, tabs: this.tabs, windowId: this.windowId}
    });
    return true;
  }

  // removes a topic from Topic list
  remove(ul) {
    if (this.li && ul.contains(this.li)) {
      ul.removeChild(this.li);
    }
  }

  /*
     check if topic is open
       by checking if this.windowId is one of the open browser windows
   */
  async isOpen() {
    let windows = await browser.windows.getAll({populate: false});
    if (windows.find(win => win && win.id === this.windowId)) {
      return true;
    } else {
      return false;
    }
  }

  // mark a topic as open
  setOpen() {
    console.debug("Topic(%d).setOpen() called", this.id);
    if (this.divTopicOpen) {
      this.divTopicOpen.classList.remove('w3-hide');
    }
  }

  setClosed() {
    console.debug("Topic(%d).setClosed() called", this.id);
    if (this.divTopicOpen) {
      this.divTopicOpen.classList.add('w3-hide');
    }
    // update database entry
    dbUpdateTopic(this.id, {windowId: undefined}).then((updated) => {
      this.windowId = undefined;
    }).catch(err => console.warn('Topic.setClosed() problem: %O', err));
  }

  /*
   * update Sidebar divTopicInfo with the information about the Topic tabs
   *   e.g. 'google.de +8 more tabs'
   */
  updateInfo() {
    // update topic name if needed
    this.divTopicTitle.innerText = this.name;
    // update Icon
    let favLink = createFavicon(this.name, this.color);
    if (favLink) {
      this.icon.setAttribute('src', favLink.href);
    }
    // update tab related info
    if (this.tabs) {
      console.debug("Topic(%d).updateInfo() %O", this.id, this.tabs);
      let count = 0;
      let info = "";
      for (let tab of this.tabs) {
        count++;
        if (tab.pinned === false) {
          if (info === "") {
            try {
              let url = new URL(tab.url);
              //title = url.hostname.replace(/^www./, '').trunc(16);
              info = punycode.toUnicode(url.hostname).replace(/^www./, '').trunc(20);
            } catch (err) {
              console.warn("Topic.updateInfo() error=%s", err);
            }
          }
        }
      }
      if (count === 0) {
        info = "no tabs open";
      } else if (count > 1) {
        let t = maybePluralize(count - 1, 'other tab', 's');
        info += " +" + t;
      }
      this.divTopicInfo.innerText = info;
    }
  }

  /*
   * Called when any tab is opened, closed or changed
   *   if the tab belongs to a Topic window - the tabs will be saved to the Topics DB
   */
  async saveTabsToDb() {
    // get all Tabs of the Topics Window
    let tabs = await browser.tabs.query({windowId: this.windowId});
    // exclude extension Tabs
    tabs = tabs.filter(tab => !tab.url.includes(browser.extension.getURL('')));
    // remove certain space-wasting information before storing it to DB
    sanitizeTabs(tabs);
    console.debug("Topic(%d).saveTabsToDb(): Found tabs (filter ext tab): %O ", this.id, tabs);
    // store Tabs to DB
    await dbUpdateTopic(this.id, {tabs: tabs});
    // update cached Topic.tabs information after save
    let topic = await dbGetTopicBy('id', this.id).first();
    if (topic) {
      this.tabs = topic.tabs;
    }
    // inform other browser window instances about the updated tabs
    browser.runtime.sendMessage({
      action: 'TopicInfoUpdated',
      detail: {source: 'Topic.saveTabsToDb', topicId: this.id, tabs: this.tabs}
    });
    return true;
  }

  /*
    load - load the topic:
             focus window if topic already open, or
             create new window and load topic tabs if topic not open
  */
  async load() {
    let open = await this.isOpen();
    if (open) {
      // callback only called if window for topic is existing
      // update all windows to drawAttention false (to prevent too much blinking)
      browser.windows.update(this.windowId, {drawAttention: false})
        .then(() => {
          console.debug("Topic.load() topicId=%d, existing windowId=%d focused", this.id, this.windowId);
          browser.windows.update(this.windowId, {focused: true, drawAttention: true});
        });
    } else {
      console.debug("Topic.load() topicId=%d, new window will be opened", this.id);
      // only for chrome: setSelfAsOpener: true
      let newWindow = await browser.windows.create();
      this.windowId = newWindow.id;
      // store windowId to DB (so when loading the window it knows which topic it belongs to)
      await dbUpdateTopic(this.id, {windowId: newWindow.id});

      // open extension tab
      //let bg = browser.extension.getBackgroundPage();
      //await bg.openPapaTab({windowId: newWindow.id});

      // Note: open topic tabs will be done by the new windows popup instance

      // Send global TopicLoad event, so all other Sidebar instances can get it
      browser.runtime.sendMessage({
        action: 'TopicLoaded',
        detail: {id: this.id, windowId: newWindow.id}
      });
    }
  }

  /*
   * Move Topic To Trash
   */
  async moveToTrash() {
    console.debug("Topic.moveToTrash() called for topicId=%d", this.id);

    // update Topic deleted field in DB
    let updated = await dbUpdateTopic(this.id, {deleted: Date.now(), windowId: undefined});
    if (updated === 0) {
      console.warn('moveToTrash(): failed to update topic %d!', this.id);
    }

    this.pt.refSidebar.removeTopic({id: this.id});

    // inform other instances about created Topic
    browser.runtime.sendMessage({
      action: 'TopicRemove',
      detail: {id: this.id}
    });
    // inform other instances about Window to add (replacing the topic)
    let win = await browser.windows.get(this.windowId);
    browser.runtime.sendMessage({
      action: 'WindowCreated',
      detail: {window: win}
    });

    // reload this instance for easiness sake (current window)
    await browser.tabs.reload();
  }

  // convert HTML element id to TopicId, e.g. "topic-1" -> 1
  static idToInt(elementId) {
    return parseInt(elementId.replace(/^topic-/, ''));
  }
}

/*
 * Browsing Window
 *   A browsing window contains one or more tabs. It can be converted to a Topic.
 */
class BrowsingWindow {
  // windowId
  // window open since
  // tab list
  // isOpen
  // open
  // check if window contains a Topic
  constructor(pt, window) {
    this.pt = pt;
    // id might be undefined - means its a new topic to be saved
    this.id = window.id;
    this.window = window;
    this.title = "Window";
    // li element in sidebar
    this.li = "";
    this.icon = {};

    // bind this
    this.add = this.add.bind(this);
    this.constructWindowTitle = this.constructWindowTitle.bind(this);
    this.updateWindowTitle = this.updateWindowTitle.bind(this);
  }

  //region Sidebar / Windows
  // add one window to the given list
  add(ul) {
    this.li = document.createElement('li');
    this.li.classList.add('w3-bar', 'w3-button');
    // this.id is the Window Id
    this.li.style.padding = '1px 0px';
    this.li.style.lineHeight = '20px';
    this.li.style.width = '285px';
    this.li.setAttribute("id", "window-" + this.id);

    // color-icon
    this.icon = document.createElement('img');
    this.icon.classList.add('w3-bar-item', 'w3-image', 'w3-circle', 'drag-handle');
    let favLink = createFavicon(this.title.charAt(0).toUpperCase(), '#ccc');
    if (favLink) {
      this.icon.setAttribute('src', favLink.href);
    }
    this.icon.style.filter = 'opacity(20%)';
    this.icon.style.padding = 'unset';
    this.icon.style.marginLeft = '5px';
    this.icon.style.height = '36px';

    // link
    let divWindow = document.createElement('div');
    divWindow.classList.add('w3-bar-item', 'w3-left-align');
    divWindow.style.width = '150px';
    this.updateWindowTitle();

    // if current window, then add selected css class
    if (this.id === this.pt.whoIAm.currentWindow.id) {
      this.li.classList.add('statusSelected');
    }

    //add event listener for each tab link
    this.li.addEventListener('mouseenter', () => {
      this.icon.style.filter = 'opacity(100%)';
    });
    this.li.addEventListener('mouseleave', () => {
      this.icon.style.filter = 'opacity(20%)';
    });

    // activate the window
    this.li.addEventListener('click', (e) => {
      e.preventDefault();
      browser.windows.update(this.id, {focused: true})
        .then(() => {
          let bg = browser.extension.getBackgroundPage();
          bg.openPapaTab({windowId: this.id});
        })
        .catch(err => console.error("BrowsingWindow activate failed: %s", err));
    });

    this.li.appendChild(this.icon);
    this.li.appendChild(divWindow);
    ul.appendChild(this.li);
  }

  // removes this window from specified list
  remove(ul) {
    if (this.li && ul.contains(this.li)) {
      ul.removeChild(this.li);
    }
  }

  // Build title from tabs in the window: google.de +7 , or "New Window" for window without (real) tabs
  async constructWindowTitle() {
    let title = new String('');
    let count = 0;
    let win = await browser.windows.get(this.id, {populate: true});
    for (let tab of win.tabs) {
      count++;
      if (tab.pinned === false) {
        if (title.valueOf() === '') {
          try {
            let url = new URL(tab.url);
            //title = url.hostname.replace(/^www./, '').trunc(14);
            title = punycode.toUnicode(url.hostname).replace(/^www./, '').trunc(14);
            console.debug('constructWindowTitle(): title set to "%s" (from tab=%s)', title, tab.url);
          } catch (err) {
            console.warn("BrowsingWindow.constructWindowTitle() %s", err);
            title = tab.url;
          }
        }
      }
    }
    if (count <= 1 || title.valueOf() === '') {
      this.title = getTranslationFor('newWindow');
    } else if (count < 3) {
      this.title = title;
    } else {
      this.title = title + " +" + (count - 2);
    }
  }

  updateWindowTitle() {
    console.debug("BrowsingWindow.updateWindowTitle() called for id=%d", this.id);
    this.constructWindowTitle().then(() => {
      let div = this.li.getElementsByTagName('div')[0];
      div.innerText = this.title;
      // update Sidebar Icon
      let favLink = createFavicon(this.title.charAt(0).toUpperCase(), '#ccc');
      if (favLink) {
        this.icon.setAttribute('src', favLink.href);
      }
      if (this.pt.whoIAm.currentWindow.id === this.id) {
        // update popup title (Browser Window Title) if this is the title of current window
        document.title = this.title;
        // update Main view title
        this.pt.refMain.updateTitle(this.title);
      }
    });
  }

  /*
   * Convert Browsing Window to topic
   */
  async saveAsTopic() {
    console.debug("BrowsingWindow.saveAsTopic() called for windowId=%d", this.window.id);

    let tabs = await browser.tabs.query({windowId: this.window.id});
    tabs = tabs.filter(tab => !tab.url.includes(browser.extension.getURL('')));
    let info = {
      name: this.title,
      color: getRandomColor(),
      windowId: this.window.id,
      tabs: tabs,
    };

    // generate Topic DB entry
    info.id = await dbAddTopic(this.title,);

    // update Topic Info
    await dbUpdateTopic(info.id, info);

    this.pt.refSidebar.addTopic(info);

    // inform other instances about created Topic
    browser.runtime.sendMessage({
      action: 'TopicAdd',
      detail: info
    });
    // inform other instances about removed window as it is now a Topic (identified by this.id)
    browser.runtime.sendMessage({
      action: 'WindowRemoved',
      detail: {windowId: this.id, converted: true}
    });

    // reload this instance for easiness' sake
    await browser.tabs.reload();
  }
}

/*
 * ModalAddTopic
 *   the modal for adding a new Topic
 */
class ModalAddTopic {
  constructor(pt) {
    this.pt = pt;
    // DOM Nodes
    this.nodes = {
      div: document.getElementById('modalAddTopic'),
    };

    this.divError = {};

    this.color = '#ff0000';
    this.input = '';

    this.registerEvents = this.registerEvents.bind(this);
    this.addTopic = this.addTopic.bind(this);
    this.show = this.show.bind(this);
    this.hide = this.hide.bind(this);
  }

  draw() {
    this.nodes.div.innerHTML = '';
    let divCard = document.createElement('div');
    divCard.classList.add('w3-card-4', 'w3-modal-content', 'w3-animate-top');
    divCard.style.maxWidth = '600px';

    // 'X'
    let spanClose = document.createElement('span');
    spanClose.classList.add('w3-button', 'w3-xlarge', 'w3-hover-deep-orange', 'w3-display-topright');
    spanClose.title = getTranslationFor('Close');
    spanClose.innerHTML = '&times;';
    divCard.appendChild(spanClose);

    // headline
    let divHeadline = document.createElement('div');
    divHeadline.classList.add('w3-display-bottomright', 'w3-padding', 'w3-xxlarge');
    let hHeadline = document.createElement('h5');
    hHeadline.innerText = getTranslationFor('modalCreateNewTopic');
    divHeadline.appendChild(hHeadline);
    divCard.appendChild(divHeadline);

    // form
    let form = document.createElement('form');
    form.classList.add('w3-container', 'w3-padding-16');

    // section: name
    let divName = document.createElement('div');
    divName.classList.add('w3-section');
    let labelName = document.createElement('label');
    labelName.innerText = getTranslationFor('modalTopicName');
    let inputName = document.createElement('input');
    inputName.classList.add('w3-input', 'w3-margin-bottom');
    inputName.placeholder = getTranslationFor("modalInputNamePlaceholder");
    inputName.type = 'text';
    inputName.required = true;
    inputName.autocomplete = 'off';
    inputName.autofocus = true;
    inputName.minlength = 3;
    inputName.maxLength = 32;
    divName.appendChild(labelName);
    divName.appendChild(inputName);
    form.appendChild(divName);

    // section: color
    let divColor = document.createElement('div');
    divColor.classList.add('w3-section');
    let labelColor = document.createElement('label');
    labelColor.innerText = getTranslationFor('modalTopicColor');
    let inputColor = document.createElement('input');
    inputColor.classList.add('w3-responsive');
    inputColor.type = 'color';
    inputColor.value = this.color;
    inputColor.style.width = '70px';
    divColor.appendChild(labelColor);
    divColor.appendChild(inputColor);
    form.appendChild(divColor);

    // button: create
    let butCreate = document.createElement('button');
    butCreate.classList.add('w3-button', 'w3-block', 'w3-green', 'w3-section', 'w3-padding');
    butCreate.type = 'submit';
    butCreate.accessKey = 's';
    butCreate.innerText = getTranslationFor("Create");
    form.appendChild(butCreate);

    divCard.appendChild(form);

    //
    let divCancel = document.createElement('div');
    divCancel.classList.add('w3-container', 'w3-border-top', 'w3-padding-16', 'w3-light-grey');
    // button: cancel
    let butCancel = document.createElement('button');
    butCancel.classList.add('w3-button', 'w3-deep-orange');
    butCancel.accessKey = 'c';
    butCancel.innerText = getTranslationFor('Cancel');
    divCancel.appendChild(butCancel);

    divCard.appendChild(divCancel);

    // name error (hidden by default)
    this.divError = document.createElement('div');
    this.divError.classList.add('w3-container', 'w3-red', 'w3-hide', 'w3-animate-bottom');
    this.divError.innerHTML = '<p>No Error</p>';
    form.appendChild(this.divError);

    butCancel.addEventListener('click', () => {
      this.hide();
    });
    spanClose.addEventListener('click', () => {
      this.hide();
    });
    inputName.addEventListener('input', (e) => {
      this.name = inputName.value;
    });
    inputColor.addEventListener('input', (e) => {
      this.color = inputColor.value;
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      return this.addTopic(event);
    });

    // append to pre-created div
    this.nodes.div.appendChild(divCard);
  }

  // TODO: improve topic validation https://pageclip.co/blog/2018-02-20-you-should-use-html5-form-validation.html
  addTopic(event) {
    console.debug("Modal.addTopic() triggered event=%O", event);
    let newTopic = new Topic({
      pt: this.pt,
      name: this.name,
      color: this.color,
    });
    newTopic.addToDb()
      .then(() => {
        // reset modal
        this.hide();
      })
      .catch(err => {
        this.divError.classList.remove('w3-hide');
        // topicAddFailed = Unable to store Topic. Please check the name and try again.
        let msg = getTranslationFor('topicAddFailed');
        this.divError.innerHTML = '<p>' + msg + '</p>';
        console.warn("Modal.addTopic() failed; %s", err)
      });
  }

  registerEvents() {
    this.nodes.div.addEventListener('TopicAdd', () => {
      this.draw();
      this.show();
    });
    // When the user clicks anywhere outside of the topic creation modal, close it
    this.nodes.div.onclick = (event) => {
      if (event.target === this.nodes.div) {
        this.hide();
      }
    }
  }

  show() {
    this.nodes.div.style.display = 'block';
  }

  hide() {
    this.nodes.div.style.display = 'none';
  }
}

/*
 * Tab class holding a browser.tab and further information
 */
class Tab {
  constructor(pt, tab) {
    this.pt = pt;
    this.id = tab.id;
    // browser.tab object
    this.tab = tab;
    this.li = "";
    this.spanTabTitle = {};
    this.spanTabUrl = {};
    this.imgFavIcon = {};
    this.imgTabPinned = {};
    this.imgTabAudible = {};
    this.imgTabDiscarded = {};

    this.spanPinHelp = {};

    // bind this
    this.add = this.add.bind(this);
    this.update = this.update.bind(this);
  }

  // add a tab link li element to an existing list (Main view)
  add(ul) {
    this.li = document.createElement('li');
    this.li.classList.add('w3-bar', 'hidden-info');
    // this.id is the Window Id
    this.li.setAttribute("id", "tab-" + this.id);
    this.li.style.padding = '1px 0px';
    this.li.style.lineHeight = '13px';

    // favicon image
    this.imgFavIcon = document.createElement('img');
    //try to get best favicon url path
    this.imgFavIcon.setAttribute('src', Tab.getFavIconSrc(this.tab.url, this.tab.favIconUrl));
    this.imgFavIcon.classList.add('w3-bar-item', 'w3-circle'); // 'w3-padding-small'
    this.imgFavIcon.style.height = '32px';
    this.imgFavIcon.style.padding = '4px 4px 4px 12px';
    //this.imgFavIcon.style.verticalAlign = 'middle';

    // tab div
    let divTab = document.createElement('div');
    divTab.classList.add('w3-bar-item', 'w3-button', 'w3-left-align');
    divTab.style.width = '70%';
    divTab.style.height = '32px';
    divTab.style.padding = '2px 0';
    this.spanTabTitle = document.createElement('span');
    this.spanTabTitle.classList.add('w3-medium', 'truncate');
    this.spanTabTitle.style.width = '95%';
    this.spanTabTitle.style.height = '55%';
    this.spanTabTitle.innerText = this.tab.title;
    this.spanTabUrl = document.createElement('span');
    this.spanTabUrl.classList.add('truncate');
    this.spanTabUrl.innerText = punycode.toUnicode(this.tab.url);
    this.spanTabUrl.classList.add('w3-small', 'hidden-text');
    this.spanTabUrl.style.width = '95%';
    this.spanTabUrl.style.height = '45%';
    divTab.appendChild(this.spanTabTitle);
    divTab.appendChild(document.createElement('br'));
    divTab.appendChild(this.spanTabUrl);

    let statusTipMargin = '75px';
    if (this.pt.whoIAm && typeof this.pt.whoIAm.currentTopic !== 'undefined') {
      statusTipMargin = '100px'
    }

    /* create status bar with various icons, these will be hidden by default */
    let divStatus = document.createElement('div');
    divStatus.classList.add('w3-right', 'tabStatusBar');

    this.imgTabDiscarded = document.createElement('i');
    this.imgTabDiscarded.title = 'Tab discarded status';
    this.imgTabDiscarded.classList.add('w3-large', 'w3-padding-small', 'fas', 'fa-pause-circle');
    divStatus.appendChild(this.imgTabDiscarded);

    this.imgTabAudible = document.createElement('i');
    this.imgTabAudible.title = 'Tab audible status';
    this.imgTabAudible.classList.add('w3-large', 'w3-padding-small', 'fas', 'fa-volume-up');
    divStatus.appendChild(this.imgTabAudible);

    this.imgTabPinned = document.createElement('i');
    this.imgTabPinned.id = 'tipPinTab';
    this.imgTabPinned.classList.add('w3-large', 'w3-padding-small', 'fas', 'fa-thumbtack', 'tooltip', 'my-zoom-hover');
    divStatus.appendChild(this.imgTabPinned);
    this.spanPinHelp = document.createElement('span');
    this.spanPinHelp.style.marginRight = statusTipMargin;
    this.spanPinHelp.classList.add('tooltiptext');
    divStatus.appendChild(this.spanPinHelp);

    // handle Topic tab favorites
    if (this.pt.whoIAm && typeof this.pt.whoIAm.currentTopic !== 'undefined') {
      this.imgTabFavorite = document.createElement('i');
      this.imgTabFavorite.id = 'tipFavoriteTab';
      this.imgTabFavorite.classList.add('w3-large', 'w3-padding-small', 'fas', 'fa-star', 'tooltip', 'my-zoom-hover');
      divStatus.appendChild(this.imgTabFavorite);
      this.spanFavoriteHelp = document.createElement('span');
      this.spanFavoriteHelp.style.marginRight = statusTipMargin;
      this.spanFavoriteHelp.classList.add('tooltiptext');
      divStatus.appendChild(this.spanFavoriteHelp);
      this.imgTabFavorite.style.opacity = '0.05';
      this.spanFavoriteHelp.innerText = getTranslationFor('SaveTab');
      // determine if a Tab has favorite status by query to Topic instance (URL has to perfectly match)
      if (this.isFavorite()) {
        this.imgTabFavorite.style.opacity = '0.6';
        this.spanFavoriteHelp.innerText = getTranslationFor('UnsaveTab');
      }
      // toggle favorite click
      this.imgTabFavorite.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleFavorite();
      });
    }

    // 'X' span
    this.imgTabClose = document.createElement('i');
    this.imgTabClose.id = 'tipCloseTab';
    this.imgTabClose.classList.add('w3-large', 'w3-padding-small', 'w3-hover-text-deep-orange', 'fas', 'fa-times-circle', 'tooltip', 'my-zoom-hover');
    this.imgTabClose.style.opacity = '0.6';
    divStatus.appendChild(this.imgTabClose);
    let spanCloseHelp = document.createElement('span');
    spanCloseHelp.classList.add('tooltiptext');
    spanCloseHelp.style.marginRight = statusTipMargin;
    spanCloseHelp.innerText = getTranslationFor('Close');
    divStatus.appendChild(spanCloseHelp);

    if (this.tab.pinned) {
      this.imgTabPinned.style.opacity = '0.6';
      this.li.classList.remove('can-be-dragged');
      this.imgFavIcon.classList.remove('drag-handle');
      this.spanPinHelp.innerText = getTranslationFor('Unpin');
    } else {
      this.imgTabPinned.style.opacity = '0.05';
      this.li.classList.add('can-be-dragged');
      this.imgFavIcon.classList.add('drag-handle');
      this.spanPinHelp.innerText = getTranslationFor('Pin');
    }
    if (this.tab.discarded) {
      this.imgTabDiscarded.style.opacity = '0.6';
    } else {
      this.imgTabDiscarded.style.opacity = '0.05';
    }
    if (this.tab.audible) {
      this.imgTabAudible.style.opacity = '0.6';
    } else {
      this.imgTabAudible.style.opacity = '0.05';
    }

    //add event listener for each tab link
    divTab.addEventListener("click", (e) => {
      e.preventDefault();
      this.activate();
    });

    // close tab on click
    this.imgTabClose.addEventListener('click', (e) => {
      e.preventDefault();
      this.close();
    });
    // pin tab on click
    this.imgTabPinned.addEventListener('click', (e) => {
      e.preventDefault();
      this.togglePinned();
    });

    // hide internal tabs (user should not mess with)
    if (this.tab.url.match(browser.extension.getURL(''))) {
      this.li.classList.add('w3-hide');
    }

    // todo duplicate tab detection
    /*
    if (tab.duplicate) {
      linkEl.className = 'duplicate';
    }
    */

    this.li.appendChild(this.imgFavIcon);
    this.li.appendChild(divTab);
    this.li.appendChild(divStatus);
    ul.appendChild(this.li);
  }

  remove(ul) {
    if (this.li && ul.contains(this.li)) {
      ul.removeChild(this.li);
    }
  }

  close() {
    browser.tabs.remove(this.id)
      .then(() => {
        console.debug("Tab.close() for id=%d performed", this.id);
      })
      .catch(err => {
        console.error("Tab.close() failed; %s", err);
      });
  }

  togglePinned() {
    if (this.tab.pinned) {
      browser.tabs.update(this.id, {pinned: false})
        .then(() => {
          console.debug("Tab.togglePinned() for id=%d performed (unpin)", this.id);
          this.tab.pinned = false;
        })
        .catch(err => {
          console.warn("Tab.togglePinned() failed; %s", err)
        });
    } else {
      browser.tabs.update(this.id, {pinned: true})
        .then(() => {
          console.debug("Tab.togglePinned() for id=%d performed (pin)", this.id);
          this.tab.pinned = true;
        })
        .catch(err => {
          console.warn("Tab.togglePinned() failed; %s", err)
        });
    }
  }


  move(ul, fromIndex, toIndex) {
    if (this.li && ul.contains(this.li)) {
      // remove from old index
      ul.removeChild(this.li);
      // insert at new index
      ul.insertBefore(this.li, ul.childNodes[toIndex]);
    }
  }

  // Activate (focus) the tab
  activate() {
    browser.tabs.update(this.id, {active: true});
  }

  update(ul, newTab, info) {
    console.debug("Tab.update() update tab with id=%d", this.id);
    if (newTab) {
      this.tab = newTab;
    }
    if (info && 'status' in info) {
      if (info.status === 'complete') {
        this.spanTabTitle.innerText = newTab.title;
      }
    }

    if (info && 'title' in info) {
      if (this.spanTabTitle) {
        this.spanTabTitle.innerText = info.title;
      }
    }
    else if (info && 'url' in info) {
      if (this.spanTabUrl) {
        this.spanTabUrl.innerText = punycode.toUnicode(info.url);
      }
    }
    else if (info && 'favIconUrl' in info) {
      if (this.imgFavIcon) {
        this.imgFavIcon.setAttribute('src', Tab.getFavIconSrc(this.tab.url, info.favIconUrl));
      }
    }
    else if (info && 'audible' in info) {
      if (info.audible) {
        this.imgTabAudible.style.opacity = '0.6';
      } else {
        this.imgTabAudible.style.opacity = '0.05';
      }
    }
    else if (info && 'discarded' in info) {
      if (info.discarded) {
        this.imgTabDiscarded.style.opacity = '0.6';
      } else {
        this.imgTabDiscarded.style.opacity = '0.05';
      }
    }
    else if (info && 'pinned' in info) {
      if (info.pinned) {
        this.imgTabPinned.style.opacity = '0.6';
        this.li.classList.remove('can-be-dragged');
        this.imgFavIcon.classList.remove('drag-handle');
        this.spanPinHelp.innerText = getTranslationFor('Unpin');
      } else {
        this.imgTabPinned.style.opacity = '0.05';
        this.li.classList.add('can-be-dragged');
        this.imgFavIcon.classList.add('drag-handle');
        this.spanPinHelp.innerText = getTranslationFor('Pin');
      }
    }
    else if (info && 'favorite' in info) {
      if (info.favorite) {
        this.imgTabFavorite.style.opacity = '0.6';
      } else {
        this.imgTabFavorite.style.opacity = '0.05';
      }
    }
  }

  // calls Topic.saveTabsToDb if the Tab is located in a Topic Window
  saveTabsToDb() {
    let topic = this.pt.refSidebar.getTopicForWindowId(this.tab.windowId);
    if (topic) {
      console.debug("Tab(%d).saveTabsToDb() Tab belongs to Topic %s", this.id, topic.name);
      topic.saveTabsToDb()
        .then(() => topic.updateInfo())
        .catch(err => console.error("PopupMain.addTab(): saveTabsToDb() failed; %s", err));
    }
  }

  // return Topic favorites
  getFavorites() {
    // get favorites from Topic
    let topic = this.pt.whoIAm.currentTopic;
    if (topic) {
      return typeof topic.favorites !== 'undefined' ? topic.favorites : [];
    }
    return [];
  }

  /*
 * determine if a Tab is a Favorite by comparing the URL
 *   the URL has to perfectly match
 *   @return Returns true if the given URL is stored as a favorite
 */
  isFavorite() {
    let favorites = this.getFavorites();
    if (typeof favorites !== 'undefined' && favorites.find(fav => fav.url === this.tab.url)) {
      return true;
    } else {
      return false;
    }
  }

  /*
   * Toggles favorite state for specific tab
   *   updates the Topic entry in DB
   */
  toggleFavorite() {
    let favorites = this.getFavorites();
    let isFavorite = false;
    let newFavorite = {
      createdTime: Date.now(),
      title: this.tab.title,
      url: this.tab.url,
      favSrc: this.imgFavIcon.src
    };
    // prepare 'favorites' Array to be stored in DB
    if (this.isFavorite()) {
      // Remove Favorite
      favorites = favorites.filter(fav => fav.url !== this.tab.url);
    } else {
      // Add Favorite
      favorites.push(newFavorite);
      isFavorite = true;
    }
    // update Topic DB entry
    dbUpdateTopic(this.pt.whoIAm.currentTopic.id, {favorites: favorites})
      .then(() => {
        // update the Favorite Icon
        this.update(this.pt.refMain.nodes.ulActiveTabs, undefined, {favorite: isFavorite});
        // update the currentTopic info
        this.pt.whoIAm.currentTopic.favorites = favorites;
        // update the Favorite Tabs List
        if (isFavorite) {
          // favorite has been added
          this.pt.refMain.addFavoriteTab(newFavorite);
        } else {
          // favorite has been removed (use newFavorite which is good enough, except the createdTime field)
          this.pt.refMain.removeFavoriteTab(newFavorite);
        }
      })
      .catch(err => console.error("Tab.toggleFavorite(): Failed to dbUpdateTopic(), err=%O", err));
  }

  static getFavIconSrc(url, favIconUrl) {
    //try to get best favicon url path
    if (favIconUrl) {
      return favIconUrl;
    } else {
      // return a default icon
      return browser.extension.getURL('globe.png');
    }
  }

  // convert HTML element id to TabId, e.g. "tab-12345" -> 12345
  static idToInt(elementId) {
    return parseInt(elementId.replace(/^tab-/, ''));
  }
}

/*
 * Favorite Tabs
 *   user wants to save some tabs permanently under a Topic
 *   only Title, URL, Favicon are saved
 *   DB updates are not done within FavoriteTab
 */
class FavoriteTab {
  constructor(pt, savedTab) {
    this.pt = pt;
    this.li = "";

    this.title = savedTab.title;
    this.url = savedTab.url;
    this.favSrc = savedTab.favSrc;

    this.spanTabTitle = {};
    this.spanTabUrl = {};
    this.imgFavIcon = {};

    // bind this
    this.add = this.add.bind(this);
  }

  // add a tab link li element to an existing list (Main view)
  add(ul) {
    this.li = document.createElement('li');
    this.li.classList.add('w3-bar', 'hidden-info');
    this.li.style.padding = '1px 0px';
    this.li.style.lineHeight = '13px';

    // favicon image
    this.imgFavIcon = document.createElement('img');
    //try to get best favicon url path
    this.imgFavIcon.setAttribute('src', this.favSrc);
    this.imgFavIcon.classList.add('w3-bar-item', 'w3-circle'); // 'w3-padding-small'
    this.imgFavIcon.style.height = '32px';
    this.imgFavIcon.style.padding = '4px 12px';

    // tab div
    let divTab = document.createElement('div');
    divTab.classList.add('w3-bar-item', 'w3-button', 'w3-left-align');
    divTab.style.width = '80%';
    divTab.style.padding = '2px 0';
    this.spanTabTitle = document.createElement('span');
    this.spanTabTitle.classList.add('w3-medium', 'truncate');
    this.spanTabTitle.style.width = '95%';
    this.spanTabTitle.style.height = '55%';
    this.spanTabTitle.innerText = this.title;
    this.spanTabUrl = document.createElement('span');
    this.spanTabUrl.classList.add('truncate');
    this.spanTabUrl.innerText = punycode.toUnicode(this.url);
    this.spanTabUrl.classList.add('w3-small', 'hidden-text');
    this.spanTabUrl.style.width = '95%';
    this.spanTabUrl.style.height = '45%';
    divTab.appendChild(this.spanTabTitle);
    divTab.appendChild(document.createElement('br'));
    divTab.appendChild(this.spanTabUrl);

    /* create status bar with various icons, these will be hidden by default */
    let divStatus = document.createElement('div');
    divStatus.classList.add('w3-right', 'tabStatusBar');

    // 'X' span
    this.imgTabClose = document.createElement('i');
    this.imgTabClose.id = 'tipCloseTab';
    this.imgTabClose.classList.add('w3-right', 'w3-large', 'w3-padding-small', 'w3-hover-text-deep-orange', 'fas', 'fa-times-circle', 'tooltip', 'my-zoom-hover');
    this.imgTabClose.style.opacity = '0.6';
    divStatus.appendChild(this.imgTabClose);
    let spanCloseHelp = document.createElement('span');
    spanCloseHelp.classList.add('tooltiptext');
    spanCloseHelp.style.right = '20px';
    spanCloseHelp.innerText = getTranslationFor('Remove');
    divStatus.appendChild(spanCloseHelp);

    //add event listener for each tab link
    divTab.addEventListener("click", (e) => {
      e.preventDefault();
      this.load();
    });

    // remove from favorites
    this.imgTabClose.addEventListener('click', (e) => {
      e.preventDefault();
      this.removeFromDb();
    });

    this.li.appendChild(this.imgFavIcon);
    this.li.appendChild(divTab);
    this.li.appendChild(divStatus);
    ul.appendChild(this.li);
  }

  remove(ul) {
    if (this.li && ul.contains(this.li)) {
      ul.removeChild(this.li);
    }
  }

  /*
   * remove favorite from DB
   * if any open Tab for this Favorite inform it that its not favorite anymore (but leave it open)
   */
  async removeFromDb() {
    // read topic favorites from DB
    let topic = await dbGetTopicBy('id', this.pt.whoIAm.currentTopic.id).first();
    let favorites = [];
    if (topic) {
      // prepare 'favorites' Array to be stored in DB
      if ('favorites' in topic) {
        console.debug("FavoriteTab.removeFromDb(): removing favorite with url=%s", this.url);
        favorites = topic.favorites;
        favorites = favorites.filter(fav => fav.url !== this.url);
        // update Topic DB entry
        await dbUpdateTopic(this.pt.whoIAm.currentTopic.id, {favorites: favorites});
        this.pt.whoIAm.currentTopic.favorites = favorites;
        this.pt.refMain.removeFavoriteTab(this);
        // update tab (Favorite status)
        let tabs = this.pt.refMain.tabs.filter(Tab => Tab.tab.url === this.url);
        if (tabs) {
          for (let tab of tabs) {
            tab.update(this.pt.refMain.nodes.ulActiveTabs, undefined, {favorite: false});
          }
        }
      }
    }
  }

  /* load this favorite tab into the browser or activate existing tab */
  load() {
    // find tab with this URL
    browser.tabs.query({url: this.url})
      .then((tabs) => {
        if (tabs.length === 0) {
          // create new tab
          browser.tabs.create({url: this.url, active: true});
        } else {
          browser.tabs.update(tabs[0].id, {active: true});
        }
      })
      .catch(err => console.error("SavedTab.load() error %O", err));
  }
}


(function () {
  'use strict';

  let pt = {};

  function replace_i18n(obj, tag) {
    let msg = tag.replace(/__MSG_(\w+)__/g, function (match, v1) {
      return v1 ? browser.i18n.getMessage(v1) : '';
    });
    if (msg !== tag) {
      if (msg === '') {
        obj.innerText = 'ERRTRANS';
      } else {
        obj.innerText = msg;
      }
    }
  }

  // https://stackoverflow.com/questions/25467009/internationalization-of-html-pages-for-my-google-chrome-extension
  function localizeHtmlPage() {
    // Localize using __MSG_***__ data tags
    let data = document.querySelectorAll('[data-localize]');
    for (let i in data) if (data.hasOwnProperty(i)) {
      let obj = data[i];
      let tag = obj.getAttribute('data-localize').toString();
      replace_i18n(obj, tag);
    }

    // Localize everything else by replacing all __MSG_***__ tags
    /*
    let page = document.getElementsByTagName('html');
    for (let j = 0; j < page.length; j++) {
      let obj = page[j];
      console.log("OBJ=%O", obj);
      let tag = obj.innerHTML.toString();
      replace_i18n(obj, tag);
    }
    */
  }

  //endregion

  /*
   * detectWhoAmI
   *   Detect if the current window belongs to a topic
   *   If a topic matched, updates Favicon as well
   */
  async function detectWhoIAm() {
    let ret = {};

    // first determine simply which window currently running on
    ret.currentWindow = await browser.windows.getCurrent({populate: true});
    let topic = await matchWindowToTopic(ret.currentWindow.id);
    if (topic) {
      ret.currentTopic = topic;
    }
    console.debug("detectWhoIAm(): window=%O, Topic=%O", ret.currentWindow, ret.currentTopic);
    return ret;
  }

  /* Functions end */

  document.addEventListener('DOMContentLoaded', function () {
    dbInit();
    detectWhoIAm().then(whoIAm => {
      pt.whoIAm = whoIAm;
      // initialize / render sidebar
      pt.refSidebar = new PopupSidebar(pt);
      // initialize modal for adding a topic
      pt.refModalAddTopic = new ModalAddTopic(pt);

      pt.refModalAddTopic.registerEvents();
      pt.refSidebar.registerEvents();

      // initialize the current windows main (tab) view
      pt.refMain = new PopupMain(pt);
      pt.refMain.registerEvents();

      console.debug("DOMContentLoaded handler for window with id = %d completed.", pt.whoIAm.currentWindow.id);
    }).catch(err => console.error(err));

    localizeHtmlPage();
  });

}());