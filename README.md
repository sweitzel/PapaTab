# PapaTab Browser Extension

PapaTab is a browser extension intended to improve user experience for Tab- and Browsing Topic management.
This page is mainly development related. For usage related information check the Extension Stores of the supported Browsers.

## Main Features

The following main features are implemented:
- grouping of Tabs by Topics
- storage of Topics in IndexedDB
- define Topic name and color to be easier distinguishable
- support localization (currently English and German implemented)
- simple search tabs by Title or URL in current Window or Topic
- day/night theme
- WebExtension, therefore potentially compatible with all modern Browsers

Planned next:
- recycle bin (undo topic deletion)
  - topics are already now marked as deleted, not really deleted from DB
- export/import (JSON)
- cleanup of tabs (e.g. Google tabs)
- duplicate tab detection
- use cloud sync (Sync Storage)

## Screenshot

![Chrome](https://i.imgur.com/flapj6D.png)

(other)
[Firefox](https://i.imgur.com/zueTQkG.png)

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

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
