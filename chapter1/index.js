// Background Color Changer Function
function changecolor(el) {
    document.body.style.backgroundColor = el.value;
}

const CHANGE_ASPECT_RATIO = true;
// Main Page Elements
var bodyElement = document.getElementsByTagName("body")[0];
var statusElement = document.getElementById("status");
var progressElement = document.getElementById("progress");
var spinnerElement = document.getElementById("spinner");
var canvasElement = document.getElementById("canvas");
var outputElement = document.getElementById("output");
var outputContainerElement = document.getElementById("output-container");
var qrElement = document.getElementById("QRCode");
var qr2Element = document.getElementById("QR2Code");
var qrButton = document.getElementById("QRButton");
var qr2Button = document.getElementById("QR2Button");
var pauseMenu = document.getElementById("pauseMenuContainer");
var resumeButton = document.getElementById("resumeButton");
var quitButton = document.getElementById("quitButton");

const messageContainerElement = document.getElementById("message-container");
const messagesElement = document.getElementById("messages");
let rollbackMessages = [];

let clearRollbackMessagesTimeoutId = -1;
const showRollbackMessage = function (message) {
  let messages = "";
  rollbackMessages.push(message);
  rollbackMessages.forEach(m => messages += "<p>" + m + "</p>");

  messagesElement.innerHTML = messages;
  messageContainerElement.style.display = 'block';

  if (clearRollbackMessagesTimeoutId === -1) {
    clearTimeout(clearRollbackMessagesTimeoutId);
  }
  clearRollbackMessagesTimeoutId = setTimeout(clearRollbackMessages, 5000);
};

const clearRollbackMessages = function () {
  clearRollbackMessagesTimeoutId = -1;
  rollbackMessages = [];
  messageContainerElement.style.display = 'none';
};

// for displaying contents of console to display as a single line of text
// stopload is set to 0, as to initialize it
var loadprogress = 0;

