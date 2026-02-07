




iMacros.conv_recorder = (function() {
    let {imns} = Components.utils.import("resource://imacros/utils.js");
    let {rijndael} = Components.utils.import("resource://imacros/rijndael.js");
    let {Downloads} = Components.utils.import("resource://gre/modules/Downloads.jsm");
    
    
    

    var iMacrosSHistoryListener = {
        
        OnHistoryGoBack: function(backURI) {
            if (iMacros.recording) {
                iMacros.recorder.recordAction("BACK");
            }
            return true;
        },

        OnHistoryGoForward: function(forwardURI) {
            return true; 
        },

        OnHistoryGotoIndex: function (index, gotoURI) {
            return true;
        },

        OnHistoryNewEntry: function(newURI) {
        },

        OnHistoryPurge: function(numEntries) { return true; },

        OnHistoryReload: function(reloadURI, reloadFlags) {
            if (iMacros.recording) {
                iMacros.recorder.recordAction("REFRESH");
            }
            
            return true;
        },

        QueryInterface: function(iid) {
            if (iid.equals(imns.Ci.nsISHistoryListener) ||
                iid.equals(imns.Ci.nsISupportsWeakReference)||
                iid.equals(imns.Ci.nsISupports)) {
                return this;
            }
            throw Components.results.NS_ERROR_NO_INTERFACE;
        }

    };


    
    

    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    
    

    
    
    
    
    

    
    
            
    
    
    
    
    

    
    
    
    
    
        
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    


    
    
    
    
    
    

    
    
    
    

    
    
    
        
    
    
    
    
    
    
    
    
    
        
    
    
    
    
    
    
    

    
    
    
        
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
        
    
    
            
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    

    

    
    
    
    

    
    
    

    

    
    
    
    
    
    
    
    

    

    
    function MacroRecorder() {
        
        this.versionId = "VERSION BUILD="+imacros_version+" RECORDER=FX";

        
        this._onMouseDown = this.onMouseDown.bind(this);
        this._onMouseUp = this.onMouseUp.bind(this);
        this._onMouseMove = this.onMouseMove.bind(this);
        this._onMouseClick = this.onMouseClick.bind(this);
        this._onBrowserUIClick = this.onBrowserUIClick.bind(this);
        this._onMouseDblClick = this.onMouseDblClick.bind(this);
        
        
        this._onKeypress = this.onKeypress.bind(this);
        this._onDragEvents = this.onDragEvents.bind(this);

        
        this._onChange = this.onChange.bind(this);

        
        
        this._onTabSelect = this.onTabSelect.bind(this);
        this._onTabClose = this.onTabClose.bind(this);
    }

    MacroRecorder.prototype.beforeRecordAction = function(rec) {
        
    };

    MacroRecorder.prototype.afterRecordAction = function(rec) {
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
    };

    MacroRecorder.prototype.recordAction = function(rec) {
        this.beforeRecordAction(rec);
        this.actions.push(rec);
        iMacros.panel.addLine(rec);
        this.afterRecordAction(rec);
    };


    
    MacroRecorder.prototype.start = function() {
        
        var branch = imns.prefsvc.getBranch("browser.link.");
        var open_newwindow =  branch.getIntPref("open_newwindow");
        var open_newwindow_restriction = branch.
            getIntPref("open_newwindow.restriction");
        imns.storage.setNamedObject("open_newwindow", open_newwindow);
        if (open_newwindow != 3) {
            branch.setIntPref("open_newwindow", 3);
        }
        imns.storage.setNamedObject("open_newwindow_restriction",
                                    open_newwindow_restriction);
        if (open_newwindow_restriction != 0) {
            branch.setIntPref("open_newwindow.restriction", 0);
        }

        
        iMacros.panel.clearAllLines();
        
        iMacros.panel.mboxClearMessage();
        
        this.registerObservers();
        this.hookEvents();

        this.downloadDlgHandled = false;
        
        this.rclickTarget = null;
        
        this.curTabIndex = gBrowser.mTabContainer.selectedIndex;
        this.prevTab = 0;
        
        this.likelyUITabClose = false;

        
        this.actions = new Array();

        
        this.recordPageTitle = window.content.document.title;
        
        this.currentFrame = null;
        
        

        
        this.showPwdDialog = true;
        this.encrypt = false;
        this.password = "";

        var conf = false;
        var ask = imns.Pref.getBoolPref("show-tabsclose-dialog");
        if (ask && gBrowser.tabContainer.childNodes.length > 1) {
            var prompts = imns.Cc["@mozilla.org/embedcomp/prompt-service;1"]
              .getService(imns.Ci.nsIPromptService);
            var check = {value: true};
            
            var flags = prompts.STD_YES_NO_BUTTONS;
            var msg = "Would you like to close all tabs before recording?";
            msg += "\n\n";
            msg += "If you select YES, iMacros will close all other open tabs"+
                "\n and add the \"TAB CLOSEALLOTHER\" command to the macro.";
            var chck_msg = "Show this dialog next time";
            var button = prompts.confirmEx(window, "", msg,
                flags, "", "", "", chck_msg, check);

            imns.Pref.setBoolPref("show-tabsclose-dialog", check.value)
            if ( conf = button == 0 ) {
                gBrowser.removeAllTabsBut(gBrowser.selectedTab); 
            }
        } 

        try {
            
            
            
            
            gBrowser.webNavigation.sessionHistory.
                addSHistoryListener(iMacrosSHistoryListener);
        } catch(e) {
            Components.utils.reportError(e);
        }
        
        this.recording = true;
        
        iMacros.panel.statLine3 = "#Current.iim";
        iMacros.panel.statLine1Status = "recording";
        iMacros.panel.statLine1 = imns.strings('imacrosrecording');
        
        iMacros.panel.updateControlPanel();
        iMacros.panel.showLines();
        
        
        this.recordAction(this.versionId);
        this.recordAction("TAB T=1");
        if (conf) {
            this.recordAction("TAB CLOSEALLOTHERS");
        }

        this.recordAction("URL GOTO="+window.content.document.location);
    };


    MacroRecorder.prototype.stop = function() {
        this.recording = false;
        this.paused = false;
        this.unregisterObservers();
        this.unhookEvents();

        
        
        this.currentFrame = null;
        this.submitter = null;
        this.rclickTarget = null;
        
        try {
            
            gBrowser.webNavigation.sessionHistory.
               removeSHistoryListener(iMacrosSHistoryListener);
        } catch(e) {
            Components.utils.reportError(e);
        }

        var name = "#Current.iim";

        
        try {
            var macro = this.getRecordedMacro();
            var file = imns.FIO.openMacroFile(name);
            imns.FIO.writeTextFile(file, macro);

            if (iMacros.panel.sidebarIsOpen) {
                var mtree = iMacros.panel.sidebar.getMTreeObject();
                var item = mtree.findItem(name);
                if (!item) {
                    mtree.insertLeaf(name, mtree.children);
                    item = mtree.findItem(name);
                }
                var idx = mtree.getIndexOfItem(item);
                mtree.tree.view.selection.select(idx);
            }
        } catch(e) {
            Components.utils.reportError(e);
            iMacros.panel.showErrorMessage(e);
        }
        
        
        var branch = imns.prefsvc.getBranch("browser.link.");
        if (imns.storage.hasNamedObject("open_newwindow")) {
            branch.setIntPref(
                "open_newwindow",
                imns.storage.getNamedObject("open_newwindow")
            );
            imns.storage.clear("open_newwindow");
        }

        if (imns.storage.hasNamedObject("open_newwindow_restriction")) {
            branch.setIntPref(
                "open_newwindow.restriction",
                imns.storage.getNamedObject("open_newwindow_restriction")
            );
            imns.storage.clear("open_newwindow_restriction");
        }
    };

    
    
    MacroRecorder.prototype.pause =  function(callback) {
        
        if (!this.paused) {
            
            this.paused = true;
            if (callback)
                callback();
        }
    };

    
    MacroRecorder.prototype.unPause =  function(callback) {
        if (this.paused) {
            
            this.paused = false;
            if (callback)
                callback();
        }
    };

    MacroRecorder.prototype.isPaused = function() {
        return this.paused;
    };

    
    MacroRecorder.prototype.observe = function (subject, topic, data) {
        try {
            
            if (topic == "imacros-commdlg-hook") {
                if (subject != window || !this.recording || this.paused)
                    return;
                var dlgres = eval(data);
                if (/^(?:alert|confirm|prompt)/.test(dlgres.type)) {
                    this.handleJSDialog(dlgres);
                } else if (dlgres.type == "login") {
                    this.handleLoginDialog(dlgres);
                }
            } else if (topic == "imacros-download-hook") {
                if (subject != window || !this.recording || this.paused)
                    return;
                this.handleDownloadDialog(data);
            }
        } catch(e) {
            Components.utils.reportError(e);
        }
    };

    
    MacroRecorder.prototype.recordDownload =  function(uri, file) {
        if (this.downloadDlgHandled) {
            this.downloadDlgHandled = false;
            return;
        }
        if (uri == window.content.location) { 
            var rec = "SAVEAS TYPE=CPL FOLDER=* "+
                "FILE=+_{{!NOW:yyyymmdd_hhnnss}}";
            this.recordAction(rec);
        } else if (this.rclickTarget) {
            
            this.recordTarget(this.rclickTarget);
            var lastrec = this.actions.pop();
            iMacros.panel.removeLastLine();
            var rec = "ONDOWNLOAD FOLDER=* "+
                "FILE=+_{{!NOW:yyyymmdd_hhnnss}} WAIT=YES";
            this.recordAction(rec);
            if (this.rclickTarget.tagName == "A") {
                lastrec += " CONTENT=EVENT:SAVETARGETAS";
            } else if (this.rclickTarget.tagName == "IMG") {
                lastrec += " CONTENT=EVENT:SAVEPICTUREAS";
            }
            this.recordAction(lastrec);
            this.rclickTarget = null;
        }
    };
    
    
    MacroRecorder.prototype.handleJSDialog = function (dlgres) {
        var data = "", pos = 1;

        if (dlgres.type == "prompt")
            data = imns.wrap(dlgres.val1);

        if (this.actions.length > 1) {
            var prev_action = this.actions[this.actions.length-2];
            if (/^ondialog pos=(\d+)/i.test(prev_action)) {
                pos = imns.s2i(RegExp.$1)+1;
            }
        }

        var rec = "ONDIALOG POS="+pos;
        rec += " BUTTON="+(dlgres.accept ? "OK" : "CANCEL");
        rec += " CONTENT="+data;
        var last_rec = this.actions.pop();
        iMacros.panel.removeLastLine();
        this.recordAction(rec);
        this.recordAction(last_rec);
    };


    MacroRecorder.prototype.handleLoginDialog = function(dlgres) {
        if (!dlgres.accept) {
            
            return;
        }
        var user = dlgres.val1, pwd = dlgres.val2;
        var pm = imns.getPasswordManager();
        var key = imns.getEncryptionKey(),
            enc_type = "SET !ENCRYPTION ";

        switch(pm.encryptionType) {
        case pm.TYPE_NONE:
            enc_type += "NO"; break;
        case pm.TYPE_STORED:
            enc_type += "STOREDKEY";
            pwd = Rijndael.encryptString(pwd, key);
            break;
        case pm.TYPE_TEMP:
            enc_type += "TMPKEY";
            pwd = Rijndael.encryptString(pwd, key);
            break;
        }
        
        var rec = "ONLOGIN USER="+user+" PASSWORD="+pwd;
        var lastrec = this.actions.pop();
        iMacros.panel.removeLastLine();
        this.recordAction(enc_type);
        this.recordAction(rec);
        this.recordAction(lastrec);
    };


    MacroRecorder.prototype.handleDownloadDialog = function (data) {
        let rec = "ONDOWNLOAD FOLDER=*"+
            " FILE=+_{{!NOW:yyyymmdd_hhnnss}}"+
            " WAIT=YES";
        let sliced_actions = new Array(), prev_action = "";
        
        
        do {
            prev_action = this.actions.pop();
            sliced_actions.push(prev_action);
            iMacros.panel.removeLastLine();
        } while(this.actions.length && !/^(?:TAG|URL)/.test(prev_action));
        this.recordAction(rec);
        sliced_actions.reverse().forEach((x) => this.recordAction(x));
        this.downloadDlgHandled = true;
    };


    
    MacroRecorder.prototype.topics = {
        "imacros-commdlg-hook": false,
        "imacros-download-hook": false
    };
    
    MacroRecorder.prototype.registerObservers = function() {
        var mplayer = this;
        Downloads.getList(Downloads.PUBLIC).then(function(l) {
            l.addView(mplayer);
        });
        imns.osvc.addObserver(this, "imacros-download-hook", false);
        imns.osvc.addObserver(this, "imacros-commdlg-hook", false);
        
    };

    MacroRecorder.prototype.unregisterObservers = function() {
        var mplayer = this;
        Downloads.getList(Downloads.PUBLIC).then(function(l) {
            l.removeView(mplayer);
        });
        imns.osvc.removeObserver(this, "imacros-download-hook", false);
        imns.osvc.removeObserver(this, "imacros-commdlg-hook", false);
    };


    MacroRecorder.prototype.onDownloadAdded = function(dl) {
        if (dl.succeeded || dl.stopped)
            return;
        if (this.recording && !this.paused) {
            this.recordDownload(dl.source.url, dl.target.path);    
        }
    };
    
    MacroRecorder.prototype.onDownloadChanged = function(dl) {
        
    };

    MacroRecorder.prototype.onDownloadRemoved = function(dl) {
        
    };

    
    
    MacroRecorder.prototype.showPasswordDialog = function() {
        var pm = imns.getPasswordManager();
        var ok = imns.Dialogs.confirm(imns.strings("imacrosdoyouwanttosto2"));
        if (ok) {
            var param = { master: pm.encryptionType == pm.TYPE_STORED };
            param.password = param.master ? pm.getMasterPwd() :
                pm.getSessionPwd();
            window.openDialog('chrome://imacros/content/keydlg2.xul', 
                              '', 'modal,centerscreen', param);
            if (param.master) {
                pm.setMasterPwd(param.password);
                pm.encryptionType = pm.TYPE_STORED;
            } else {
                pm.setSessionPwd(param.password);
                pm.encryptionType = pm.TYPE_TEMP;
            }
            
            return true; 
        }

        return false;
    };


    
    MacroRecorder.prototype.showPasswordDialog2 = function() {
        var pm = imns.getPasswordManager();
        var ok = imns.Dialogs.confirm(imns.strings('imacrosdoyouwanttosto2'));
        if (ok) {
            var param = { usedefault: true };
            param.password = (pm.encryptionType == pm.TYPE_STORED)?
                pm.getMasterPwd() : pm.getSessionPwd();
            window.openDialog('chrome://imacros/content/keydlg3.xul', 
                              '', 'modal,centerscreen', param);
            if (!param.usedefault) {
                switch (pm.encryptionType) {
                case pm.TYPE_STORED:
                    pm.setMasterPwd(param.password);
                    break;
                case pm.TYPE_NONE:
                    pm.encryptionType = pm.TYPE_TEMP;
                case pm.TYPE_TEMP:
                    pm.setSessionPwd(param.password);
                    break;
                }
            }
            return true; 
        }

        return false;
    };

    
    MacroRecorder.prototype.addWaitCommand = function () {
        var inout = {confirm: false, period: 5};
        window.openDialog('chrome://imacros/content/wait.xul','',
                          'modal,centerscreen', inout);
        if (!inout.confirm)
            return;
        var rec = "WAIT SECONDS="+inout.period;
        this.recordAction(rec);
    };


    
    MacroRecorder.prototype.takeScreenshot = function() {
        var rec = "SAVEAS TYPE=PNG FOLDER=* FILE=*";
        this.recordAction(rec);
    };


    MacroRecorder.prototype.savePageAs = function() {
        var rec = "SAVEAS TYPE=CPL FOLDER=* FILE=*";
        this.recordAction(rec);
    };

    
    
    MacroRecorder.prototype.clearCookies = function() {
        var rec = "CLEAR";
        this.recordAction(rec);
    };


    
    MacroRecorder.prototype.getRecordedMacro = function() {
        if (!this.actions)
            return "";
        return this.actions.join("\n");
    };


    MacroRecorder.prototype.highlightElement = function(element) {
        var doc = element.ownerDocument;
        var hl_div = doc.createElement("div");
        hl_div.id = "imacros-highlight-div";
        hl_div.style.position = "absolute";
        hl_div.style.zIndex = 1000;
        hl_div.style.border = "1px solid #aaaaaa";
        hl_div.style.border = "1px solid blue";
        hl_div.style.borderRadius = "2px";
        var hl_img = doc.createElement("div");
        hl_img.style.display="block";
        hl_img.style.width = "24px";
        hl_img.style.height = "24px";
        hl_img.style.backgroundImage = "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3QQFEQM3Ll7MKAAABTdJREFUSMe9lUtsXNUdxn/nPmfG45mMH5PYxB5HDXFJArWQQhOEhNQiqITaSqWFBe2isGgQygopZdNFQUgUVar6WIRdacWmCEpoiypBVVoQVDFGQBIiSI2d2J7gsT3vuY9z7zmni5s4hG5aqeW/OdLR0ff9H9/5/vB/DgHwuzcvmv8l6L23Tottgr+eaZiLcYkv7/Up5a59KDUoA54FOJDY0JKXeHXrBN+Z+DGWajI6OMZG6VmcjTrVXz3CK9/+KQXh8tUbdwoAZ6Mb8Y1bxila0NfQBwINqc7qM2giLHwLLODxtx9E+xu02orHyidxvbOIdeCJNn7zAnf89mFeu//p7SQtgGYA7/fh4wAaAfQjiCS0u5JWN2J9q0+nF5MkcM/kcdbO+Xxz6hjr5WfoXNjDhn+M5veOE24NWL3vUc43Q5YbAwMgTs6vGWesQm2XD0DOt1BpVoHSWRbagFIQK0gVpKlC6WxstiXwLYXrgm1ld0GkaCxtcc/haeHUxgu8v9nmhpmJDCiFMIF2P6UbaFSqSFKFsGwsy8ZxbACMEWitSZOIMIyJQkmaJiilSVLN/moBAGdupiJ+83bdaAPnFpt8shmAlWO4mMfzPSzbw7NBCBDCwrEVSmWzSZRCJhqZmG1wgNp1w0yVs444AO+dW6fehDjsMblrhFJpiFzORwhxOVuDMQalUhyREMWCHbmQUNqoNLvDszBaoLVhdmYHL/5l6SrBVw7s4vSmRblUIl8o4PseQojLoAql0oxIK5SRFBhQzbVpdcYoewk3TC4R6hJd9lApD9HpBaxe6nDq/JZxACKZkMuVQIUAKKXQWmOMIZEJWkkAPBcmh7YYrY6ixRg3j+exTIgbblI2LXbLd3j8520+2BzhC7MHSbTJKlAaoijG6IROd4BKLGzHvaxjhU3K1MQw1ZEcqlNnRL2OH5/GG7wD0TqEqxA3CEWNcTkD3AdAe5BkVnFyfs3Mr0iKRZ9UBhSHhsh7hrwPvuewrzZMQS1C4w/sm1GQdMDOg1MELcHyYPEEsrVE6B1ko1dmfnkvzuxjWQUTO3JEH3WYmJxkfa2D8gKM4wAue2slmsunOFD9NW7VhdABy0GaEi//7JcE3Yi52/ex/46j6FOPYtpnKARwZHrA/JWffMv1oyJJUhzHI5fP9GtZgkrZxxaGoeUncc0GxA2I6gAsnPw9HywrFjZrvPXyPL36h2h8lMo+p+8kV1WU2Wqm4XJlJyq8hOs67BzJ88Lzf2Z64VWmdt3OZHWQPTaZqp4LHwag4nchvEQiY9IUxNAUp8/lsec+ReDaFmkS47g+jjWObXUZG8nzylvL5KOHuDP+B8hO1vNwlUNH9vCjwR9Z6Y7yrUNDiOabJNKgVLYDlryvcfTwtNgmuHOuysLqJ1TGrgPLx/cLLF5sEgYBxw6/x1RlGYLOtks6wQpfPzQG/JOo3yXuS6SENIW4scLcxNmrbgrQ6km0iol7q5ioDkbiuQ7Xf3GO/oWPWWnNIKWFDGNkGBNFAtnfJOhsISNJHF8GjyEljxf0rp2B79ocmanw98UWOVswCFN2+xbfvWuOOHmD042X2IhPsG/3KiruYnTWjjS9ckJiiiTlmwC48O761ZV5JU6d3zKDWDG+w+fg7rL47Cp88Se3mgNfChlW72Y2npsi6ayQpmDsImL0bv72wp9I4j4/eNqIfyP4T+Klp/ab2l6fQgHOLGwye9NOPL1GIka5WM9z19H5azCd/5Zg9rbjvPbM93H9Ig/8oiee/WFkvEKRZv0stRvv5nOPfwH+upM4OdCDcQAAAABJRU5ErkJggg==')";
        
        
        hl_div.appendChild(hl_img);
        doc.body.appendChild(hl_div);
        var rect = element.getBoundingClientRect();
        var scrollX = doc.defaultView.scrollX;
        var scrollY = doc.defaultView.scrollY;
        hl_div.style.left = Math.round(rect.left-1+scrollX)+"px";
        hl_div.style.top = Math.round(rect.top-1+scrollY)+"px";
        hl_div.style.width = Math.round(rect.width)+"px";
        hl_div.style.height = Math.round(rect.height)+"px";
        
        if (rect.top > 26) {
            hl_img.style.marginLeft = "4px";
            hl_img.style.marginTop = "-26px";
        } else if (rect.bottom+26 < doc.body.clientHeight) {
            hl_img.style.marginLeft = "4px";
            hl_img.style.marginBottom = "-26px";
        } else if (rect.left > 26) {
            hl_img.style.marginLeft = "-26px";
            hl_img.style.marginTop = "4px";
        } else if (rect.right+26 < doc.body.clientWidth) {
            hl_img.style.marginRight = "-26px";
            hl_img.style.marginTop = "4px";
        } else {
            hl_img.style.marginLeft = "0px";
            hl_img.style.marginTop = "0px";
        }

        doc.defaultView.setTimeout(function() {
            (hl_div.parentNode || hl_div.ownerDocument).
                removeChild(hl_div);
        }, 500);
    };


    MacroRecorder.prototype.onTabSelect = function(event) {
        if (!this.recording || this.paused)
            return;
        var browser = getBrowser();
        var current = browser.tabContainer.selectedIndex;
        if ((current = current - this.curTabIndex) < 0) {
            iMacros.panel.showInfoMessage(
                "Note: Tabs LEFT "+
                    "of the start tab are not recorded."
            );
            return;
        }
        if (current == this.prevTab)
            return;
        
        this.prevTab = current;
        this.currentFrame = null; 
        
        this.recordAction("TAB T=" + (current + 1));
    };


    
    
    
    


    MacroRecorder.prototype.onNewNavigatorTab = function() {
        if (!this.recording || this.paused)
            return;
        this.recordAction("TAB OPEN");
    };

    MacroRecorder.prototype.onBrowserUIClick = function(event) {
        if (this.isContentEvent(event))
            return;
        
        if (!this.recording || this.paused)
            return;
        
        
        
        
        
        
        

        
        
        if (event.target.tagName == "tab" &&
            event.rangeParent.tagName == "xul:hbox" &&
            event.originalTarget.tagName == "xul:toolbarbutton")
            this.likelyUITabClose = true;
    };

    MacroRecorder.prototype.on_cmd_close = function () {
        if (!this.recording || this.paused)
            return;
        this.likelyUITabClose = true;
    };

    MacroRecorder.prototype.onTabClose = function (event) {
        if (!this.recording || this.paused)
            return;

        if (!this.likelyUITabClose)
            return;       
        this.likelyUITabClose = false;

        
        var tab = event.target;
        if (!tab.selected) {
            var tabs = getBrowser().tabContainer.childNodes;
            var n = 0;
            while (n < tabs.length && tab != tabs[n])
                n++;
            n = n - this.curTabIndex + 1;
            this.recordAction("TAB T="+n);
        }
        
        this.recordAction("TAB CLOSE");
        
    };


    MacroRecorder.prototype.hookEvents = function() {
        
        window.addEventListener("change", this._onChange, true);

        
        window.addEventListener("mousedown", this._onMouseDown, true);
        window.addEventListener("mouseup", this._onMouseUp, true);
        window.addEventListener("click", this._onMouseClick, true);
        window.addEventListener("click", this._onBrowserUIClick, true);
        window.addEventListener("dblclick", this._onMouseDblClick, true);
        this.mousemoveListenerActive = false;
        window.addEventListener("mousemove", this._onMouseMove, true);
        
        
        window.addEventListener("keypress", this._onKeypress, true);

        
        var con = gBrowser.tabContainer;
        con.addEventListener("TabSelect", this._onTabSelect, false);
        con.addEventListener("TabClose", this._onTabClose, false);
        

        
        
        
        gURLBar.imacros_hook_handleCommand = gURLBar.handleCommand;
        gURLBar.handleCommand = function(param) {
            iMacros.recorder.onNavigate();
            return gURLBar.imacros_hook_handleCommand(param);
        };
        var cmd = document.getElementById('cmd_newNavigatorTab');
        this.oncommand_cmd_newNavigatorTab = cmd.getAttribute("oncommand");
        cmd.setAttribute("oncommand", "iMacros.recorder.onNewNavigatorTab();"+
                         this.oncommand_cmd_newNavigatorTab);
        
        
        
        cmd = document.getElementById('cmd_close');
        this.oncommand_cmd_close = cmd.getAttribute("oncommand");
        cmd.setAttribute("oncommand", "iMacros.recorder.on_cmd_close();"+
                         this.oncommand_cmd_close);
    };


    MacroRecorder.prototype.unhookEvents = function() {
        
        window.removeEventListener("change", this._onChange, true);

        
        window.removeEventListener("mousedown", this._onMouseDown, true);
        window.removeEventListener("mouseup", this._onMouseUp, true);
        window.removeEventListener("click", this._onMouseClick, true);
        window.removeEventListener("click", this._onBrowserUIClick, true);
        window.removeEventListener("dblclick", this._onMouseDblClick, true);
        this.mousemoveListenerActive = false;
        window.removeEventListener("mousemove", this._onMouseMove, true);
        window.removeEventListener("dragstart", this._onDragEvents, true);
        window.removeEventListener("drop", this._onDragEvents, true);
        window.removeEventListener("dragend", this._onDragEvents, true);
        
        
        window.removeEventListener("keypress", this._onKeypress, true);
        
        
        var con = gBrowser.tabContainer;
        con.removeEventListener("TabSelect", this._onTabSelect, false);
        con.removeEventListener("TabClose", this._onTabClose, false);
        

        gURLBar.handleCommand = gURLBar.imacros_hook_handleCommand;
        gURLBar.imacros_hook_handleCommand = null;
        var cmd = document.getElementById('cmd_newNavigatorTab');
        cmd.setAttribute("oncommand", this.oncommand_cmd_newNavigatorTab);
        this.oncommand_cmd_newNavigatorTab = null;
        cmd = document.getElementById('cmd_close');
        cmd.setAttribute("oncommand", this.oncommand_cmd_close);
        this.oncommand_cmd_close = null;
    };


    MacroRecorder.prototype.__defineGetter__("favorId", function() {
        return imns.Pref.getBoolPref("id-priority");
    });

    MacroRecorder.prototype.__defineGetter__("useExpertMode", function() {
        if (imns.Pref.getCharPref("record-mode") == "conventional")
            return imns.Pref.getBoolPref("expert-mode");
        else
            return false;
    });

    MacroRecorder.prototype.__defineGetter__("recordMode", function() {
        var mode = imns.Pref.getCharPref("record-mode");
        if (!mode) {
            mode = "conventional";
            imns.Pref.setCharPref("record-mode", mode);
        }
        if (mode == "auto")     
            return "conventional";

        return mode;
    });

     
    MacroRecorder.prototype.onNavigate = function() {
        if (!this.recording || this.paused)
            return;
        var link = gURLBar.value;
        this.recordAction("URL GOTO="+link);
    };
    
    MacroRecorder.prototype.checkForFrameChange = function(elem) {
        
        
        function findFrameNumber(win, f, obj) {
            if (win.top == f)         
                return 0;
            for (var i = 0; i < win.frames.length; i++) {
                obj.num++;
                if ( win.frames[i] == f) {
                    return obj.num;
                }
                var n = findFrameNumber(win.frames[i], f, obj);
                if (n != -1)
                    return n;
            }
            return -1;
        }

        var win = elem.ownerDocument.defaultView; 
        if (!this.currentFrame || this.currentFrame.closed ||
            !this.currentFrame.document) {
            this.currentFrame = window.content;
        }
        
        if (this.currentFrame != win) {
            var nframe = 0, rec;
            this.currentFrame = win;
            if (win.frameElement && win.frameElement.name) {
                rec = "FRAME NAME=\""+win.frameElement.name+"\"";
            } else {
                nframe = findFrameNumber(win.top, win, {num:0});
                rec = "FRAME F="+nframe.toString();
            } 
            this.recordAction(rec);
        }
    };
    

    MacroRecorder.prototype.makeFormRecord = function(elem) {
        var form = "";
        if (elem.form) {
            if (elem.form.id && this.favorId) {
                form = "ID:"+imns.wrap(elem.form.id);
            } else {
                if (elem.form.name) {
                    form = "NAME:"+imns.wrap(elem.form.name);
                } else if (elem.form.action) {
                    var x;
                    if (!(x = elem.form.getAttribute("action")))
                        x = elem.form.action;
                    form = "ACTION:"+imns.wrap(x);
                } else {
                    form = "NAME:NoFormName";
                }
            }
        }

        return form;
    };


    MacroRecorder.prototype.makeAttrRecord = function (elem) {
        
        var truncate = function(s) {
            s = s.toString();
            if (s.length > 60) {
                s = s.substring(0, 60);
                s = s.replace(/(?:<|<\w{0,2}|<\w{2}>)+$/, "");
                s += "*";
            } 
            return s;
        };

        var attr = "";

        if (this.useExpertMode) {
            var attrs = elem.attributes, arr = new Array();
            for (var i = 0; i < attrs.length; i++) {
                if (attrs[i].name.toLowerCase() == "style")
                    continue;
                arr.push(attrs[i].name.toUpperCase()+":"+
                         imns.wrap(attrs[i].value));
            }
            attr = arr.length ? arr.join("&&") : "*";
        } else if (this.favorId && elem.id) {
            attr = "ID:"+imns.wrap(elem.id);
        } else if ("input" == elem.tagName.toLowerCase()) {
            var arr = new Array();
            if (elem.name)
                arr.push("NAME:"+imns.wrap(elem.name));
            if (elem.src)
                arr.push("SRC:"+imns.wrap(elem.src));
            attr = arr.length ? arr.join("&&") : "*";
        } else {
            var val = "";
            if (elem.href) {
                
                if (elem.textContent) {
                    val = "TXT:"+truncate(imns.wrap(
                        imns.escapeTextContent(elem.textContent)
                    ));
                } else {
                    val = "HREF:"+imns.wrap(elem.href);
                }
            } else {
                if (elem.src) {
                    val = "SRC:"+imns.wrap(elem.src);
                } else if (elem.name) {
                    val = "NAME:"+imns.wrap(elem.name);
                } else if (elem.alt) {
                    val = "ALT:"+imns.wrap(elem.alt);
                } else if (elem.textContent) {
                    val = "TXT:"+truncate(imns.wrap(
                        imns.escapeTextContent(elem.textContent)
                    ));
                }
            }
            
            if (!val) {  
                var x = elem.attributes, arr = new Array();
                for (var i = 0; i < x.length; i++) {
                    if (x[i].name.toLowerCase() == "style")
                        continue;
                    arr.push(x[i].name.toUpperCase()+":"+
                             imns.wrap(x[i].value));
                }
                arr.push("TXT:"+truncate(imns.wrap(
                    imns.escapeTextContent(elem.textContent)
                )));
                val = arr.length ? arr.join("&&") : "*";
            }

            attr = val;
        }
        
        return attr;
    };

    
    
    MacroRecorder.prototype.onChange = function(e) {
        if (!this.recording || this.paused || !this.isContentEvent(e))
            return;

        if (this.recordMode != "conventional")
            return;

        var elem = e.target;
        
        
        
        
        
        if (/option/i.test(elem.tagName))
            elem = e.originalTarget;
        
        var tagName = elem.tagName;
        if (!/^(?:input|textarea|select)$/i.test(tagName))
            return;

        var is_html5_input_type = function(type) {
            var t = type.toLowerCase();
            return t == "color" ||
                t == "date" ||
                t == "datetime" ||
                t == "datetime-local" ||
                t == "email" ||
                t == "month" ||
                t == "number" ||
                t == "range" ||
                t == "search" ||
                t == "tel" ||
                t == "time" ||
                t == "url" ||
                t == "week";
        };

        var is_html5_text_input_type = function(type) {
            var t = type.toLowerCase();
            return t == "email" ||
                t == "search" ||
                t == "tel" ||
                t == "url";
        };

        if (/^input$/i.test(tagName) &&
            !(is_html5_input_type(elem.type) ||
              /^(?:text|password|checkbox|file)$/i.test(elem.type))
           )
            return;

        var rec = "TAG", type = "" , pos = 0, form = null,
            attr = "", content_value = "";
        var pm = imns.getPasswordManager();
        
        
        this.checkForFrameChange(elem);

        
        type = tagName.toUpperCase();

        
        switch (tagName.toLowerCase()) {
        case "input":
            type += ":"+elem.type.toUpperCase();
            if (is_html5_input_type(elem.type) ||
                /^(?:text|file)$/i.test(elem.type)) {
                content_value = imns.wrap(elem.value);
            } else if (elem.type == "password") {
                if (this.showPwdDialog) {
                    if (pm.encryptionType != pm.TYPE_NONE) {
                        if (pm.encryptionType ==  pm.TYPE_STORED) {
                            this.password = pm.getMasterPwd();
                        } else if (pm.encryptionType ==  pm.TYPE_TEMP) {
                            this.password = pm.getSessionPwd();
                        } 
                        this.encrypt = this.password ?
                            this.showPasswordDialog2() :
                            this.showPasswordDialog();
                    }
                    var enc_type;
                    if (pm.encryptionType == pm.TYPE_NONE || !this.encrypt) {
                        this.password = ""; this.encrypt = false;
                        enc_type = "SET !ENCRYPTION NO"; 
                    } else if (pm.encryptionType == pm.TYPE_STORED) {
                        this.password = pm.getMasterPwd();
                        enc_type = "SET !ENCRYPTION STOREDKEY"; 
                    } else if (pm.encryptionType == pm.TYPE_TEMP) {
                        this.password = pm.getSessionPwd();
                        enc_type = "SET !ENCRYPTION TMPKEY"; 
                    }
                    this.recordAction(enc_type);
                    this.showPwdDialog = false;
                } 
                
                content_value = this.encrypt ?
                    Rijndael.encryptString(elem.value, this.password):
                    elem.value;
                content_value = imns.wrap(content_value);
            } else if (elem.type == "checkbox") {
                content_value = elem.checked ? "YES" : "NO";
            } 
            break;
        case "select":
            for(var i=0; i < elem.length; i++) {
                var prefix, text;
                if(!elem[i].selected)
                    continue;
                if (elem[i].hasAttribute("value")) {
                    prefix = "%";
                    text = elem[i].value;
                } else if (elem[i].text) {
                    prefix = "$";
                    text = imns.escapeTextContent(elem[i].text);
                } else {
                    prefix = "$";
                    text = elem[i].index;
                }
                if (!content_value) 
                    content_value = prefix + imns.wrap(text);
                else
                    content_value += ":" + prefix + imns.wrap(text);
            }
            break;
        case "textarea":
            content_value = imns.wrap(elem.value);
            break;
        default:
            return;
        }

        
        form = this.makeFormRecord(elem);

        
        attr = this.makeAttrRecord(elem);

        
        var atts = iMacros.player.TagHandler.parseAtts(attr), m;

        
        if (/input/i.test(tagName)) { 
            if (!atts) atts = new Object();
            atts["type"] = new RegExp("^"+elem.type+"$");
        }
        
        var form_atts = form ? iMacros.player.TagHandler.parseAtts(form) :
            null;
        pos = iMacros.player.TagHandler.findPosition(elem, atts, form_atts);
        if (!pos) {
            var e = new Error("Can't find element position, atts="+
                              atts.toSource());
            Components.utils.reportError(e);
            iMacros.panel.showErrorMessage(e);
            return;
        }

        
        rec = "TAG";
        rec += " POS="+pos;
        rec += " TYPE="+type;
        rec += form ? " FORM="+form : "";
        rec += " ATTR="+attr;
        if (this.actions.length &&
            this.actions[this.actions.length-1].indexOf(rec) == 0) {
            
            
            
            this.actions.pop();
            iMacros.panel.removeLastLine();
        }
        rec += " CONTENT="+content_value;
        
        this.recordAction(rec);
        if (imns.Pref.getBoolPref("highlight")) {
            this.highlightElement(elem);
        }

        
        if (this.submitter) {
            this.recordTarget(this.submitter);
            this.submitter = null;
        }
    };



    MacroRecorder.prototype.onKeypressInConvMode = function(e) {
        var elem = e.explicitOriginalTarget;
        if (elem.nodeType != Node.ELEMENT_NODE)
            return;
        var tagName = elem.tagName;
         
        if (!/^(?:input|textarea)$/i.test(tagName))
            return;

        var is_html5_text_input_type = function(type) {
            var t = type.toLowerCase();
            return t == "email" ||
                t == "search" ||
                t == "tel" ||
                t == "url";
        }; 

        if (/^input$/i.test(tagName) &&
            !(is_html5_text_input_type(elem.type) || 
              /^(?:text|password)$/i.test(elem.type)))
            return;

        var val = e.charCode ? String.fromCharCode(e.charCode) : "";
        var rec = "TAG", type = "" , pos = 0, form = null,
            attr = "", content_value = "";
        var pm = imns.getPasswordManager();

        this.checkForFrameChange(elem);
        
        
        type = tagName.toUpperCase();

        
        switch (tagName.toLowerCase()) {
        case "input":
            
            if (!val && elem.form
                && (is_html5_text_input_type(elem.type) ||
                    elem.type.toLowerCase() == "text" ||
                    elem.type.toLowerCase() == "password")
                && (e.keyCode == e.DOM_VK_ENTER ||
                    e.keyCode == e.DOM_VK_RETURN)) {
                for (var i = 0; i < elem.form.elements.length; i++) {
                    if (/submit/i.test(elem.form.elements[i].type)) {
                        
                        
                        this.submitter = elem.form.elements[i];
                        break;
                    }
                }
                
                
                
                

                return;
            }
            
            type += ":"+elem.type.toUpperCase();
            if (is_html5_text_input_type(elem.type) ||
                elem.type.toLowerCase() == "text") {
                content_value = imns.wrap(elem.value+val);
            } else if (elem.type.toLowerCase() == "password") {
                if (this.showPwdDialog) {
                    if (pm.encryptionType != pm.TYPE_NONE) {
                        if (pm.encryptionType ==  pm.TYPE_STORED) {
                            this.password = pm.getMasterPwd();
                        } else if (pm.encryptionType ==  pm.TYPE_TEMP) {
                            this.password = pm.getSessionPwd();
                        } 
                        this.encrypt = this.password ?
                            this.showPasswordDialog2() :
                            this.showPasswordDialog();
                    }
                    var enc_type;
                    if (pm.encryptionType == pm.TYPE_NONE || !this.encrypt) {
                        this.password = ""; this.encrypt = false;
                        enc_type = "SET !ENCRYPTION NO"; 
                    } else if (pm.encryptionType == pm.TYPE_STORED) {
                        this.password = pm.getMasterPwd();
                        enc_type = "SET !ENCRYPTION STOREDKEY"; 
                    } else if (pm.encryptionType == pm.TYPE_TEMP) {
                        this.password = pm.getSessionPwd();
                        enc_type = "SET !ENCRYPTION TMPKEY"; 
                    }
                    this.recordAction(enc_type);
                    this.showPwdDialog = false;
                } 
                
                content_value = this.encrypt ?
                    Rijndael.encryptString(elem.value+val, this.password):
                    elem.value+val;
                content_value = imns.wrap(content_value);
            }
            break;
         
        case "textarea":
            content_value = imns.wrap(elem.value+val);
            break;
        default:
            return;
        }

        
        form = this.makeFormRecord(elem);

        
        attr = this.makeAttrRecord(elem);

        
        var atts = iMacros.player.TagHandler.parseAtts(attr), m;

        
        if (/input/i.test(tagName)) { 
            if (!atts) atts = new Object();
            atts["type"] = new RegExp("^"+elem.type+"$");
        }
        
        var form_atts = form ? iMacros.player.TagHandler.parseAtts(form) :
            null;
        pos = iMacros.player.TagHandler.findPosition(elem, atts, form_atts);
        if (!pos) {
            var e = new Error("Can't find element position, atts="+
                              atts.toSource());
            Components.utils.reportError(e);
            iMacros.panel.showErrorMessage(e);
            return;
        }
        
        
        rec = "TAG";
        rec += " POS="+pos;
        rec += " TYPE="+type;
        rec += form ? " FORM="+form : "";
        rec += " ATTR="+attr;

        if (this.actions.length &&
            this.actions[this.actions.length-1].indexOf(rec) == 0) {
            
            
            
            this.actions.pop();
            iMacros.panel.removeLastLine();
        }
        rec += " CONTENT="+content_value;
        
        this.recordAction(rec);
        if (imns.Pref.getBoolPref("highlight")) {
            this.highlightElement(elem);
        }
    };


    
    MacroRecorder.prototype.onClick = function(e) {
        var elem = e.target;
        
        
        

        if (!elem || (elem.id && elem.id == "imacros-highlight-div"))
            return;
        
        if (e.button == 2) {    
            this.rclickTarget = elem;
        }
        
        if (e.button != 0)     
            return;
        
        this.recordTarget(elem);
    };


    MacroRecorder.prototype.recordTarget = function(elem) {
        var tagName = elem.tagName.toUpperCase();
        if (/^(?:select|option|textarea|form|html|body)$/i.test(tagName))
            return;
        else if (/^input$/i.test(tagName) &&
                 !/^(?:button|submit|radio|image)$/i.test(elem.type))
            return;

        
        this.checkForFrameChange(elem);
        
        var rec = "TAG", type = "" , pos = 0, form = null,
            attr = "", content_value = "";
        
        type = tagName;

        if (/^input$/i.test(tagName)) {
            type += ":"+elem.type.toUpperCase();
        }

        
        form = this.makeFormRecord(elem);
        
        attr = this.makeAttrRecord(elem);

        
        var atts = iMacros.player.TagHandler.parseAtts(attr);

        
        if (/input/i.test(tagName)) { 
            if (!atts) atts = new Object();
            atts["type"] = new RegExp("^"+elem.type+"$");
        }
        var form_atts = form ? iMacros.player.TagHandler.parseAtts(form) :
            null;
        pos = iMacros.player.TagHandler.findPosition(elem, atts, form_atts);
        if (!pos) {
            var e = new Error("Can't find element position, atts="+
                              atts.toSource());
            Components.utils.reportError(e);
            iMacros.panel.showErrorMessage(e.toString());
            return;
        }

        
        rec = "TAG";
        rec += " POS="+pos;
        rec += " TYPE="+type;
        rec += form ? " FORM="+form : "";
        rec += " ATTR="+attr;
        rec += content_value ? " CONTENT="+content_value : "";
        if (this.actions.length &&
            this.actions[this.actions.length-1] != rec) {
            
            
            this.recordAction(rec);
            if (imns.Pref.getBoolPref("highlight")) {
                this.highlightElement(elem);
            }
        }
    };


    
    MacroRecorder.prototype.escapeIdForSelector = function(id) {
        
        

        
        id = id.replace(/([!"#$%&'()*+\.\/:;<=>?@\[\\\]^`{|}~])/g, '\\$1');
        
        id = id.replace(/^(\d)/, '\\3$1 ');
        
        
        
        id = id.replace(/^-([0-9-])/, '\\-$1');
        
        
        id = id.replace(/[\t\n\v\f\r]/g, function(s) {
            
            
            return "\\"+s.charCodeAt(0).toString()+' ';
        });

        return id;
    };

    MacroRecorder.prototype.getSelectorForElement = function(el) {
        
        
        var selector = "", temp = el;
        while (temp.parentNode) {
            if (temp.id && this.favorId) {
                selector = "#"+
                    imns.escapeLine(this.escapeIdForSelector(temp.id))+
                    (selector.length ? ">"+selector : "");
                return selector;
            }

            var siblings = temp.parentNode.childNodes, count = 0;
            for (var i = 0; i < siblings.length; i++) {
                if (siblings[i].nodeType != Node.ELEMENT_NODE)
                    continue;
                if (siblings[i] == temp)
                    break;
                if (siblings[i].tagName == temp.tagName)
                    count++;
            }

            if (count) {
                selector = temp.tagName+
                    ":nth-of-type("+(count+1)+")"+
                    (selector.length ? ">"+selector : "");
            } else {
                selector = temp.tagName+
                    (selector.length ? ">"+selector : "");
            }

            temp = temp.parentNode;
        }

        return selector;
    };


    MacroRecorder.prototype.dumpEvent = function(event) {
        var s = [];
        for (var x in event) {
            if (/^[A-Z]/.test(x) || /^function/.test(event[x]))
                continue;
            s.push("event."+x+"="+event[x]);
        }
        console.log(s.join(", "));
    };


    MacroRecorder.prototype.getModifiers = function(event) {
          var modifiers = [];
        if (event.ctrlKey)
            modifiers.push("ctrl");
        if (event.altKey)
            modifiers.push("alt");
        if (event.shiftKey)
            modifiers.push("shift");
        if (event.metaKey)
            modifiers.push("meta");

        return modifiers.join("|");
    };


    MacroRecorder.prototype.isContentEvent = function(event) {
        return /^(?:https?|file)/.test(event.target.baseURI);
    };

    MacroRecorder.prototype.onMouseDown = function(event) {
        if (!this.isContentEvent(event))
            return;
        if (this.recordMode != "events") 
            return;
        this.checkForFrameChange(event.target);
        var selector = this.getSelectorForElement(event.target);
        this.prevTarget = selector;
        if (event.button == 0) {
            if (event.target.hasAttribute("draggable")) {
                
                
                
                
                
                return;
            } else {
                
                
                this.mousemoveListenerActive = true;
            }
        }

        var modifiers = this.getModifiers(event);
        this.recordAction(
            "EVENT TYPE=MOUSEDOWN SELECTOR=\""+selector+"\""+
                " BUTTON="+event.button+
                (modifiers.length ? " MODIFIERS=\""+modifiers+"\"" : "")
        );
    };


    MacroRecorder.prototype.onMouseUp = function(event) {
        if (!this.isContentEvent(event))
            return;
        if (this.recordMode != "events") 
            return;
        this.mousemoveListenerActive = false;
        this.checkForFrameChange(event.target);
        var selector = this.getSelectorForElement(event.target);
        this.prevTarget = selector;
        this.recordAction(
            
            "EVENT TYPE=MOUSEUP POINT=\"("+event.pageX+","+event.pageY+")\""
            
        );
    };


    MacroRecorder.prototype.checkForPdfLink = function(event) {
        if (event.button != 0)
            return;

        var elem = event.target;
        if (!elem.href || !/\.pdf(?:\.gz)?$/i.test(elem.href))
            return;

        var do_download = true;
        if (imns.Pref.getBoolPref("show-pdflink-dialog")) { 
            var msg = "iMacros detected you clicked on a PDF link. Do you want iMacros to download this document?";
            var check_msg = "Show this dialog next time";
            var check = {value: true};
            do_download = imns.Dialogs.confirmCheck(
                "iMacros", msg, check_msg, check
            );
            imns.Pref.setBoolPref("show-pdflink-dialog", check.value);
            if (!check.value) {
                imns.Pref.setBoolPref("download-pdf-files", do_download);
            }
        } else {
            do_download = imns.Pref.getBoolPref("download-pdf-files");
        }

        if (do_download) {
            var rec = "ONDOWNLOAD FOLDER=* "+
                "FILE=+_{{!NOW:yyyymmdd_hhnnss}} WAIT=YES";
            this.recordAction(rec);
            event.preventDefault();
            event.stopPropagation();
        }
    };
    

    MacroRecorder.prototype.onMouseClick = function(event) {
        if (!this.isContentEvent(event))
            return;

        this.checkForPdfLink(event);

        if (this.recordMode == "conventional") {
            this.onClick(event);
            return;
        } else if (this.recordMode == "xy") {
            this.recordAction("CLICK X="+event.pageX+" Y="+event.pageY);
            return;
        } else if (this.recordMode != "events") {
            return;
        }
        
        if (this.actions.length < 2)
            return;
        var selector = this.getSelectorForElement(event.target);
        var modifiers = this.getModifiers(event);
        var mdown_action = "EVENT TYPE=MOUSEDOWN SELECTOR=\""+selector+"\"";
        var mup_action = "EVENT TYPE=MOUSEUP";
        if (this.actions[this.actions.length-2].indexOf(mdown_action) == 0 &&
            this.actions[this.actions.length-1].indexOf(mup_action) == 0) {
            this.prevTarget = selector;
            this.actions.pop();
            this.actions.pop();
            iMacros.panel.removeLastLine();
            iMacros.panel.removeLastLine();
            this.recordAction(
                "EVENT TYPE=CLICK SELECTOR=\""+selector+"\""+
                    " BUTTON="+event.button+
                    (modifiers.length ? " MODIFIERS=\""+modifiers+"\"" : "")
            );
            if (imns.Pref.getBoolPref("highlight")) {
                this.highlightElement(event.target);
            }
        }
    };


    MacroRecorder.prototype.onMouseDblClick = function(event) {
        if (!this.isContentEvent(event))
            return;
        if (this.recordMode != "events") 
            return;
        
        if (this.actions.length < 2)
            return;
        var selector = this.getSelectorForElement(event.target);
        var modifiers = this.getModifiers(event);
        var click_action = "EVENT TYPE=CLICK SELECTOR=\""+selector+"\"";
        if (this.actions[this.actions.length-2].indexOf(click_action) == 0 &&
            this.actions[this.actions.length-1].indexOf(click_action) == 0) {
            this.prevTarget = selector;
            this.actions.pop();
            this.actions.pop();
            iMacros.panel.removeLastLine();
            iMacros.panel.removeLastLine();
            this.recordAction(
                "EVENT TYPE=DBLCLICK SELECTOR=\""+selector+"\""+
                    " BUTTON="+event.button+
                    (modifiers.length ? " MODIFIERS=\""+modifiers+"\"" : "")
            );
        }
    };


    MacroRecorder.prototype.onMouseMove = function(event) {
        if (!this.isContentEvent(event))
            return;
        if (this.recordMode != "events") 
            return;
        
        if (!this.mousemoveListenerActive)
            return;

        var selector = this.getSelectorForElement(event.target);
        var modifiers = this.getModifiers(event);

        
        var re = new RegExp('^events? type=mousemove\\b.+'+
                            '\\points?="(\\S+)"', "i");
        
        if (this.actions.length && this.prevTarget == selector) {
            var prev_action = this.actions[this.actions.length-1];
            var m = re.exec(prev_action);
            if ( m ) {
                
                this.actions.pop();
                iMacros.panel.removeLastLine();
                
                
                
                
                
                
                this.recordAction(
                    "EVENTS TYPE=MOUSEMOVE SELECTOR=\""+selector+"\""+
                        " POINTS=\""+m[1].toString()+",("+event.pageX+","+
                        event.pageY+")\""+
                        (modifiers.length ?
                         " MODIFIERS=\""+modifiers+"\"" : "")
                );

                return;
            }
        }

        this.prevTarget = selector;
        this.recordAction(
            "EVENT TYPE=MOUSEMOVE SELECTOR=\""+selector+"\""+
                " POINT=\"("+event.pageX+","+event.pageY+")\""+
                (modifiers.length ? " MODIFIERS=\""+modifiers+"\"" : "")
        );
    };


    MacroRecorder.prototype.onDragEvents = function(event) {
        if (this.recordMode != "events") 
            return;
        this.dumpEvent(event);
    };

    MacroRecorder.prototype.onKeyDown = function(event) {
        
        
        return;

        
        
        
        
        
        
        
        
        
        
        
        
        
    };



    MacroRecorder.prototype.onKeyUp = function(event) {
        
        
        return;
        
        
        
        
        
        
        
        
        
        
        
        
        
        
    };


    MacroRecorder.prototype.onKeypress = function(event) {
        if (!this.isContentEvent(event))
            return;

        if (this.recordMode == "conventional") {
            this.onKeypressInConvMode(event);
            return;
        } else if (this.recordMode != "events") {
            return;
        }

        this.checkForFrameChange(event.target);

        var selector = this.getSelectorForElement(event.target);
        var modifiers = this.getModifiers(event);
        var use_char = !!(event.which && event.charCode), char = "", key;
        if (use_char) {
            char = String.fromCharCode(event.which);
        } else {
            key = event.keyCode;
        }

        
        
        var is_encryptable = event.target.type == "password" && use_char;
        if (is_encryptable) {
            var pm = imns.getPasswordManager();
            if (this.showPwdDialog) {
                if (pm.encryptionType != pm.TYPE_NONE) {
                    if (pm.encryptionType ==  pm.TYPE_STORED) {
                        this.password = pm.getMasterPwd();
                    } else if (pm.encryptionType ==  pm.TYPE_TEMP) {
                        this.password = pm.getSessionPwd();
                    } 
                    this.encrypt = this.password ?
                        this.showPasswordDialog2() :
                        this.showPasswordDialog();
                }
                var enc_type;
                if (pm.encryptionType == pm.TYPE_NONE || !this.encrypt) {
                    this.password = ""; this.encrypt = false;
                    enc_type = "SET !ENCRYPTION NO"; 
                } else if (pm.encryptionType == pm.TYPE_STORED) {
                    this.password = pm.getMasterPwd();
                    enc_type = "SET !ENCRYPTION STOREDKEY"; 
                } else if (pm.encryptionType == pm.TYPE_TEMP) {
                    this.password = pm.getSessionPwd();
                    enc_type = "SET !ENCRYPTION TMPKEY"; 
                }
                this.recordAction(enc_type);
                this.showPwdDialog = false;
            }
        }

        

        const strre = "\"(?:[^\"\\\\]|\\\\[0btnvfr\"\'\\\\])*\"";
        var re = new RegExp('^events? type=keypress\\b.+'+
                            '\\b(key|char)s?=(\\d+|'+strre+')'+
                            '(?:modifiers="(\\S+)")?'
                            , "i");

        if (this.actions.length && this.prevTarget == selector) {
            var prev_action = this.actions[this.actions.length-1];
            var m = re.exec(prev_action);
            var matches = m &&
                (use_char ? m[1] == "CHAR" :
                 (m[1] == "KEY" &&
                  (modifiers ? m[3] == modifiers : !m[3]))
                );
            
            if (matches) {
                
                this.actions.pop();
                iMacros.panel.removeLastLine();

                var chars = imns.unwrap(m[2]), keys = [];
                if (!use_char) { 
                    if (/^\d+$/.test(chars))
                        keys = [parseInt(chars)];
                    else if (/^\[/.test(chars)) {
                        keys = JSON.parse(chars);
                    }
                    keys.push(key);
                } else if (is_encryptable && this.encrypt) {
                    
                    try {
                        chars = Rijndael.decryptString(chars, this.password);
                    } catch (e) {
                        
                        
                        this.stop();
                        iMacros.panel.showErrorMessage(
                            "Encryption type or stored password was changed"+
                                " while recording!"
                        );
                        return;
                    }
                    chars = Rijndael.encryptString(chars.concat(char),
                                                   this.password) ;
                } else if (use_char) {
                    chars = chars.concat(char);
                } 

                this.recordAction(
                    "EVENTS TYPE=KEYPRESS SELECTOR=\""+selector+"\""+
                        (use_char? " CHARS=\""+imns.escapeLine(chars)+"\"" :
                         (" KEYS=\""+JSON.stringify(keys)+"\""+
                          (modifiers.length ?
                           " MODIFIERS=\""+modifiers+"\"" : "")
                         )
                        )
                );
                if (imns.Pref.getBoolPref("highlight")) {
                    this.highlightElement(event.target);
                }
                return;
            }
        }
            
        this.prevTarget = selector;

        
        if (is_encryptable && this.encrypt) {
            char = Rijndael.encryptString(char, this.password);
        }

        this.recordAction(
            "EVENT TYPE=KEYPRESS SELECTOR=\""+selector+"\""+
                (use_char? " CHAR=\""+imns.escapeLine(char)+"\"" :
                 (" KEY="+key+
                  (modifiers.length ? " MODIFIERS=\""+modifiers+"\"" : "")
                 )
                )
        );
        if (imns.Pref.getBoolPref("highlight")) {
            this.highlightElement(event.target);
        }
    };

    MacroRecorder.prototype.onEvent = function(event) {
        if (!this.isContentEvent(event))
            return;
        if (this.recordMode != "events") 
            return;
        if (event.type == "mousemove" && !event.buttons)
            return;
        this.dumpEvent(event);
    };

    
    return new MacroRecorder();

}) ();
