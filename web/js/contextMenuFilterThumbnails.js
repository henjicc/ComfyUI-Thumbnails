import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { generateId, injectCss, injectJs, wait, show_message } from "../../ComfyUI-Thumbnails/js/shared_utils.js";  // oddly, we should not add /web in the path
import "../../ComfyUI-Thumbnails/js/contextmenu.js";   // oddly, we should not add /web in the path
var imagesExt = ['apng', 'png', 'avif', 'gif', 'jpg', 'jpeg', 'j2k', 'j2p', 'jxl', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif']
var enableNamesDefault = false;
var enableThumbnailsDefault = true;
var thumbnailSizeDefault = 100;

var debug = false
var log = false
// var debug = true
// var log = true

// 缓存相关变量
var thumbnailCache = {};
var thumbnailCacheEnabled = true;
var thumbnailCacheExpiry = 3600000; // 缓存有效期，默认1小时（毫秒）

// 缓存管理函数
function getThumbnailFromCache(imagePath) {
  if (!thumbnailCacheEnabled) return null;
  
  const cachedItem = thumbnailCache[imagePath];
  if (!cachedItem) return null;
  
  // 检查缓存是否过期
  if (Date.now() - cachedItem.timestamp > thumbnailCacheExpiry) {
    delete thumbnailCache[imagePath];
    return null;
  }
  
  return cachedItem.data;
}

function saveThumbnailToCache(imagePath, url) {
  if (!thumbnailCacheEnabled) return;
  
  thumbnailCache[imagePath] = {
    data: url,
    timestamp: Date.now()
  };
  
  // 如果缓存太大，清理最旧的项目
  const maxCacheItems = 500;
  const cacheKeys = Object.keys(thumbnailCache);
  if (cacheKeys.length > maxCacheItems) {
    // 按时间戳排序
    cacheKeys.sort((a, b) => thumbnailCache[a].timestamp - thumbnailCache[b].timestamp);
    // 删除最旧的20%
    const itemsToRemove = Math.floor(cacheKeys.length * 0.2);
    for (let i = 0; i <itemsToRemove; i++) {
      delete thumbnailCache[cacheKeys[i]];
    }
  }
  
  // 将缓存保存到localStorage
  try {
    localStorage.setItem('thumbnails.CacheTimestamp', Date.now().toString());
    // 不保存整个缓存，因为可能会超出localStorage限制
  } catch (e) {
    console.warn('Failed to save thumbnail cache timestamp:', e);
  }
}

// 清除过期缓存
function cleanExpiredCache() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const key in thumbnailCache) {
    if (now - thumbnailCache[key].timestamp > thumbnailCacheExpiry) {
      delete thumbnailCache[key];
      cleaned++;
    }
  }
  
  if (debug && cleaned > 0) console.debug(`Cleaned ${cleaned} expired thumbnail cache items`);
}

// 初始化时清理过期缓存
cleanExpiredCache();

// we don't need that at all
// /ComfyUIThumbnails is defined in __init__.py as pointing to assets/
// loadScript('/ComfyUIThumbnails/js/imagesloaded.pkgd.min.js').catch((e) => {
  // console.log(e)
// })

function getDictFromStorage(dictName){
  let dictJson = localStorage.getItem(dictName);
  let dict = (dictJson === null) ? {} : JSON.parse(dictJson);
  return dict;
}

function pushDictToStorage(dictName, dict){
  localStorage.setItem(dictName, JSON.stringify(dict));
}

function getListFromStorage(listName){
  let listJson = localStorage.getItem(listName);
  let list = (listJson === null) ? [] : JSON.parse(listJson);
  return list;
}

function pushItemToStorage(listName, item){
  var list = getListFromStorage(listName);
  list.push(item)
  localStorage.setItem(listName, JSON.stringify(list));
}

async function deleteNode(filename, thisRoot) {
  let childToDelete = thisRoot.querySelectorAll(`[data-value="${filename}"]`)[0]
  // let childToDelete = event.target.parentNode.parentNode.querySelectorAll(`[data-value="${filename}"]`)[0]
  // console.log('btnDelete childToDelete',childToDelete);
  // this works but somehow it's reset later on. I haven't found what controls the content of values in LiteGraph.ContextMenu = function (values, options)
  thisRoot.removeChild(childToDelete) && pushItemToStorage('thumbnails.DeletedImages', filename);
}

