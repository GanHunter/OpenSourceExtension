const backgroundPage = chrome.extension.getBackgroundPage();
const Provider = backgroundPage.Provider; // class Provider
const msgTimeout = 1800;
const extensionUUID = chrome.extension.getURL('');

/** Utility Functions **/
const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);
const $el = document.createElement.bind(document);


function i18nOrdinal(n) {
	const [prefix, suffix] = chrome.i18n.getUILanguage().split('-', 2);
	return `${n}`;
}

function validateSpName(name, index) {
	if (!/^\S{2,15}$/.test(name)) {
		const msg = chrome.i18n.getMessage('providerNamePlaceholderError', i18nOrdinal(index));
		alertErrorMsg(msg);
		return false;
	}
	return true;
}

function validateSpUrl(url, index) {
	if (!/^https?:\/\/.*%s.*$/.test(url)) {
		const msg = chrome.i18n.getMessage('providerURLPlaceholderError', i18nOrdinal(index));
		alertErrorMsg(msg);
		return false;
	}
	return true;
}

function alertErrorMsg(text) {
	const msg = createErrorMsgElement(text);
	$('#alertMessages').appendChild(msg);
	setTimeout(() => {
		msg.remove();
	}, msgTimeout);
}

function createErrorMsgElement(text) {
	const div = $el('div');
	div.classList.add('alert', 'alert-danger', 'col-sm-12');
	div.setAttribute('role', 'alert');
	div.textContent = text;
	return div;
}

function createSpStatusElement() {
	
	const a = $el('a');
	a.classList.add('sp-status', 'input-group-addon');
    i = document.createElement('i');
    i.classList.add('fa', 'fa-check', 'text-success');
    i.setAttribute('aria-hidden', 'true');
    a.appendChild(i);
    i = document.createElement('i');
    i.classList.add('fa', 'fa-times', 'text-danger');
    i.setAttribute('aria-hidden', 'true');
    a.appendChild(i);
	return a;
}

function createSpRemoveElement() {
	
	const a = $el('a');
	a.classList.add('sp-remove', 'input-group-addon');
    i = document.createElement('i');
    i.classList.add('fa', 'fa-trash');
    i.setAttribute('aria-hidden', 'true');
    a.appendChild(i);
	return a;
}

function createSpUrlElement(text) {
	const input = $el('input');
	input.type = 'url';
	input.value = text;
	input.classList.add('sp-url', 'form-control');
	input.pattern = 'https?:\\/\\/.*%s.*';
	input.placeholder = chrome.i18n.getMessage('providerURLPlaceholder');
	return input;
}

function createSpNameElement(text) {
	const input = $el('input');
	input.value = text;
	input.classList.add('sp-name', 'form-control', 'col-sm-3', 'sp-edit');
	input.pattern = '\\S{2,15}';
	input.placeholder = chrome.i18n.getMessage('providerNamePlaceholder');
	input.onclick = () => {
		input.classList.add('sp-edit');
	};
	return input;
}

function createSpIconElement(src) {
	
	const span = $el('span');
	span.classList.add('sp-pic', 'input-group-addon');

	const picImg = new Image();
	picImg.src = chrome.extension.getURL(src);

	span.appendChild(picImg);

	const msgIconUploadNotImage = chrome.i18n.getMessage('msgIconUploadNotImage');
	const msgIconUploadNotSquareImage = chrome.i18n.getMessage('msgIconUploadNotSquareImage');

	/* Custom picture by click picure image */
	picImg.onclick = () => {
		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.onchange = () => {
			const file = fileInput.files[0];
			if (file.type.includes('image')) {
				const tmpImg = new Image();

				/* Input img load failed */
				tmpImg.onerror = () => {
					alertErrorMsg(msgIconUploadNotImage);
				};

				/* Input img load successfully */
				tmpImg.onload = () => {
					if (tmpImg.naturalHeight !== tmpImg.naturalWidth) {
						alertErrorMsg(msgIconUploadNotSquareImage);
						return;
					}

					const canvas = document.createElement('canvas');		
					canvas.width = 24;
					canvas.height = 24;

					const ctx = canvas.getContext('2d');
					ctx.drawImage(tmpImg, 0, 0, 24, 24);

					function picEncodeURL(ctx) {
						const pixels = ctx.getImageData(0, 0, 24, 24).data;
						for (const i in pixels) {
							if (i % 4 === 3 && pixels[i] !== 255) {
								return ctx.canvas.toDataURL();
							}
						}

						const pngBase64 = ctx.canvas.toDataURL();
						const jpegBase64 = ctx.canvas.toDataURL('image/jpeg', 0.8);
						if (pngBase64.length < jpegBase64.length) {
							return pngBase64;
						} else {
							return jpegBase64;
						}
					}

					picImg.src = picEncodeURL(ctx);
				};

				tmpImg.src = URL.createObjectURL(file);
			} else {
				alertErrorMsg(msgIconUploadNotImage);
			}
		};
		fileInput.click();
	};

	return span;
}

function createSpCheckboxElement(chosen) {
	
	const span = $el('span');
    span.classList.add('sp-selected', 'input-group-addon', 'form-check');

    label = document.createElement('label');
    label.classList.add('form-check-label', 'custom-control', 'custom-checkbox');
    span.appendChild(label);

    input = document.createElement('input');
    input.classList.add('form-check-input', 'custom-control-input');
    input.setAttribute('type', 'checkbox');
    if (chosen) {input.checked = true;} else {input.checked = false;}
    label.appendChild(input);

    spancci = document.createElement('span');
    spancci.classList.add('custom-control-indicator');
    label.appendChild(spancci);
	return span;
}

