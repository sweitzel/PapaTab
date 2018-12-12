/*
 * extLogic.js - Contains main logic of the Extension
 * ==================================================
 *
 * By Sebastian Weitzel, sebastian.weitzel@gmail.com
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

(function (window) {

  'use strict';

  let spacesService = {
    tabHistoryUrlMap: {},
    closedWindowIds: {},
    sessions: [],
    sessionUpdateTimers: {},
    historyQueue: [],
    eventQueueCount: 0,
    lastVersion: 0,
    debug: false,

    //initialise spaces - combine open windows with saved sessions
    initialiseSpaces: function () {

      var self = this,
        sessionId,
        match;

      console.log("initialising spaces..");

      //update version numbers
      this.lastVersion = this.fetchLastVersion();
      this.setLastVersion(chrome.runtime.getManifest().version);

      dbService.fetchAllSessions(function (sessions) {

        if (chrome.runtime.getManifest().version === "0.18" &&
          chrome.runtime.getManifest().version !== self.lastVersion) {

          console.log("resetting all session hashes..");
          self.resetAllSessionHashes(sessions);
        }

        chrome.windows.getAll({populate: true}, function (windows) {

          //populate session map from database
          self.sessions = sessions;

          //clear any previously saved windowIds
          self.sessions.forEach(function (session) {
            session.windowId = false;
          });

          //then try to match current open windows with saved sessions
          windows.forEach(function (curWindow) {

            if (!self.filterInternalWindows(curWindow)) {
              self.checkForSessionMatch(curWindow);
            }
          });
        });
      });
    },

    //local storage getters/setters
    fetchLastVersion: function () {
      var version = localStorage.getItem('spacesVersion');
      if (version !== null) {
        version = JSON.parse(version);
        return version;
      } else {
        return 0;
      }
    },

    setLastVersion: function (newVersion) {
      localStorage.setItem('spacesVersion', JSON.stringify(newVersion));
    },


    window.spacesService = spacesService;

}
  (window)
);