// apis are defined in ComfyUI\custom_nodes\ComfyUI-Manager\glob\manager_server.py
// apis are defined in ComfyUI\custom_nodes\ComfyUI-Thumbnails\ComfyUIThumbnails.py
// Adds filtering to combo context menus
async function deleteImage(filenameUri, thisRoot) {
  if (log) console.log('deleteImage filename', filenameUri)   // badgers%20-%20Copy.png
  if (log) console.log('deleteImage thisRoot', thisRoot)      // <div class="litegraph litecontextmenu litemenubar-panel dark" ..
  
  // let prev_text = update_all_button.innerText;
  // update_all_button.innerText = "Updating all...(ComfyUI)";
  // update_all_button.disabled = true;
  // update_all_button.style.backgroundColor = "gray";

  try {
    const response = await api.fetchApi(`/customnode/deleteImage?value=${filenameUri}`);
    const response_json = await response.json();
    if (debug) console.debug('response', response);               // Response { type: "basic", url: "http://127.0.0.1:8188/api/customnode/deleteImage?value=badgers%20-%20Copy.png", redirected: false, status: 201, ok: true, statusText: "Created", headers: Headers(8), body: ReadableStream, bodyUsed: true }
    if (debug) console.debug('response.json()', response_json);   // Object { found: "E:\\GPT\\ComfyUI\\input\\badgers - Copy.png", filename: "badgers - Copy.png", status: "success" }

    if (response.status == 403) {
      show_message(`Error deleting image ${filenameUri}: OS refused`);
      return false;
    }

    if (response.status == 400) {
      show_message(`Error deleting image ${filenameUri}: not found`);
      return false;
    }

    if(response.status == 200 || response.status == 201) {
      if (debug) console.debug('response_json',response_json);    // {found: 'E:\\GPT\\ComfyUI\\input\\file-01 - Copy (3).jpg', filename: 'file-01 - Copy (3).jpg', status: 'success'}
      // if (debug) console.debug('deleteImage event', event);    // this is now undefined, as 'event' is deprecated.ts(6385)
      let filenameDecoded = decodeURIComponent(filenameUri);
      // let nodeList = thisRoot.querySelectorAll(".litemenu-entry")
      deleteNode(filenameDecoded, thisRoot)
      
      // let failed_list = "";
      // if(response_json.failed.length > 0) {
        // failed_list = "<BR>FAILED: "+response_json.failed.join(", ");
      // }

      // let updated_list = "";
      // if(response_json.updated.length > 0) {
        // updated_list = "<BR>UPDATED: "+response_json.updated.join(", ");
      // }

      // show_message(
        // "Image deleted: ${filenameUri}"
        // +failed_list
        // +updated_list
        // );

      // const rebootButton = document.getElementById('cm-reboot-button5');
      // rebootButton.addEventListener("click",
        // function() {
          // if(rebootAPI()) {
            // manager_dialog.close();
          // }
        // });
    }
    else {
      show_message(`Error deleting image ${response_json.filename}: status = ${response_json.status}`);
    }

    return true;
  }
  catch (exception) {
    show_message(`Failed to delete image ${filenameUri} / ${exception}`);
    return false;
  }
  // finally {
    // if (debug) console.debug('finally')
    // remove image from the list
    
    // update_all_button.disabled = false;
    // update_all_button.innerText = prev_text;
    // update_all_button.style.backgroundColor = "";
  // }
}

function urlExists(url) {
  var http = new XMLHttpRequest();
  http.open('HEAD', url, false);
  http.send();
  return http.status!=404;
}

async function checkLink(url) { return (await fetch(url)).ok }


//  █████  ██████  ██████  ██ ███    ███  ██████  
// ██   ██ ██   ██ ██   ██ ██ ████  ████ ██       
// ███████ ██   ██ ██   ██ ██ ██ ████ ██ ██   ███ 
// ██   ██ ██   ██ ██   ██ ██ ██  ██  ██ ██    ██ 
// ██   ██ ██████  ██████  ██ ██      ██  ██████  