function createSearchProviderElement(name = '', pic = 'pictures/other.png', url = '', chosen = false, edit = true) {
	const root = $el('div');
	root.classList.add('searchProviderListItem', 'input-group');

	const spName = createSpNameElement(name);
	const spUrl = createSpUrlElement(url);
	const spStatus = createSpStatusElement();
	const spRemove = createSpRemoveElement();

	spStatus.onclick = () => {
		const index = Array.from(root.parentElement.children).indexOf(root) + 1;
		let valid = true;

		if (!validateSpName(spName.value, index)) {
			valid = false;
		}

		if (!validateSpUrl(spUrl.value, index)) {
			valid = false;
		}

		if (valid) {
			spName.classList.remove('sp-edit');
		}
	};

	spRemove.onclick = () => {
		root.remove();
	};

	root.appendChild(createSpCheckboxElement(chosen));
	root.appendChild(createSpIconElement(pic));
	root.appendChild(spName);
	root.appendChild(spUrl);
	root.appendChild(spStatus);
	root.appendChild(spRemove);

	if (!edit) {
		spName.classList.remove('sp-edit');
	}

	return root;
}

/** View binding **/

document.title = `${chrome.i18n.getMessage('extensionName')} | ${chrome.i18n.getMessage('optionsPageTitle')}`;

$('#navbarTitle').textContent = chrome.i18n.getMessage('extensionName');
$('#openInBackgroundLabel').textContent = chrome.i18n.getMessage('openInBackgroundLabel');

$('#openTabAtLabel').textContent = chrome.i18n.getMessage('openTabAtLabel');
$('#openTabAtRight').textContent = chrome.i18n.getMessage('openTabAtRight');
$('#openTabAtLeft').textContent = chrome.i18n.getMessage('openTabAtLeft');
$('#openTabAtEnd').textContent = chrome.i18n.getMessage('openTabAtEnd');

/* Search Provider List */
const searchProviderList = $('#searchProviderList');

$('#searchProviderLabel').textContent = chrome.i18n.getMessage('searchProviderLabel');
const addSearchProvider = $('#addSearchProvider');
addSearchProvider.textContent = chrome.i18n.getMessage('addSearchProvider');
addSearchProvider.onclick = () => {
	searchProviderList.appendChild(createSearchProviderElement());
};

/* Restore default Settings */
const restoreDefaultSearchProviders = $('#restoreDefaultSearchProviders');
restoreDefaultSearchProviders.textContent = chrome.i18n.getMessage('restoreDefaultSearchProviders');
restoreDefaultSearchProviders.onclick = () => {
	while (searchProviderList.firstElementChild) {
		searchProviderList.firstElementChild.remove();
	}
	for (const p of backgroundPage.getDefaultProvidersClone()) {
		searchProviderList.appendChild(createSearchProviderElement(p.name, p.pic, p.url, p.chosen, false));
	}
};

/* Save button */
const saveOptions = $('#saveOptions');
saveOptions.textContent = chrome.i18n.getMessage('saveOptions');
$('.alert-success').textContent = chrome.i18n.getMessage('msgSuccessSaveOptions');

saveOptions.onclick = () => {
	/* Checks whether all input valid */
	let selectedCount = 0;
	const nameSet = new Set();
	const storedSettings = {
		openInBackground: $('#openInBackground').checked,
		openTabAt: $('#openTabAt')[$('#openTabAt').selectedIndex].value,
		storageProviders: [],
	};

	for (const li of searchProviderList.children) {
		const index = Array.from(searchProviderList.children).indexOf(li) + 1;
		const chosen = li.children[0].firstElementChild.firstElementChild.checked;
		const pic = li.children[1].firstElementChild.src.replace(extensionUUID, '');
		const name = li.children[2].value;
		const url = li.children[3].value;

		if (chosen) {
			selectedCount += 1;
		}

		if (!validateSpName(name, index)) {
			return;
		}

		if (!validateSpUrl(url, index)) {
			return;
		}

		if (li.children[2].classList.contains('sp-edit')) {
			alertErrorMsg(chrome.i18n.getMessage('msgExistEditingSearchProviders'));
			return;
		}

		storedSettings.storageProviders.push(new Provider(name, pic, url, chosen));
		nameSet.add(name);
	}

	if (selectedCount < 1) {
		alertErrorMsg(chrome.i18n.getMessage('msgAtLeastOneSearchProvider'));
		return;
	}

	if (nameSet.size < storedSettings.storageProviders.length) {
		alertErrorMsg(chrome.i18n.getMessage('msgDuplicatedProviderName'));
		return;
	}

	/* When All input is valid */
	chrome.contextMenus.removeAll();
	backgroundPage.createContextMenu(storedSettings);
	chrome.storage.sync.set(storedSettings, () => {
		for (const msg of $$('.alert-danger')) {
			msg.classList.add('hidden');
		}
		$('.alert-success').classList.remove('hidden');
		setTimeout(() => {
			$('.alert-success').classList.add('hidden');
		}, msgTimeout);
	});
};

function updateUI(storedSettings) {
	const openTabAt = $('#openTabAt');
	openTabAt.selectedIndex = Array.from(openTabAt.options)
		.map(opt => opt.value)
		.indexOf(storedSettings.openTabAt);
	$('#openInBackground').checked = storedSettings.openInBackground;

	for (const p of storedSettings.storageProviders) {
		$('#searchProviderList').appendChild(createSearchProviderElement(p.name, p.pic, p.url, p.chosen, false));
	}
}

/* On opening the options page, this will fetch stored settings and update the UI with them. */
chrome.storage.sync.get(null, updateUI);
