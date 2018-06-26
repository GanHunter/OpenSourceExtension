var Provider = class Provider {
	constructor(name = '', pic = 'pictures/other.png', url = '', chosen = false) {
		this.name = name;
		this.pic = pic;
		this.url = url;
		this.chosen = chosen;
	}
	clone() {
		return new Provider(this.name, this.pic, this.url, this.chosen);
	}
};

const defaultProviders = [
	new Provider('Google', 'pictures/google.png', 'https://www.google.com/searchbyimage?image_url=%s', true),
	new Provider('TinEye', 'pictures/tineye.png', 'https://www.tineye.com/search?url=%s'),
	new Provider('Bing', 'pictures/bing.png', 'https://www.bing.com/images/searchbyimage?FORM=IRSBIQ&cbir=sbi&imgurl=%s'),
];

function getDefaultProvidersClone() {
	return defaultProviders.map(p => p.clone());
}

// This is  to set up context menu for images, will always get whole storage
function createContextMenu(storedSettings) {
	const title = chrome.i18n.getMessage('contextMenuTitle');

	const chosenProviders = storedSettings.storageProviders.filter(p => p.chosen);

	/* When there is only one search provider ticked or selected, it'll not create a submenu of other search providers*/
	if (chosenProviders.length === 1) {
		chrome.contextMenus.create({
			id: chosenProviders[0].name,
			title,
			contexts: ['image'],
		});
		return;
	}

	/* Create menu and submenu entries */
	chrome.contextMenus.create({
		id: 'Search-By-Image',
		title,
		contexts: ['image'],
	});

	for (const p of chosenProviders) {
		const contextMenuOptions = {
			parentId: 'Search-By-Image',
			id: p.name,
			title: p.name,
			contexts: ['image'],
		};
		try {
			chrome.contextMenus.create(contextMenuOptions);
		} catch (exception) {
			chrome.contextMenus.create(contextMenuOptions);
		}
	}
	chrome.contextMenus.create({ parentId: 'Search-By-Image', type: 'separator' });
	chrome.contextMenus.create({
		parentId: 'Search-By-Image',
		id: 'openAll',
		title: chrome.i18n.getMessage('contextMenuOpenAll'),
		contexts: ['image'],
	});
}

/* Default settings. If there is nothing in search provider storage, use these values provided. */
const defaultSettings = {
	openInBackground: false,
	openTabAt: 'right',
	storageProviders: getDefaultProvidersClone(),
};



function reverseSearch(info, storedSettings) {
	function getTabIndex(openTabAt, tabs) {
		const thisTab = tabs.filter(t => t.active)[0];
		if (openTabAt === 'right') {
			return thisTab.index + 1;
		} else if (openTabAt === 'left') {
			return thisTab.index;
		} else {
			return tabs.length;
		}
	}

	/* return array of url string */
	function getProviderURLs(targetProviderName) {
		if (targetProviderName === 'openAll') {
			const urls = [];
			for (const p of storedSettings.storageProviders) {
				if (p.chosen) {
					urls.push(p.url);
				}
			}
			return urls.reverse();
		} else {
			for (const p of storedSettings.storageProviders) {
				if (p.name === targetProviderName) {
					return [p.url];
				}
			}
		}
	}

	const imageURL = info.srcUrl;
	const openInBackground = storedSettings.openInBackground;
	const openTabAt = storedSettings.openTabAt;
	const searchProviders = getProviderURLs(info.menuItemId);

	function openImageSearch(tabs) {
		const tabIndex = getTabIndex(openTabAt, tabs);

		for (const p of searchProviders) {
			chrome.tabs.create({
				url: p.replace('%s', encodeURIComponent(imageURL)),
				active: !openInBackground,
				index: tabIndex,
			});
		}
	}

	chrome.tabs.query({ currentWindow: true }, openImageSearch);
}


/* On extension startup, check whether have stored settings and set up the context menu.
  If don't, then store the default settings. */
function checkStoredSettings(storedSettings) {
	if (Object.getOwnPropertyNames(storedSettings).length) {
		chrome.storage.sync.get(null, createContextMenu);
	} else {
		chrome.storage.sync.set(defaultSettings);
		createContextMenu(defaultSettings);
	}
}


/* Setup context menu */
chrome.storage.sync.get(null, checkStoredSettings);

/* On click, fetch stored settings and reverse img search. */
chrome.contextMenus.onClicked.addListener((info, tab) => {
	chrome.storage.sync.get(null, reverseSearch.bind(null, info));
});