var startingHeight, startingWidth;
var startingAspect;
var Module = {
  preRun: [],
  postRun: [],
  print: (function () {
    var element = document.getElementById("output");
    if (element) element.value = ""; // clear browser cache
    return function (text) {
      if (text === "Starting WAD") {
        loadprogress += 1;
      }
      if (loadprogress === 1) {
        Module.setStatus(text);
      } else if (loadprogress >= 2) {
        Module.setStatus("");
      }
      if (arguments.length > 1)
        text = Array.prototype.slice.call(arguments).join(" ");
      console.log(text);
      if (text === "Entering main loop.") {
        ensureAspectRatio();
        loadprogress += 1;
        // match chapter2: force 1920x1080
        canvas.width = 1920;
        canvas.height = 1080;
      }
      if (element) {
        element.value += text + "\n";
        element.scrollTop = element.scrollHeight;
      }
    };
  })(),
  printErr: function (text) {
    if (arguments.length > 1)
      text = Array.prototype.slice.call(arguments).join(" ");
    console.error(text);
  },
  canvas: (function () {
    var canvas = document.getElementById("canvas");
    return canvas;
  })(),
  setStatus: function (text) {
    if (!Module.setStatus.last)
      Module.setStatus.last = { time: Date.now(), text: "" };
    if (text === Module.setStatus.last.text) return;
    var m = text.match(/([^(]+)\((\d+(\.\d+)?)\/(\d+)\)/);
    var now = Date.now();
    if (m && now - Module.setStatus.last.time < 30) return;
    Module.setStatus.last.time = now;
    Module.setStatus.last.text = text;
    if (m) {
      text = m[1];
      progressElement.value = parseInt(m[2]) * 100;
      progressElement.max = parseInt(m[4]) * 100;
      progressElement.hidden = false;
      spinnerElement.hidden = false;
    } else {
      progressElement.value = null;
      progressElement.max = null;
      progressElement.hidden = true;
      if (!text) {
        spinnerElement.style.display = "none";
        canvasElement.style.display = "block";
      }
    }
    statusElement.innerHTML = text;
  },
  totalDependencies: 0,
  monitorRunDependencies: function (left) {
    this.totalDependencies = Math.max(this.totalDependencies, left);
    Module.setStatus(
      left
        ? "Preparing... (" + (this.totalDependencies - left) + "/" + this.totalDependencies + ")"
        : "All downloads complete."
    );
  },
};
Module.setStatus("Downloading...");
window.onerror = function (event) {
  Module.setStatus("Exception thrown, see JavaScript console");
  spinnerElement.style.display = "none";
  Module.setStatus = function (text) {
    if (text) Module.printErr("[post-exception status] " + text);
  };
};

// Route URL GET parameters to argc+argv
if (typeof window === "object") {
  Module['arguments'] = window.location.search.substr(1).trim().split('&');
  if (!Module['arguments'][0]) {
    Module['arguments'] = [];
  }
}

// Get Files helper (small manifest for chapter1)
function manifestFiles() {
  return [ "runner.data", "runner.js", "runner.wasm", "audio-worklet.js", "audio_intronoise.ogg", "game.unx" ].join(";");
}

// Merge file parts function - kept for consistency with other chapters
function mergeFiles(fileParts) {
  return new Promise((resolve, reject) => {
    let buffers = [];
    function fetchPart(index) {
      if (index >= fileParts.length) {
        let mergedBlob = new Blob(buffers);
        let mergedFileUrl = URL.createObjectURL(mergedBlob);
        resolve(mergedFileUrl);
        return;
      }
      fetch(fileParts[index]).then((response) => response.arrayBuffer()).then((data) => {
        buffers.push(data);
        fetchPart(index + 1);
      }).catch(reject);
    }
    fetchPart(0);
  });
}

function onFirstFrameRendered() {}

function onGameSetWindowSize(width,height) {
  if (startingHeight === undefined && startingWidth === undefined) {
    startingHeight = height;
    startingWidth = width;
    startingAspect = startingWidth / startingHeight;
  }
}

function ensureAspectRatio() {
  if (canvasElement === undefined) return;
  if (!CHANGE_ASPECT_RATIO) return;
  if (startingHeight === undefined && startingWidth === undefined) return;
  canvasElement.classList.add("active");
  const maxWidth = window.innerWidth;
  const maxHeight = window.innerHeight;
  var newHeight, newWidth;
  var heightQuotient = startingHeight / maxHeight;
  var widthQuotient = startingWidth / maxWidth;
  if (heightQuotient > widthQuotient) {
    newHeight = maxHeight;
    newWidth = newHeight * startingAspect;
  } else {
    newWidth = maxWidth;
    newHeight = newWidth / startingAspect;
  }
  canvasElement.style.height = newHeight + "px";
  canvasElement.style.width = newWidth + "px";
}

function pause() {
  if (!canvasElement.classList.contains("active")) return;
  GM_pause();
  pauseMenu.hidden = false;
  canvasElement.classList.add("paused");
}

function resume() {
  GM_unpause();
  pauseMenu.hidden = true;
  canvasElement.classList.remove("paused");
  canvasElement.classList.add("unpaused");
  enterFullscreenIfSupported();
  lockOrientationIfSupported();
}

function quitIfSupported() {
  if (window.oprt && window.oprt.closeTab) {
    window.oprt.closeTab();
  } else if (window.chrome && window.chrome.runtime && window.chrome.runtime.sendMessage) {
    window.chrome.runtime.sendMessage('mpojjmidmnpcpopbebmecmjdkdbgdeke', { command: 'closeTab' })
  }
}

function enterFullscreenIfSupported() {
  if (!window.oprt || !window.oprt.enterFullscreen) return;
  window.oprt.enterFullscreen();
  let viewStatus = GM_get_view_status();
  viewStatus.fullscreen = true;
  GM_set_view_status(viewStatus);
}

function lockOrientationIfSupported() {
  if (!window.oprt || !window.oprt.lockPortraitOrientation || !window.oprt.lockLandscapeOrientation) return;
  let viewStatus = GM_get_view_status();
  if (viewStatus.landscape === true && viewStatus.portrait === false) {
    window.oprt.lockPortraitOrientation();
  } else if (viewStatus.landscape === false && viewStatus.portrait === true) {
    window.oprt.lockPortraitOrientation();
  }
}

const resizeObserver = new ResizeObserver(() => {
  window.requestAnimationFrame(ensureAspectRatio);
  setTimeout(() => window.requestAnimationFrame(ensureAspectRatio), 100);
});
resizeObserver.observe(document.body);

if (/Android|iPhone|iPod/i.test(navigator.userAgent)) {
  bodyElement.className = "scrollingDisabled";
  canvasElement.classList.add("animatedSizeTransitions");
  outputContainerElement.hidden = true;
}

document.addEventListener("visibilitychange", (event) => {
  if (document.visibilityState != "visible") pause();
});

window.addEventListener("load", (event) => {
  if ((!window.oprt || !window.oprt.enterFullscreen) && (!window.chrome || !window.chrome.runtime || !window.chrome.runtime.sendMessage)) {
    quitButton.hidden = true;
  }
});

setWadLoadCallback(() => {
  enterFullscreenIfSupported();
  lockOrientationIfSupported();
});
