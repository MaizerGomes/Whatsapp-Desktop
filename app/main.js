(function(scope) {
    "use strict";

    var app = require('electron').app;
    var AppMenu = require('electron').Menu;
    var MenuItem = require('electron').MenuItem;
    var AppTray = require('electron').Tray;
    var fileSystem = require('fs');
    var NativeImage = require('electron').nativeImage;
    var BrowserWindow = require('electron').BrowserWindow;
    var nodeGettext = require('node-gettext');
    var gettextParser = require("gettext-parser");
    var AutoLaunch = require("auto-launch");
    var log = require("electron-log");
    var join = require('path').join;

    const isAlreadyRunning = app.makeSingleInstance(() => {
        if (whatsApp.window) {
            if (whatsApp.window.isMinimized()) {
                whatsApp.window.restore();
            }
            whatsApp.window.show();
        }
    });

    if (isAlreadyRunning) {
        app.quit();
    }

    if (process.argv.indexOf("--debug-log") >= 0) {
        log.transports.file.level = 'debug';
        log.info("Log level set from command line switch");
    }

    log.info("Log init, file " + app.getPath('userData') + "/log.log");

    var supportedLocales = ['en_US', 'it_IT'];

    global.gt = new nodeGettext();
    for (var i in supportedLocales) {
        var loc = supportedLocales[i];
        var dir = process.resourcesPath+"/app/locale/"+loc+"/messages.po";
        if (!fileSystem.existsSync(dir)) {
          dir = "./app/locale/"+loc+"/messages.po";
        }
        log.info("Loading locale " + loc);
        gt.addTranslations(loc, 'messages', gettextParser.po.parse(fileSystem.readFileSync(dir)));
    }
    gt.setLocale("en_US");
    gt.setTextDomain("messages");
    global._ = function (t) {
        return gt.gettext(t);
    }

    // Setting default language to system language if available
    var syslang = (process.env.LC_ALL != undefined ? process.env.LC_ALL :
        (process.env.LANG != undefined ? process.env.LANG :
            (process.env.LC_MESSAGES != undefined ? process.env.LC_MESSAGES : 'en-US')));
    if (supportedLocales.indexOf(syslang.split(".")[0]) >= 0) {
        log.info("Setting locale " + syslang.split(".")[0]);
        gt.setLocale(syslang.split(".")[0]);
    } else {
        log.warn("No supported locale found, defaulting to en_US");
    }

    global.autolauncher = new AutoLaunch({ name: app.getName() });

    global.onlyOSX = function(callback) {
        if (process.platform === 'darwin') {
            return Function.bind.apply(callback, this, [].slice.call(arguments, 0));
        }
        return function() {};
    };

    global.onlyLinux = function(callback) {
        if (process.platform === 'linux') {
            return Function.bind.apply(callback, this, [].slice.call(arguments, 0));
        }
        return function() {};
    };

    global.onlyWin = function(callback) {
        if (process.platform === 'win32' || process.platform === 'win64') {
            return Function.bind.apply(callback, this, [].slice.call(arguments, 0));
        }
        return function() {};
    };


    global.config = {
        defaultSettings: {
            width: 1000,
            height: 720,
            thumbSize: 0
        },

        currentSettings: {},

        init() {
            config.loadConfiguration();
        },

        loadConfiguration() {
            log.info("Loading configuration");
            var settingsFile = app.getPath('userData') +"/settings.json";
            try {
                var data = fileSystem.readFileSync(settingsFile);
                if (data != "" && data != "{}" && data != "[]") {
                    config.currentSettings = JSON.parse(data);
                    log.info("Configuration loaded from " + settingsFile);
                } else {
                    config.currentSettings = config.defaultSettings;
                    log.warn("Configuration file empty, loading default");
                }
            } catch (e) {
                config.currentSettings = config.defaultSettings;
                log.warn("Error loading configuration from " + settingsFile + " (" + e + "), loading default");
            }
        },

        applyConfiguration() {
            log.info("Applying configuration");
            if (config.get("maximized")) {
                whatsApp.window.maximize();
            }
            whatsApp.window.webContents.on('dom-ready', function (event, two) {
                var noAvatar = '.chat-avatar{display: none}';
                var noPreview = '.chat-secondary .chat-status{z-index: -999;}';

                var thumbSize = '.image-thumb { width: '+ config.currentSettings.thumbSize + 'px  !important;' +
                'height: '+ config.currentSettings.thumbSize + 'px !important;}' +
                '.image-thumb img.image-thumb-body { width: auto !important;' +
                'height: '+ config.currentSettings.thumbSize + 'px !important;}';

                if (config.currentSettings.hideAvatars) {
                    this.insertCSS(noAvatar);
                }
                if (config.currentSettings.hidePreviews){
                    this.insertCSS(noPreview);
                }

                if (config.currentSettings.thumbSize) {
                    this.insertCSS(thumbSize);
                }
                if (config.get("customcss") != undefined) {
                    try {
                        this.insertCSS(fileSystem.readFileSync(config.get("customcss"), "utf-8"));
                        log.info("Loaded CSS file: " + config.get("customcss"));
                    } catch (e) {
                        log.error("CSS error: " + e);
                    }
                }
            });

            if (config.get("useProxy")) {
                var session = whatsApp.window.webContents.session;
                var httpProxy = config.get("httpProxy");
                var httpsProxy = config.get("httpsProxy") || httpProxy;
                if(httpProxy) {
                    log.info("Proxy configured: " + "http="+ httpProxy +";https=" + httpsProxy);
                    session.setProxy("http="+ httpProxy +";https=" + httpsProxy, function(){});
                } else {
                    log.info("No proxy");
                }
            }
            if (config.get("trayicon") != false && whatsApp.tray == undefined) {
                whatsApp.createTray();
            } else if (config.get("trayicon") == false && whatsApp.tray != undefined) {
                log.info("Destroying tray icon");
                whatsApp.tray.destroy();
                whatsApp.tray = undefined;
            }
            if (config.get("autostart") == true) {
                autolauncher.isEnabled().then(function(enabled) {
                    if (!enabled) {
                        autolauncher.enable();
                        log.info("Autostart enabled");
                    }
                });
            } else {
                autolauncher.isEnabled().then(function(enabled) {
                    if (enabled) {
                        autolauncher.disable();
                        log.info("Autostart disabled");
                    }
                });
            }
        },

        saveConfiguration() {
            log.info("Saving configuration");
            config.set("maximized", whatsApp.window.isMaximized());
            if (config.currentSettings == undefined || JSON.stringify(config.currentSettings) == "") {
                // TODO: if we land here, we need to figure why and how. And fix that
                log.error("Configuration empty! This should not happen!");
                return;
            }
            fileSystem.writeFileSync(app.getPath('userData') + "/settings.json", JSON.stringify(config.currentSettings), 'utf-8');
        },

        get (key) {
            return config.currentSettings[key];
        },

        set (key, value) {
            config.currentSettings[key] = value;
        },

        unSet (key) {
            if (config.currentSettings.hasOwnProperty(key)) {
                delete config.currentSettings[key];
            }
        }
    };

    global.whatsApp = {
        init() {
            global.whatsApp.warningIcon = false;
            whatsApp.tray = undefined;
            whatsApp.createMenu();

            whatsApp.clearCache();
            config.init();
            whatsApp.openWindow();
            config.applyConfiguration();
        },

        createMenu() {
            log.info("Creating menu");
            whatsApp.menu =
                AppMenu.buildFromTemplate(require('./menu'));
                AppMenu.setApplicationMenu(whatsApp.menu);
        },

        setWarningTray() {
            if (whatsApp.tray != undefined && process.platform != 'darwin' && !global.whatsApp.warningIcon) {
                log.info("Setting tray icon to warning");
                whatsApp.tray.setImage(__dirname + '/assets/icon/iconWarning.png');
                global.whatsApp.warningIcon = true;
            }
        },

        setNormalTray() {
            if (whatsApp.tray != undefined && process.platform != 'darwin' && global.whatsApp.warningIcon) {
                log.info("Setting tray icon to normal");
                whatsApp.tray.setImage(__dirname + '/assets/icon/icon.png');
                global.whatsApp.warningIcon = false;
            }
        },

        createTray() {
            log.info("Creating tray icon");
            var trayImg = __dirname + '/assets/img/trayTemplate.png';
            // Darwin requires black/white/transparent icon, other platforms does not
            if (process.platform != 'darwin') {
                trayImg = __dirname + '/assets/icon/icon.png';
            }
            whatsApp.tray = new AppTray(trayImg);

            // Setting up a trayicon context menu
            whatsApp.trayContextMenu = AppMenu.buildFromTemplate([
                {label: _('Show'),
                visible: false, // Hide this option on start
                click: function() {
                    whatsApp.window.show();
                }},

                {label: _('Hide'),
                visible: true, // Show this option on start
                click: function() {
                    whatsApp.window.hide();
                }},

                // Quit WhatsApp
                {label: _('Quit'), click: function() {
                    app.quit();
                }}
            ]);
            whatsApp.tray.setContextMenu(whatsApp.trayContextMenu);

            // Normal this will show the main window, but electron under Linux
            // dosent work with the clicked event so we are using the above
            // contextmenu insted - Rightclick the trayicon and pick Show
            // WhatsApp
            // More info:
            // https://github.com/electron/electron/blob/master/docs/api/tray.md
            // See the Platform limitations section.
            whatsApp.tray.on('clicked', () => {
                whatsApp.window.show();
            });
            whatsApp.tray.on('click', () => {
                whatsApp.window.show();
            });

            whatsApp.tray.setToolTip('WhatsApp Desktop');
        },

        clearCache() {
            log.info("Clearing cache");
            try {
                fileSystem.unlinkSync(app.getPath('userData') + '/Application Cache/Index');
            } catch(e) {
                log.warn("Error clearing cache: " + e);
            }
        },

        openWindow() {
            log.info("Open main window");
            whatsApp.window = new BrowserWindow({
                "y": config.get("posY"),
                "x": config.get("posX"),
                "width": config.get("width"),
                "height": config.get("height"),
                "minWidth": 600,
                "minHeight": 600,
                //"type": "toolbar",
                "title": "WhatsApp",
                "show": config.get("startminimized") != true,
                "icon": __dirname + "/assets/icon/icon.png",
                "webPreferences": {
                  "nodeIntegration": false,
                  "preload": join(__dirname, 'js', 'injected.js')
                }
            });

            whatsApp.window.loadURL('https://web.whatsapp.com');

            if (config.get("useProxy")) {
                var session = whatsApp.window.webContents.session;
                var httpProxy = config.get("httpProxy");
                var httpsProxy = config.get("httpsProxy") || httpProxy;
                if (httpProxy) {
                    session.setProxy("http="+ httpProxy +";https=" + httpsProxy, () => {});
                }
            }

            if (config.get("startminimized") != true) {
                whatsApp.window.show();
            }

            whatsApp.window.on('page-title-updated', onlyOSX((event, title) => {
                var count = title.match(/\((\d+)\)/);
                    count = count ? count[1] : '';

                app.dock.setBadge(count);
                // if (parseInt(count) > 0)
                //     app.dock.bounce('informational');
                log.info("Badge updated: " + count);
            }));

            whatsApp.window.on('page-title-updated', onlyLinux((event, title) => {
                var count = title.match(/\((\d+)\)/);
                    count = count ? count[1] : '';

                // TODO
                log.info("Badge updated: " + count);
            }));

            whatsApp.window.on('page-title-updated', onlyWin((event, title) => {
                var count = title.match(/\((\d+)\)/);
                    count = count ? count[1] : '';

                if (parseInt(count) > 0) {
                    if (!whatsApp.window.isFocused()) {
                      whatsApp.window.flashFrame(true);
                    }
                    var badge = NativeImage.createFromPath(app.getAppPath() + "/assets/badges/badge-" + (count > 9 ? 0 : count) +".png");
                    whatsApp.window.setOverlayIcon(badge, "new messages");
                } else {
                    whatsApp.window.setOverlayIcon(null, "no new messages");
                }
                log.info("Badge updated: " + count);
            }));

            whatsApp.window.webContents.on("new-window", (e, url) => {
                require('electron').shell.openExternal(url);
                e.preventDefault();
            });

            whatsApp.window.on('close', onlyOSX((e) => {
                if (whatsApp.window.forceClose !== true) {
                    e.preventDefault();
                    whatsApp.window.hide();
                }
            }));

            whatsApp.window.on('close', onlyLinux((e) => {
                if (whatsApp.tray == undefined) {
                    app.quit();
                } else if (whatsApp.window.forceClose !== true) {
                    e.preventDefault();
                    whatsApp.window.hide();
                }
            }));

            whatsApp.window.on("close", function(){
                if (settings.window) {
                    settings.window.close();
                    settings.window = null;
                }

                // save the window position
                config.set("posX", this.getBounds().x);
                config.set("posY", this.getBounds().y);
                config.set("width", this.getBounds().width);
                config.set("height", this.getBounds().height);
                config.saveConfiguration();
            });

            // Toggle contextmenu content when window is shown
            whatsApp.window.on("show", function() {
                if (whatsApp.tray != undefined) {
                    whatsApp.trayContextMenu.items[0].visible = false;
                    whatsApp.trayContextMenu.items[1].visible = true;

                    // Need to re-set the contextmenu for this to work under Linux
                    // TODO: Only trigger this under Linux
                    whatsApp.tray.setContextMenu(whatsApp.trayContextMenu);
                }
            });

            // Toggle contextmenu content when window is hidden
            whatsApp.window.on("hide", function() {
                if (whatsApp.tray != undefined) {
                    whatsApp.trayContextMenu.items[0].visible = true;
                    whatsApp.trayContextMenu.items[1].visible = false;

                    // Need to re-set the contextmenu for this to work under Linux
                    // TODO: Only trigger this under Linux
                    whatsApp.tray.setContextMenu(whatsApp.trayContextMenu);
                }
            });

            app.on('before-quit', onlyOSX(() => {
                whatsApp.window.forceClose = true;
            }));

            app.on('before-quit', onlyLinux(() => {
                whatsApp.window.forceClose = true;
            }));

            app.on('activate-with-no-open-windows', onlyOSX(() => {
                whatsApp.window.show();
            }));

            app.on('window-all-closed', onlyWin(() => {
                app.quit();
            }));
        }
    };

    global.settings = {
        init() {
            // if there is already one instance of the window created show that one
            if (settings.window){
                settings.window.show();
            } else {
                settings.openWindow();
                settings.createMenu();
            }
        },

        createMenu() {
            settings.menu = new AppMenu();
            settings.menu.append(new MenuItem(
                {
                    label: "close",
                    visible: false,
                    accelerator: "esc",
                    click() {settings.window.close();}
                })
            );
            settings.menu.append(new MenuItem(
                {
                    label: 'Toggle DevTools',
                    accelerator: 'Ctrl+Shift+I',
                    visible: false,
                    click() {  settings.window.toggleDevTools(); }
                })
            );
            settings.menu.append(new MenuItem(
                {
                    label: 'Reload settings view',
                    accelerator: 'CmdOrCtrl+r',
                    visible: false,
                    click() { settings.window.reload();}
                })
            );
            settings.window.setMenu(settings.menu);
            settings.window.setMenuBarVisibility(false);
        },

        openWindow() {
            settings.window = new BrowserWindow(
                {
                    "width": 550,
                    "height": 550,
                    "resizable": true,
                    "center": true,
                    "frame": true,
                    "webPreferences": {
                      "nodeIntegration": true,
                    }
                }
            );

            settings.window.loadURL("file://" + __dirname + "/html/settings.html");
            settings.window.show();

            settings.window.on("close", () => {
                settings.window = null;
            });
        }
    };

    const {ipcMain} = require('electron');
    ipcMain.on('phoneinfoupdate', (event, arg) => {
        global.phoneinfo.infos = arg;
        if (arg.info != "NORMAL") {
            global.whatsApp.setWarningTray();
        } else {
            global.whatsApp.setNormalTray();
        }
    });

    global.phoneinfo = {
        init() {
            // if there is already one instance of the window created show that one
            if (phoneinfo.window){
                phoneinfo.window.show();
            } else {
                phoneinfo.openWindow();
                phoneinfo.createMenu();
            }
        },

        createMenu() {
            phoneinfo.menu = new AppMenu();
            phoneinfo.menu.append(new MenuItem(
                {
                    label: "close",
                    visible: false,
                    accelerator: "esc",
                    click() {phoneinfo.window.close();}
                })
            );
            phoneinfo.menu.append(new MenuItem(
                {
                    label: 'Reload phoneinfo view',
                    accelerator: 'CmdOrCtrl+r',
                    visible: false,
                    click() { phoneinfo.window.reload();}
                })
            );
            phoneinfo.menu.append(new MenuItem({
                label: 'Toggle Developer Tools',
                accelerator: (function() {
                    if (process.platform == 'darwin')
                        return 'Alt+Command+I';
                    else
                        return 'Ctrl+Shift+I';
                })(),
                click: function(item, focusedWindow) {
                    if (focusedWindow)
                        focusedWindow.toggleDevTools();
                }
            }));
            phoneinfo.window.setMenu(phoneinfo.menu);
            phoneinfo.window.setMenuBarVisibility(false);
        },

        openWindow() {
            phoneinfo.window = new BrowserWindow(
                {
                    "width": 500,
                    "height": 500,
                    "resizable": true,
                    "center": true,
                    "frame": true,
                    "webPreferences": {
                      "nodeIntegration": true,
                    }
                }
            );

            phoneinfo.window.loadURL("file://" + __dirname + "/html/phoneinfo.html");
            phoneinfo.window.show();

            phoneinfo.window.on("close", () => {
                phoneinfo.window = null;
            });
        }
    }

    app.on('ready', () => {
        whatsApp.init();
    });
})(this);
