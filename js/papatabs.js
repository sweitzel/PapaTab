/*
 * papatabs.js - Shared Functions
 * ===================================================
 *
 * By Sebastian Weitzel, sebastian.weitzel@gmail.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

// Dexie Database accessor
// noinspection ES6ConvertVarToLetConst
var debe;

function maybePluralize(count, noun, suffix = 's') {
  return `${count} ${noun}${count !== 1 ? suffix : ''}`;
}

// i18n helper
function getTranslationFor(key, dflt) {
  let msg = browser.i18n.getMessage(key);
  if (msg === "") {
    if (dflt && dflt !== "") {
      return dflt;
    } else {
      return key;
    }
  } else {
    return msg;
  }
}

// truncate a string to given length
String.prototype.trunc = String.prototype.trunc ||
  function (n) {
    return (this.length > n) ? this.substr(0, n - 1) + "\u2026" : this;
  };

//region Database functions
function dbInit() {
  //import Dexie from 'dexie';
  debe = new Dexie('PapaTabs');
  // id:        - topic id
  // createdTime - topic creation time
  // lastAccess - last access time
  // name       - name of the topic (unique index)
  // color      - color of the topic (not indexed)
  debe.version(1).stores({
    topics: '++id,created,lastAccess,&name',
    sessions: "++id,windowId,createdTime,lastAccessTime,name"
  });
  debe.version(2).stores({
    topics: '++id,createdTime,lastAccess,&name,order,windowId',
    sessions: "++id,windowId,createdTime,lastAccessTime,name"
  });
  console.log("Database initialized.");
}

function dbDump() {
  Dexie.getDatabaseNames(function (databaseNames) {
    if (databaseNames.length === 0) {
      // No databases at this origin as we know of.
      console.log("There are no databases at current origin. Try loading another sample and then go back to this page.");
    } else {
      // At least one database to dump
      dump(databaseNames);
    }

    function dump(databaseNames) {
      if (databaseNames.length > 0) {
        let db = new Dexie(databaseNames[0]);
        // Now, open database without specifying any version. This will make the database open any existing database and read its schema automatically.
        db.open().then(function () {
          console.log("var db = new Dexie('" + db.name + "');");
          console.log("db.version(" + db.verno + ").stores({");
          db.tables.forEach(function (table, i) {
            let primKeyAndIndexes = [table.schema.primKey].concat(table.schema.indexes);
            let schemaSyntax = primKeyAndIndexes.map(function (index) {
              return index.src;
            }).join(',');
            console.log("    " + table.name + ": " + "'" + schemaSyntax + "'" + (i < db.tables.length - 1 ? "," : ""));
            // Note: We could also dump the objects here if we'd like to:
            table.each(function (object) {
              console.log(JSON.stringify(object));
            });
          });
          console.log("});\n");
        }).finally(function () {
          db.close();
          dump(databaseNames.slice(1));
        });
      } else {
        console.log("Finished dumping databases");
        console.log("==========================");
      }
    }
  });
}

function* dbListTopics() {
  return yield debe.topics.toArray();
}

function dbAddTopic(topicName, topicColor) {
  return debe.topics.add({createdTime: Date.now(), name: topicName, color: topicColor, order: 255});
}

function dbRemoveTopic(topicId) {
  return debe.topics.delete(topicId);
}

function dbUpdateTopic(topicId, changeInfo) {
  return debe.topics.update(topicId, changeInfo);
}

/* Returns all Topics as array (Promise) */
function dbGetTopicsAsArray() {
  return debe.topics.orderBy('order').toArray();
}

// return Dexie Collection
function dbGetTopicBy(whereVal, equalsVal) {
  return debe.topics.where(whereVal).equals(equalsVal);
}

//endregion

/*
 * try to match given windowId to a Topic
 *   - first try to lookup windowId in DB (windowId will be same as long Browser is not completely closed)
 *     (this is the most reliable)
 *   - else compare Tabs of open windows with the saved Topics (must be exactly matching)
 * @return returns Topic if found, else undefined
 */
