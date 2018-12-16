# PapaTab Browser Extension

PapaTab is a browser extension intended to improve user experience for Tab- and Browsing Topic management. It should be benefitial especially for users which like to have many Browser windows with a lot of Tabs open all the time. 
The extension is designed with simplicity and data privacy in mind. Therefore no data related to the user browsing behaviour will be transmitted to external locations. The only exception is opt-in storage to the Sycn Storage supported by various browsers, to enable synchronisation between a users browser running on several devices.

This page is mainly development related. For usage related information check the Extension Stores of the supported Browsers.

## Main Features

The following main features are implemented:
- grouping of Tabs by Topics
  - for each Topic, tagging tabs as Favorite for easier restore of closed tabs.
- storage of Topics in IndexedDB
- define Topic name and color to be easier distinguishable
- support localization (currently English and German implemented)
- simple search tabs by Title or URL in current Window or Topic
- day/night theme
- WebExtension, therefore potentially compatible with all modern Browsers

Planned next:
- recycle bin (undo topic deletion)
  - topics are already now marked as deleted, not really deleted from DB
- Data export/import (JSON)
- proper drag and drop (at least drag a tab to another topic)
- cleanup of tabs (e.g. Google tabs)
- duplicate tab detection
- support opt-in Cloud Sync (Sync Storage)

## Screenshot

![Chrome](https://i.imgur.com/flapj6D.png)

(other)
[Firefox](https://i.imgur.com/zueTQkG.png)

## Getting Started

Contributors or testers can download the Extension from Github and install manually to their Browser. Please refer to the Browser instruction how to do that.
End users should only install PapaTab via the Browsers Extension store.

### Supported Browsers

- Google Chrome (tested version >=71)
- Mozilla Firefox (tested version >= 64)

## Contributing

Please read [CONTRIBUTING.md](https://gist.github.com/PurpleBooth/b24679402957c63ec426) for details on our code of conduct, and the process for submitting pull requests to us.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/your/project/tags). 

## Authors

* **Sebastian Weitzel** - *Initial work* - [sweitzel](https://github.com/sweitzel)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Acknowledgments

* Inspiration from other Tab Managers ([Workona](https://workona.com/) and [Spaces](https://github.com/deanoemcke/spaces/))
* IndexDB wrapper [Dexie.js](https://dexie.org/)
* Chrome/Mozilla Browser APIs
* [W3Schools.CSS](https://www.w3schools.com/w3css/default.asp)