// addImg() builds the masonery of images by pulling them from the /view api defined in ComfyUI\server.py
// folders     = [{name:name1, files:[filename1, ..]}, ..]
// foldersDict = {{name1: [filename1, ..], ..}
// 1.25: foldersDict = getListFromStorage('thumbnails.Folders') = [{ "name": "name1", "files": ["file11.png", "file12.png"]}, { "name": "name2", "files": ["file21.png", "file22.png"]}]
// BUG: second time you click on load image, foldersDict is empty -> all folders are therefore removed due to invalid extension
// BUG: subfolder argument doesn't work anymore after switch to TS
// var addImg = async function(div, thisRoot, foldersDict){
// var addImg = async function(div, thisRoot,ctxMenu, values, options, thiss){
var addImg = async function(div, thisRoot, ctxMenu, options){
  // 获取图像信息
  const filenameUri = div.getAttribute('data-value');
  if (!filenameUri) return div;
  
  // 获取缩略图尺寸设置
  const thumbnailSize = app.ui.settings.getSettingValue("Thumbnails.ContextMenuOptions.thumbnailSize") || thumbnailSizeDefault;
  const maxHeight = thumbnailSize;
  
  // 获取是否显示文件名设置
  const enableNames = app.ui.settings.getSettingValue("Thumbnails.ContextMenuOptions.enableNames");
  
  // 设置标题和样式
  const title = `${filenameUri}`;
  div.setAttribute('title', title);
  div.classList.add('masonry-item');
  
  // 检查是否是文件夹
  let foldersDict = getDictFromStorage('thumbnails.Folders');
  const isFolder = (foldersDict[filenameUri] || filenameUri == '..') ? true : false;
  
  // 设置文本显示
  if (!enableNames) { 
    div.classList.add('hideText'); 
  } else { 
    div.classList.add('showText'); 
  }
  
  // 构建图像URL
  let src;
  
  if (isFolder) {
    // 文件夹使用特殊图标
    src = 'LoadImageThumbnails/folder.png';
    div.classList.add("folder");
    div.dataset.size = filenameUri;
    div.dataset.files = foldersDict[filenameUri];
    
    // 处理文件夹点击事件
    let divClone = div.cloneNode(true);
    div.replaceWith(divClone);
    div = divClone;
    div.onclick = () => {
      if (debug) console.debug('addImg: click filename=', filenameUri);
      if (filenameUri == '..') {
        div.parentElement.remove();
        return;
      }
      options.folder = filenameUri;

      if (foldersDict[filenameUri] && foldersDict[filenameUri].length > 0 && !foldersDict[filenameUri][0].startsWith(filenameUri)) {
        // 修改图像路径以便于加载
        foldersDict[filenameUri] = foldersDict[filenameUri].map(file => { return `${filenameUri}/${file}` });
      }

      // 添加返回上级目录选项
      if (foldersDict[filenameUri] && foldersDict[filenameUri][0] !== '..') {
        foldersDict[filenameUri].unshift('..');
      }
      
      let ctx = ctxMenu.call(this, foldersDict[filenameUri], options);
      let thisRoot = ctx.root;
      let items = Array.from(thisRoot.querySelectorAll(".litemenu-entry"));
      let displayedItems = [...items];
      displayedItems = [...items.map(function(el) { return addImg(el, thisRoot, ctxMenu, options) })];
    };
  } else {
    // 普通图像
    src = `/view?filename=${encodeURIComponent(filenameUri)}&type=input&subfolder=&format=jpeg&quality=50&width=${thumbnailSize}&height=${thumbnailSize}`;
  }
  
  // 使用原始的HTML插入方式，确保与原代码兼容
  div.insertAdjacentHTML('afterBegin', `<img decoding="async" loading="lazy" width="400" height="400" style="max-height:${maxHeight}px" class="masonry-content" src="${src}" alt="${filenameUri}" title="${title}">`);
  
  // 获取刚插入的图像元素
  const imgElement = div.querySelector('img');
  
  // 添加图像加载完成事件，用于缓存
  if (imgElement && thumbnailCacheEnabled && !isFolder) {
    imgElement.onload = function() {
      try {
        // 记录图像尺寸
        div.dataset.size = `${imgElement.naturalWidth}x${imgElement.naturalHeight}`;
        
        // 缓存图像URL而不是转换为dataURL
        saveThumbnailToCache(filenameUri, src);
      } catch (e) {
        console.warn('Failed to process thumbnail:', e);
      }
    };
  }
  
  // 添加删除按钮（仅对非文件夹项目）
  if (!isFolder) {
    let btnDelete = document.createElement("button");
    btnDelete.appendChild(document.createTextNode("❌"));
    btnDelete.classList.add("btn");
    btnDelete.classList.add("btn-secondary");
    btnDelete.classList.add("btn-delete");
    btnDelete.dataset.filename = filenameUri;
    div.appendChild(btnDelete);
    
    btnDelete.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      deleteImage(event.target.dataset.filename, thisRoot);
    });
  }
  
  return div;
}