async function matchWindowToTopic(windowId) {
  // try to find (not deleted) topic which matches windowId
  let topic = await dbGetTopicBy('windowId', windowId).first();
  if (topic) {
    if ('deleted' in topic) {
      console.debug("matchWindowToTopic() - ignore deleted topic %O", topic);
    } else {
      console.debug("matchWindowToTopic() - found Topic=%s (%d) via matching windowId=%d", topic.name, topic.id, windowId);
      return topic;
    }
  } else {
    // get current windows tabs
    let currentTabs = await browser.tabs.query({windowId: windowId});
    if (currentTabs) {
      // exclude extension Tabs
      currentTabs = currentTabs.filter(tab => !tab.url.includes(browser.extension.getURL('')));
      // foreach tab >> tab URL equal?
      let topics = await dbGetTopicsAsArray();
      for (topic of topics) {
        // deleted topic?
        if ('deleted' in topic) {
          continue;
        }
        // amount of tabs equal?
        if (currentTabs.length !== topic.tabs.length) {
          console.log("matchWindowToTopic(): Topic tabs=%d, current tabs=%d -> no match.", topic.tabs.length, currentTabs.length);
          continue;
        }
        let match = 0;
        for (let i=0; i<topic.tabs.length; i++) {
          let tA = topic.tabs[i];
          let tB = currentTabs[i];
          if (tA.url === tB.url) {
            console.debug("MATCH topicUrl=%s, thisUrl=%s", tA.url, tB.url);
            match++;
          } else {
            console.debug("NOMATCH topicUrl=%s, thisUrl=%s", tA.url, tB.url);
            break;
          }
        }
        if (match === topic.tabs.length) {
          // found - update windowId in DB
          let updated = await dbUpdateTopic(topic.id, {windowId: windowId});
          if (updated === 0) {
            console.warn("matchWindowToTopic(): failed to update topic windowId!");
          }
          return topic;
        }
      }
    }
  }
}

//region Favicon handling
function invertColor(hex) {
  if (hex.indexOf('#') === 0) {
    hex = hex.slice(1);
  }
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (hex.length !== 6) {
    throw new Error('Invalid HEX color.');
  }
  // invert color components
  let r = (255 - parseInt(hex.slice(0, 2), 16)).toString(16),
    g = (255 - parseInt(hex.slice(2, 4), 16)).toString(16),
    b = (255 - parseInt(hex.slice(4, 6), 16)).toString(16);
  return "#" + padZero(r) + padZero(g) + padZero(b);
}

function padZero(str, len) {
  len = len || 2;
  let zeros = new Array(len).join('0');
  return (zeros + str).slice(-len);
}

function getRandomColor() {
  let color = Math.round(Math.random() * 0x1000000).toString(16);
  return "#" + padZero(color, 6);
}

function measureText(context, text, fontface, min, max, desiredWidth) {
  if (max-min < 1) {
    return min;
  }
  let test = min+((max-min)/2); //Find half interval
  context.font=`bold ${test}px "${fontface}"`;
  let found;
  if ( context.measureText(text).width > desiredWidth) {
    found = measureText(context, text, fontface, min, test, desiredWidth)
  } else {
    found = measureText(context, text, fontface, test, max, desiredWidth)
  }
  return parseInt(found);
}

// determine good contrast color (black or white) for given BG color
function getContrastYIQ(hexcolor){
  const r = parseInt(hexcolor.substr(0,2),16);
  const g = parseInt(hexcolor.substr(2,2),16);
  const b = parseInt(hexcolor.substr(4,2),16);
  // http://www.w3.org/TR/AERT#color-contrast
  let yiq = ((r*299)+(g*587)+(b*114))/1000;
  return (yiq >= 128) ? 'black' : 'white';
}

/* generate favicon based on title and color */
function createFavicon(title, color) {
  if (typeof color !== 'string' || !color.startsWith('#')) {
    console.warn("createFavicon() skipped (invalid color): title=%s, color=%s (%s)", title, color, typeof color);
    return undefined;
  }
  let canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  let ctx = canvas.getContext('2d');
  // background color
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 63, 63);
  // text color
  ctx.fillStyle = getContrastYIQ(color);

  let acronym = title.split(' ').map(function(item) {
    return item[0]
  }).join('').substr(0, 2);

  let fontSize = measureText(ctx, acronym, 'Arial', 0, 60, 50);
  ctx.font = `bold ${fontSize}px "Arial"`;
  ctx.textAlign='center';
  ctx.textBaseline="middle";
  ctx.fillText(acronym, 32, 38);

  // prepare icon as Data URL
  let link = document.createElement('link');
  link.type = 'image/x-icon';
  link.rel = 'shortcut icon';
  link.href = canvas.toDataURL("image/x-icon");

  return link;
  //document.getElementsByTagName('head')[0].appendChild(link);
}

