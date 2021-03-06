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

const MENU_ACTIONS = {
	PICK_FROM_CURRENT_TAB: {
		label: browser.i18n.getMessage("commandPickFromCurrentTab"),
		handler: pickImagesFromCurrent
	},
	PICK_FROM_RIGHT_TABS: {
		label: browser.i18n.getMessage("commandPickFromRightTabs"),
		handler: pickImagesToRight
	},
	PICK_FROM_RIGHT_TABS_EXCLUDE_CURRENT: {
		label: browser.i18n.getMessage("commandPickFromRightTabsExcludeCurrent"),
		handler: pickImagesToRightNoCurrent
	}
};

browser.runtime.onMessage.addListener((message, sender) => {
	switch (message.method) {
		case "downloadImage":
			message.tabId = sender.tab.id;
			return downloadImage(message);
		case "batchDownload":
			return batchDownload(message);
		case "closeTab":
			if (!message.tabId) {
				message.tabId = sender.tab.id;
			}
			return closeTab(message);
	}
});

browser.browserAction.onClicked.addListener(tab => {
	MENU_ACTIONS[pref.get("browserAction")].handler(tab);
});

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

pref.ready().then(() => {
	updateBrowserAction();
	pref.onChange(change => {
		if (change.browserAction) {
			updateBrowserAction();
		}
	});
	
	function updateBrowserAction() {
		browser.browserAction.setTitle({
			title: MENU_ACTIONS[pref.get("browserAction")].label
		});
	}
});

const download = function() {
	const objUrls = new Map;
	
	browser.downloads.onChanged.addListener(onChanged);
	browser.downloads.onErased.addListener(onErased);
	
	function onChanged(delta) {
		if (!objUrls.has(delta.id)) return;
		if (delta.canResume && !delta.canResume.current ||
			delta.state && delta.state.current === "complete"
		) {
			cleanUp(delta.id);
		}
	}
	
	function onErased(id) {
		if (!objUrls.has(id)) return;
		cleanUp(id);
	}
	
	function cleanUp(id) {
		const objUrl = objUrls.get(id);
		URL.revokeObjectURL(objUrl);
		objUrls.delete(id);
	}
	
	function download(url, filename, saveAs = false) {
		const options = {
			url, filename, saveAs, conflictAction: pref.get("filenameConflictAction")
		};
		return tryFetchCache().then(blob => {
			if (!blob) {
				return browser.downloads.download(options);
			}
			const objUrl = URL.createObjectURL(blob);
			options.url = objUrl;
			return browser.downloads.download(options)
				.catch(err => {
					URL.revokeObjectURL(objUrl);
					throw err;
				})
				.then(id => {
					objUrls.set(id, objUrl);
					return id;
				});
		});
		
		function tryFetchCache() {
			if (url.startsWith("data:") || pref.get("useCache")) {
				return fetchBlob(url);
			}
			return Promise.resolve();
		}
	}
	
	function wrapError(fn) {
		return (...args) => {
			return fn(...args).catch(err => {
				err.args = args;
				throw err;
			});
		};
	}
	
	return wrapError(download);
}();

const urlMap = function () {
	let map = [];
	
	pref.ready().then(() => {
		update();
		pref.onChange(change => {
			if (change.urlMap != null) {
				update();
			}
		});
	});
	
	function update() {
		const lines = pref.get("urlMap").split(/\r?\n/g).filter(line =>
			line && /\S/.test(line) && !line.startsWith("#"));
		const newMap = [];
		for (let i = 0; i < lines.length; i += 2) {
			newMap.push({
				search: new RegExp(lines[i], "ig"),
				repl: lines[i + 1]
			});
		}
		map = newMap;
	}
	
	function transform(url) {
		for (const t of map) {
			url = url.replace(t.search, t.repl);
		}
		return url;
	}
	
	return {transform};
}();