function addDeleteButton(div, thisRoot) {
  // 创建删除按钮
  let btnDelete = document.createElement('button');
  btnDelete.innerHTML = '✖';
  btnDelete.classList.add('btn-delete');
  btnDelete.title = 'Delete';
  
  // 添加点击事件
  btnDelete.onclick = async function(event) {
    event.stopPropagation();
    const filename = div.getAttribute('data-value');
    if (confirm(`确定要删除 ${filename} 吗？`)) {
      await deleteImage(filename, thisRoot);
    }
  };
  
  div.appendChild(btnDelete);
}

//  █████  ██████  ██████  ██ ███    ███  ██████  
// ██   ██ ██   ██ ██   ██ ██ ████  ████ ██       
// ███████ ██   ██ ██   ██ ██ ██ ████ ██ ██   ███ 
// ██   ██ ██   ██ ██   ██ ██ ██  ██  ██ ██    ██ 
// ██   ██ ██████  ██████  ██ ██      ██  ██████  

// we should override the core extensions/core/contextMenuFilter.js but I don't know how. Can't use the same name.
// main problem to get subfolder images from input, is that ComfyUI\nodes.py class LoadImage does not load subfolders
// Therefore, we simply superseed the python class LoadImage!
const ext = {
  // name: "Comfy.ContextMenuFilter",
  name: "Thumbnails.ContextMenuFilterThumbnails",
  // name: "Comfy.ContextMenuFilterThumbnails",
  init(event) {
    if (debug) console.debug('Extension: init event ----------------', event);  // Object { vueAppReady: true, ui: {…}, logging: {…}, extensions: (201) […], extensionManager: Proxy, _nodeOutputs: {}, nodePreviewImages: {}, graph: {…}, ..
    // if (debug) console.debug('event.target.id: ',event.target.id);  // no target == is this a reak event?
    // reset storage of deleted images
    localStorage.setItem('thumbnails.DeletedImages', JSON.stringify([]));
    
    // Store the original context menu function to preserve right-click functionality
    if (!window.originalLiteGraphContextMenu) {
      window.originalLiteGraphContextMenu = LiteGraph.ContextMenu;
    }
    
    // Create a wrapper for the original context menu function
    const ctxMenu = function(values, options) {
      return window.originalLiteGraphContextMenu.call(this, values, options);
    };
    
    // Copy all properties from the original function to our wrapper
    for (const prop in window.originalLiteGraphContextMenu) {
      if (Object.prototype.hasOwnProperty.call(window.originalLiteGraphContextMenu, prop)) {
        ctxMenu[prop] = window.originalLiteGraphContextMenu[prop];
      }
    }
    
    // Properly set up the prototype chain
    Object.setPrototypeOf(ctxMenu, Object.getPrototypeOf(window.originalLiteGraphContextMenu));
    
    if (debug) console.debug('Extension: ctxMenu ----------------', ctxMenu);

    // we should  find what is passing values to this function and alter the list there
    // values:  array of all the filenames as string in input folder for LoadImage, or custom values for other nodes (that we shall not process)
    // options: style stuff added to thisRoot
    LiteGraph.ContextMenu = function (values, options) {
      try {
        // Special case for handling empty or invalid values
        if (!values || !Array.isArray(values) || values.length === 0) {
          return ctxMenu.call(this, values, options);
        }
        
        // Handle cases where options or event might be undefined or not properly structured
        if (!options || !options.event) {
          return ctxMenu.call(this, values, options);
        }
        
        // First check: is this a LoadImage node based on the values content?
        // This is more reliable than checking the node type
        let isLoadImageValues = false;
        
        // Check if values contains image files or folder objects
        for (let i = 0; i < values.length && !isLoadImageValues; i++) {
          const item = values[i];
          // Check if it's an image file
          if (typeof item === 'string') {
            const ext = (item.split('.').pop() || '').toLowerCase();
            if (imagesExt.includes(ext)) {
              isLoadImageValues = true;
              break;
            }
          }
          // Check if it's a folder object
          else if (item && typeof item === 'object' && item.name && item.files) {
            isLoadImageValues = true;
            break;
          }
        }
        
        // If not LoadImage values, use original context menu
        if (!isLoadImageValues) {
          return ctxMenu.call(this, values, options);
        }
        
        // For LoadImage values, proceed with our custom handling
        // No need to check node type anymore as we've already confirmed this is for LoadImage
        let enableThumbnails = app.ui.settings.getSettingValue("Thumbnails.ContextMenuOptions.enableThumbnails");
        enableThumbnails = (enableThumbnails == undefined) ? enableThumbnailsDefault : enableThumbnails;
        
        // cleanup values from folder objects if any, keep only names
        if (debug) console.debug('Extension: options', options)
        if (debug) console.debug('Extension: values before', values)  // [{"folder1":[file1,..]}, "file1.png", ..]
        if (debug) console.debug('Extension: values?.length before', values?.length)
        
        let foldersDict = getDictFromStorage('thumbnails.Folders')   // second pass and we cannot rebuild this as folder objects are removed from values
        let forDeletion = []
        // let folder = {}
        values.forEach((item, i) => {
          if (typeof item == 'object' && item !== null) {

            // build foldersDict that we will use later to rebuild ctx with new values; do not re-add same folder twice.
            if (!foldersDict[item.name]) foldersDict[item.name] = item?.files
            
            // just replace folder object with just its name // 1.24: doing that, second click will show no folders
            values[i] = item['name']

            // and mark it for deletion if not enableThumbnails
            if (!enableThumbnails) forDeletion.push(item['name'])
          }
        });
        pushDictToStorage('thumbnails.Folders', foldersDict);

        if (!enableThumbnails) values = values.filter(item => !forDeletion.includes(item))
        if (log) console.debug('Extension: forDeletion', forDeletion) // ["file1.png",  ..]
        if (log) console.debug('Extension: values after', values)     // ["folder1", "file1.png", ..]

        if (log) console.log('Extension: foldersDict', foldersDict) // {"misc": ["qr-error_corrected-example (1).png", ..], ..}
        
        // values is a list of all the files in input folder // or maybe the issue is that we should delete the original Comfy.ContextMenuFilter?
        // if (debug) console.debug('Extension: this', this)  // this is {} after upgrade to TS
        let ctx = ctxMenu.call(this, values, options);
        if (debug) console.debug('Extension: ctx', ctx)
        if (!enableThumbnails) return ctx;
        if (debug) console.debug('Extension: values?.length after', values?.length)
        
        //    "1536 x 640   (landscape)"
        //    "1344 x 768   (landscape)"
        // if (debug) console.debug('Extension: options',options)         // {"scale": 1, "event": {"isTrusted": true, "deltaX": 0, "deltaY": 0, "canvasX": 12.2, "canvasY": 8.8}, "className": "dark", "scroll_speed": -0.1}

        // current_node has:
        // title                            = Load Image / SDXL Empty Latent Image (rgthree) / ..
        // type                             = LoadImage  / SDXL Empty Latent Image (rgthree) / ..
        // properties['Node name for S&R']  = LoadImage  / SDXL Empty Latent Image (rgthree) / ..


        // create ctx creates thisRoot, the input filter, and the div list
        // ctx = ctxMenu.call(this, ['misc', 'badgers.png','badgers.png','badgers.png','badgers.png','badgers.png','badgers.png'], options);


        // If we are a dark menu (only used for combo boxes) then add a filter input, only for > 10 values
        // the filter is added by the original Comfy.ContextMenuFilter extension that we cannot de-register, haven't found a way yet
        // at least we can override it for less than 10 images
        if (options?.className === "dark" && values?.length > 1) {
          if (debug) console.debug('Extension: options?.className',options?.className)
          // we are not replacing the menu filter, otherwise when images are filtered, the original filter listener would take over
          let filter = document.getElementsByClassName("comfy-context-menu-filter")[0];

          // originalFilter.parentNode.removeChild(originalFilter);
          // let filter = document.createElement("input");
          // filter.classList.add("comfy-context-menu-filter");
          filter.placeholder = "Filter images";
          // this.root.prepend(filter);

          // let thisRoot = this.root                 // 'this' is undefined after October 2024 upgrade to TS
          let thisRoot = ctx.root
          if (debug) console.debug('Extension: thisRoot before', thisRoot)  // undefined after October 2024 upgrade to TS
          if (debug) console.debug('Extension: getListFromStorage', getListFromStorage('thumbnails.DeletedImages'))   // empty until you delete smth
          // we need to find what controls the content of values in LiteGraph.ContextMenu = function (values, options) and the buildup of ".litemenu-entry"
          for (var deletedImage of getListFromStorage('thumbnails.DeletedImages')) {
            let childToDelete = thisRoot.querySelectorAll(`[data-value="${decodeURIComponent(deletedImage)}"]`)[0]
            if (debug) console.debug('Extension: deletedImage', deletedImage, 'childToDelete', childToDelete)
            if (childToDelete) thisRoot.removeChild(childToDelete)
          }
          if (debug) console.debug('Extension: thisRoot after', thisRoot)  // undefined after October 2024 upgrade to TS

          let items = Array.from(thisRoot.querySelectorAll(".litemenu-entry"));
          // subfolders values are objects, but in the generated div items innerHTML/innerText, it's actually "[object Object]"
          if (log) console.debug('Extension: items', items)
          // Array(18) [ div.litemenu-entry.submenu, .. ]
          //    <div class="litemenu-entry submenu masonry-item" role="menuitem" data-value="[object Object]">
          //    <div class="litemenu-entry submenu masonry-item hideText" role="menuitem" data-value="badgers - Copy.png" data-size="1024x1024">
          //    ...
          let displayedItems = [...items];

          //  █████  ██████  ██████      ██ ███    ███  ██████      ███    ██  ██████  ██     ██ 
          // ██   ██ ██   ██ ██   ██     ██ ████  ████ ██           ████   ██ ██    ██ ██     ██ 
          // ███████ ██   ██ ██   ██     ██ ██ ████ ██ ██   ███     ██ ██  ██ ██    ██ ██  █  ██ 
          // ██   ██ ██   ██ ██   ██     ██ ██  ██  ██ ██    ██     ██  ██ ██ ██    ██ ██ ███ ██ 
          // ██   ██ ██████  ██████      ██ ██      ██  ██████      ██   ████  ██████   ███ ███  

          // we only care about LoadImage types, that actually load images from input folder
          if (enableThumbnails === true) {
            // let displayedItems = [...items.map(addImg)]; // we need to pass thisRoot as well
            // displayedItems = [...items.map(function(el) { return addImg(el, thisRoot, folders) })]; // we pass thisRoot to addImg so the btnDelete event can delete the item
            // displayedItems = [...items.map(function(el) { return addImg(el, thisRoot, foldersDict) })]; // we pass thisRoot to addImg so the btnDelete event can delete the item
            displayedItems = [...items.map(function(el) { return addImg(el, thisRoot, ctxMenu, options) })]; // foldersDict is now getListFromStorage('thumbnails.Folders')
/*
filtering and removing elements here does not help. We need to alter values directly, before ctx is instanced

        } else {
          // remove folder objects if any
          // displayedItems = items.filter(el => el.innerText !== '[object Object]' ); // removing entried from the filter is insufficient, we need to delete the div too
          items = items.filter(el => { if (el.innerText !== '[object Object]') {return el} else {el.remove()} });
          displayedItems = [...items];
*/
        }
        if (log) console.log('Extension: displayedItems', displayedItems)
        
        let itemCount = displayedItems.length;
        if (debug) console.debug(`Extension: itemCount: ${itemCount}`)

        let divFolders = document.getElementsByClassName("folder");
        Array.from(divFolders).forEach(function(element) {
          element.addEventListener('click', (event) => {
            
          });
        });
    
        // We must request an animation frame for the current node of the active canvas to update.
        requestAnimationFrame(() => {
          const currentNode = LGraphCanvas.active_canvas.current_node;
          const clickedComboValue = currentNode.widgets
            ?.filter(w => w.type === "combo" && w.options.values.length === values.length)
            .find(w => w.options.values.every((v, i) => v === values[i]))
            ?.value;

          let selectedIndex = clickedComboValue ? values.findIndex(v => v === clickedComboValue) : 0;
          if (selectedIndex < 0) {
            selectedIndex = 0;
          } 
          let selectedItem = displayedItems[selectedIndex];
          updateSelected();

          // Apply highlighting to the selected item
          async function updateSelected() {
            // styles are now undefined for some reason, added more "?"
            selectedItem?.style?.setProperty("background-color", "");
            selectedItem?.style?.setProperty("color", "");
            selectedItem = displayedItems[selectedIndex];
            selectedItem?.style?.setProperty("background-color", "#ccc", "important");
            selectedItem?.style?.setProperty("color", "#000", "important");
          }

          const positionList = () => {
            // const rect = this.root.getBoundingClientRect();
            // const rect = ctx.root.getBoundingClientRect();
            const rect = thisRoot.getBoundingClientRect();

            // If the top is off-screen then shift the element with scaling applied
            if (rect.top < 0) {
              // const scale = 1 - this.root.getBoundingClientRect().height / this.root.clientHeight;
              // const scale = 1 - ctx.root.getBoundingClientRect().height / ctx.root.clientHeight;
              const scale = 1 - thisRoot.getBoundingClientRect().height / thisRoot.clientHeight;
              // const shift = (this.root.clientHeight * scale) / 2;
              // const shift = (ctx.root.clientHeight * scale) / 2;
              const shift = (thisRoot.clientHeight * scale) / 2;
              // this.root.style.top = -shift + "px";
              // ctx.root.style.top = -shift + "px";
              thisRoot.style.top = -shift + "px";
            }
          }

          // Arrow up/down to select items
          filter.addEventListener("keydown", (event) => {
            switch (event.key) {
              case "ArrowUp":
                event.preventDefault();
                selectedIndex = Math.max(0, selectedIndex - 1);
                updateSelected();
                break;
              case "ArrowDown":
                event.preventDefault();
                selectedIndex = Math.min(itemCount - 1, selectedIndex + 1);
                updateSelected();
                break;
              case "Enter":
                event.preventDefault();
                if (selectedItem) {
                  selectedItem.click();
                }
                break;
              case "Escape":
                event.preventDefault();
                thisRoot.remove();
                break;
            }
          });

          // Adjust the list position if it's off-screen
          if (options.event) {
            let left = options.event.clientX - 10;
            if (left < 0) {
              left = 0;
            }

            thisRoot.style.left = left + "px";

            let top = options.event.clientY - 10;

            const bodyRect = document.body.getBoundingClientRect();
            const rootRect = thisRoot.getBoundingClientRect();
            if (bodyRect.height && top > bodyRect.height - rootRect.height - 10) {
              top = Math.max(0, bodyRect.height - rootRect.height - 10);
            }

            thisRoot.style.top = top + "px";
            positionList();
          }
        });

        requestAnimationFrame((event) => {
          // Focus the filter box when opening
          filter.focus();

          positionList();
        });
      } // dark
        
      // console.log('return ctx')
      return ctx;
    } catch (error) {
      console.error("Error in LoadImageThumbnails context menu:", error);
      return ctxMenu.call(this, values, options);
    }
  };
  
  // Ensure we don't lose prototype methods
  Object.setPrototypeOf(LiteGraph.ContextMenu, Object.getPrototypeOf(ctxMenu));
  
  // Copy all properties from our wrapper to the new function
  for (const prop in ctxMenu) {
    if (Object.prototype.hasOwnProperty.call(ctxMenu, prop)) {
      LiteGraph.ContextMenu[prop] = ctxMenu[prop];
    }
  }
  },
}

const cssPromise = injectCss("extensions/ComfyUI-Thumbnails/css/contextMenuFilterThumbnails.css");  // for some reason we cannot use the actual path /web/css

// Restore original context menu when extension is unloaded
app.cleanupExtension = function() {
  if (window.originalLiteGraphContextMenu) {
    // Fully restore the original context menu function
    LiteGraph.ContextMenu = window.originalLiteGraphContextMenu;
    
    // Clear the reference
    delete window.originalLiteGraphContextMenu;
  }
};
// const jsPromise = injectJs("https://cdnjs.cloudflare.com/ajax/libs/jquery.imagesloaded/4.1.4/imagesloaded.pkgd.min.js");
// const jsPromise = injectJs("https://cdnjs.cloudflare.com/ajax/libs/jquery.imagesloaded/5.0.0/imagesloaded.pkgd.min.js");
app.registerExtension(ext);