//endregion

function hex2rgba(hex, opacity){
  // https://stackoverflow.com/questions/21646738/convert-hex-to-rgba
  hex = hex.replace('#','');
  const r = parseInt(hex.substring(0, hex.length/3), 16);
  const g = parseInt(hex.substring(hex.length/3, 2*hex.length/3), 16);
  const b = parseInt(hex.substring(2*hex.length/3, 3*hex.length/3), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + opacity / 100 + ')';
}

// calculate relative human readable distance for given timestamp
function timeDifference(previous) {
  let current = Date.now();
  const msPerMinute = 60 * 1000;
  const msPerHour = msPerMinute * 60;
  const msPerDay = msPerHour * 24;
  const msPerWeek = msPerDay * 7;
  const msPerMonth = msPerDay * 30;
  const msPerYear = msPerDay * 365;

  const elapsed = Math.round((current - previous));

  let lang = navigator.languages ? navigator.languages[0] : navigator.language;

  // Intl.RelativeTimeForm is very new (as of 2018)
  if (typeof Intl.RelativeTimeFormat !== 'function') {
    console.warn('timeDifference(): Intl.RelativeTimeFormat not supported, returning default');
    return Math.round(elapsed / msPerMinute) + " minutes ago" ;
  }

  let rtf = new Intl.RelativeTimeFormat(lang);

  if (elapsed < msPerMinute) {
    return rtf.format(-Math.round(elapsed/1000), 'second');
  }
  else if (elapsed < msPerHour) {
    return rtf.format(-Math.round(elapsed/msPerMinute), 'minute');
  }
  else if (elapsed < msPerDay ) {
    return rtf.format(-Math.round(elapsed/msPerHour), 'hour');
  }
  else if (elapsed < msPerWeek) {
    return rtf.format(-Math.round(elapsed/msPerDay), 'day');
  }
  else if (elapsed < msPerMonth) {
    return rtf.format(-Math.round(elapsed/msPerWeek), 'week');
  }
  else if (elapsed < msPerYear) {
    return rtf.format(-Math.round(elapsed/msPerMonth), 'month');
  }
  else {
    return rtf.format(-Math.round(elapsed/msPerYear), 'year');
  }
}

/*
 * remove non-whitelisted keys from given tabs list
 */
function sanitizeTabs(tabs) {
  // only save whitelisted information to DB
  let keyWhitelist = ['active', 'index', 'pinned', 'selected', 'title', 'url'];

  tabs.forEach((obj) => {
    Object.keys(obj).forEach((key) => {
      if (keyWhitelist.indexOf(key) === -1)
        delete obj[key];
    });
  });
}

// switch/focus next browser window
// todo: switch in the order of windows as displayed on Sidebar
async function switchToWindow(nextOrLast) {
  // does any window have focus?
  let windows = await browser.windows.getAll({populate: false});
  if (windows) {
    for (let i = 0; i < windows.length; i++) {
      let nexti = i+1;
      let lasti = i-1;
      if (nexti === windows.length) {
        nexti = 0;
      }
      if (lasti < 0) {
        lasti = windows.length - 1;
      }
      if (windows[i].focused === true) {
        if (nextOrLast === 'next') {
          // switch to next window
          await browser.windows.update(windows[nexti].id, {focused: true});
        } else {
          // switch to last window
          await browser.windows.update(windows[lasti].id, {focused: true});
        }
      }
    }
  }
}

// get specified option from local storage
async function getLocalConfig(key) {
  let prop = await browser.storage.local.get([key]);
  console.debug('getLocalConfig(%s): %O', key, prop);
  return prop;
}

// store specified option (primitive type) in local storage
function setLocalConfig(key, value) {
  browser.storage.local.set({[key]: value})
    .then(() => console.debug('setLocalConfig(%s): successfully saved (%s)', key, typeof value))
    .catch(err => console.warn('setLocalConfig(%s) failed: %O', key, err));
}