const menus = webextMenus([
	...[...Object.entries(MENU_ACTIONS)].map(([key, {label, handler}]) => ({
		title: label,
		onclick(info, tab) {
			handler(tab);
		},
		contexts: ["browser_action"],
		oncontext: () => pref.get("browserAction") !== key
	})),
	{
		type: "separator",
		contexts: ["browser_action"]
	},
	{
		type: "checkbox",
		contexts: ["browser_action"],
		title: browser.i18n.getMessage("optionEnabledLabel"),
		checked: () => pref.get("enabled"),
		onclick(info) {
			pref.set("enabled", info.checked);
		}
	},
	...[...Object.values(MENU_ACTIONS)].map(({label, handler}) => ({
		title: label,
		onclick(info, tab) {
			handler(tab, info.frameId);
		},
		contexts: ["page", "image"],
		oncontext: () => pref.get("contextMenu")
	}))
]);

// setup dynamic menus
pref.ready().then(() => {
	// update menus
	const WATCH_PROPS = ["contextMenu", "browserAction", "enabled"];
	menus.update();
	pref.onChange(change => {
		if (WATCH_PROPS.some(p => change[p] != null)) {
			menus.update();
		}
	});
});


// inject content/pick-images.js to the page
function pickImages(tabId, frameId = 0, ignoreImages = false) {
	return executeScript().then(results => {
		return Object.assign({}, results[0], {
			tabId,
			ignoreImages,
			images: [].concat(...results.map(r => r.images))
		});
	});
	
	function executeScript() {
		// frameId, allFrames can't be used together in Firefox
		// https://bugzilla.mozilla.org/show_bug.cgi?id=1454342
		const options = {
			code: `pickImages(${ignoreImages})`,
			frameId: frameId,
			allFrames: pref.get("collectFromFrames"),
			runAt: "document_start"
		};
		if (options.frameId === 0) {
			delete options.frameId;	
		} else if (!options.allFrames) {
			delete options.allFrames;
		} else {
			return browser.permissions.request({permissions: ["webNavigation"]})
				.then(success => {
					if (!success) {
						throw new Error("webNavigation permission is required for iframe information");
					}
				})
				.then(() => browser.webNavigation.getAllFrames({tabId}))
				.then(frames => {
					// build relationship
					const tree = new Map;
					for (const frame of frames) {
						if (frame.errorOccurred) {
							continue;
						}
						if (frame.parentFrameId >= 0) {
							if (!tree.has(frame.parentFrameId)) {
								tree.set(frame.parentFrameId, []);
							}
							tree.get(frame.parentFrameId).push(frame.frameId);
						}
					}
					// collect child frames
					const collected = [];
					(function collect(id) {
						collected.push(id);
						const children = tree.get(id);
						if (children) {
							children.forEach(collect);
						}
					})(frameId);
					return Promise.all(collected.map(frameId => {
						const o = Object.assign({}, options, {frameId});
						delete o.allFrames;
						return browser.tabs.executeScript(tabId, o);
					}));
				});
		}
		return browser.tabs.executeScript(tabId, options);
	}
}

function pickEnv(tabId, frameId = 0) {
	return pickImages(tabId, frameId, true);
}

function pickImagesFromCurrent(tab, frameId) {
	pickImages(tab.id, frameId)
		.then(result => {
			return openPicker({tabs: [result], isolateTabs: false}, tab.id);
		})
		.catch(notifyError);
}

function pickImagesToRight(tab, excludeCurrent = false) {
	browser.windows.get(tab.windowId, {populate: true})
		.then(({tabs}) => {
			const tabsToRight = tabs.filter(
				t => t.index > tab.index && !t.discarded && !t.pinned && !t.hidden
			);
			return Promise.all([
				excludeCurrent ? pickEnv(tab.id) : pickImages(tab.id),
				// can't pickImages from about:, moz-extension:, etc
				...tabsToRight.map(t => pickImages(t.id).catch(console.error))
			]);
		})
		.then(results => {
			results = results.filter(Boolean);
			return openPicker({
				tabs: results,
				isolateTabs: pref.get("isolateTabs")
			}, tab.id);
		})
		.catch(notifyError);
}

