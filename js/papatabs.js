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
  // created    - topic creation time
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

/* Returns all Topics as array */
function dbGetTopicsAsArray() {
  return debe.topics.orderBy('order').toArray();
}

// return Dexie Collection
function dbGetTopicBy(whereVal, equalsVal) {
  return debe.topics.where(whereVal).equals(equalsVal);
}

//endregion

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
  ctx.fillStyle = invertColor(color);

  let acronym = title.split(' ').map(function(item) {
    return item[0]
  }).join('').substr(0, 2);

  let fontSize = measureText(ctx, acronym, 'Georgia', 0, 80, 60);
  ctx.font = `bold ${fontSize}px "Georgia"`;
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
/* Favicon handling */