function pickImagesToRightNoCurrent(tab) {
	return pickImagesToRight(tab, true);
}



function notifyDownloadError(err) {
	if (err.message === "Download canceled by the user") {
		return;
	}
	if (err.args) {
		notifyError(`${String(err.message || err)}\nurl: ${err.args[0]}\nfilename: ${err.args[1]}`);
	} else {
		notifyError(String(err));
	}
}

function openPicker(req, openerTabId) {
	if (req.tabs.every(t => t.ignoreImages || !t.images.length)) {
		throw new Error("No images found");
	}
	req.method = "init";
	
	// remove global duplicated
	if (!req.isolateTabs) {
		const set = new Set;
		for (const tab of req.tabs) {
			if (!tab.ignoreImages) {
				tab.images = tab.images.filter(image => {
					if (set.has(image)) {
						return false;
					}
					set.add(image);
					return true;
				});
			}
		}
	}
	
	// remap URLs, remove tab duplicated
	for (const tab of req.tabs) {
		if (!tab.ignoreImages) {
			tab.images = [...new Set(tab.images.map(urlMap.transform))];
		}
	}
	const options = {
		url: "/picker/picker.html",
		openerTabId
	};
	return supportOpener()
		.then(supported => {
			if (!supported) {
				delete options.openerTabId;
				req.opener = openerTabId;
			}
			return loadTab(options);
		})
		.then(tabId => browser.tabs.sendMessage(tabId, req));
}

function supportOpener() {
	return getInfo()
		.then(info => {
			if (!info) {
				return false;
			}
			const name = info.name.toLowerCase();
			const version = Number(info.version.split(".")[0]);
			return (
				name === "firefox" && version >= 57 ||
				name === "chrome" && version >= 18
			);
		});
	
	function getInfo() {
		if (browser.runtime.getBrowserInfo) {
			return browser.runtime.getBrowserInfo();
		}
		return new Promise(resolve => {
			const match = navigator.userAgent.match(/(firefox|chrome)\/([\d.]+)/i);
			if (match) {
				resolve({
					name: match[1],
					version: match[2]
				});
			} else {
				resolve(null);
			}
		});
	}
}

function batchDownload({tabs, isolateTabs}) {
	const date = new Date;
	const env = Object.assign({}, tabs[0].env, {
		date,
		dateString: createDateString(date)
	});
	const renderFilename = compileStringTemplate(pref.get("filePatternBatch"));
	let i = 0;
	const pending = [];
	for (const tab of tabs) {
		if (isolateTabs) {
			Object.assign(env, tab.env);
			i = 0;
		}
		for (const url of tab.images) {
			env.url = url;
			env.index = i + 1;
			expandEnv(env);
			pending.push(download(url, renderFilename(env)));
			i++;
		}
	}
	Promise.all(pending).then(() => {
		if (pref.get("closeTabsAfterSave")) {
			tabs.filter(t => !t.ignoreImages).forEach(t => browser.tabs.remove(t.tabId));
		}
	}, notifyDownloadError);
}

function createDateString(date) {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())} ${pad(date.getMinutes())} ${pad(date.getSeconds())}`;
	function pad(n) {
		return String(n).padStart(2, "0");
	}
}

function closeTab({tabId, opener}) {
	if (opener) {
		browser.tabs.update(opener, {active: true});
	}
	browser.tabs.remove(tabId);
}

function loadTab(options) {
	const cond = condition();
	const pings = new Set;
	
	browser.runtime.onMessage.addListener(onMessage);
	return browser.tabs.create(options)
		.then(tab => cond.once(() => pings.has(tab.id)).then(() => {
			browser.runtime.onMessage.removeListener(onMessage);
			return tab.id;
		}));
		
	function onMessage(message, sender) {
		if (message.method === "ping") {
			pings.add(sender.tab.id);
			cond.check();
			return false;
		}
	}
}

function condition() {
	const pendings = new Set;
	
	function check() {
		for (const cond of pendings) {
			if (cond.success()) {
				cond.resolve();
			} else if (cond.error && cond.error()) {
				cond.reject();
			} else {
				continue;
			}
			pendings.delete(cond);
		}
	}
	
	function once(success, error) {
		return new Promise((resolve, reject) => {
			if (success()) {
				resolve();
			} else if (error && error()) {
				reject();
			} else {
				pendings.add({success, error, resolve, reject});
			}
		});
	}
	
	return {check, once};
}

function downloadImage({url, env, tabId}) {
	url = urlMap.transform(url);
	if (!env) {
		return browser.tabs.sendMessage(tabId, {method: "getEnv"})
			.then(env => downloadImage({url, env}));
	}
	env.date = new Date;
	env.dateString = createDateString(env.date);
	env.url = url;
	expandEnv(env);
	var filePattern = pref.get("filePattern"),
		filename = compileStringTemplate(filePattern)(env);
	download(url, filename, pref.get("saveAs"))
		.catch(notifyDownloadError);
}

const escapeFilename = (() => {
	const table = {
		"/": "／",
		"\\": "＼",
		"?": "？",
		"|": "｜",
		"<": "＜",
		">": "＞",
		":": "：",
		"\"": "＂",
		"*": "＊",
		"~": "～"
	};
	const rx = new RegExp(`[${Object.keys(table).join("")}]`, "g");
	const escape = m => table[m];
	
	return name => {
		name = name.trim().replace(rx, escape).replace(/\s+/g, " ");
		const maxLength = pref.get("filenameMaxLength");
		if (name.length > maxLength) {
			name = name.slice(0, maxLength).trim();
		}
		return name;
	};
})();

function escapeDots(path) {
	// trailing dots
	path = path.replace(/\.+(\/|\\|$)/g, m => m.replace(/\./g, "．"));
	// leading dots
	path = path.replace(/(^|\\|\/)\.+/g, m => m.replace(/\./g, "．"));
	return path;
}

function propGetter(prop) {
	return ctx => ctx[prop];
}

function exprGetter(expr) {
	const render = expressionEval.compile(expr);
	const defaultCtx = {String, Number, Math};
	return ctx => render(Object.assign({}, defaultCtx, ctx));
}

function compileStringTemplate(template) {
	const USE_EXPRESSION = pref.get("useExpression");
	const re = /\${(.+?)}/g;
	let match, lastIndex = 0;
	const output = [];
	while ((match = re.exec(template))) {
		if (match.index !== lastIndex) {
			output.push(template.slice(lastIndex, match.index));
		}
		if (USE_EXPRESSION) {
			output.push(exprGetter(match[1]));
		} else {
			output.push(propGetter(match[1]));
		}
		lastIndex = re.lastIndex;
	}
	if (lastIndex !== template.length) {
		const text = template.slice(lastIndex);
		output.push(text);
	}
	return context => escapeDots(
		output.map(text => {
			if (typeof text === "string") {
				return text;
			}
			return escapeFilename(String(text(context)));
		}).join("")
	);
}

function expandEnv(env) {
	// image url
	var url = new URL(env.url);
	env.hostname = url.hostname;
	
	// image filename
	var base, name, ext;
	try {
		base = url.href.match(/([^/]+)\/?$/)[1];
	} catch (err) {
		base = pref.get("defaultName");
	}
	try {
		[, name, ext] = base.match(/^(.+)(\.(?:jpg|png|gif|jpeg|svg))\b/i);
	} catch (err) {
		name = base;
		ext = pref.get("defaultExt");
	}
	env.base = nestDecodeURIComponent(base);
	env.name = nestDecodeURIComponent(name);
	env.ext = nestDecodeURIComponent(ext);
	
	// page url
	url = new URL(env.pageUrl);
	env.pageHostname = url.hostname;
}

function nestDecodeURIComponent(s) {
	while (/%[0-9a-f]{2}/i.test(s)) {
		try {
			s = decodeURIComponent(s);
		} catch (err) {
			break;
		}
	}
	return s;
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
