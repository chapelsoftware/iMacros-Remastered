



iMacros.panel = (function() {
    let {imns} = Components.utils.import("resource://imacros/utils.js");
    
    
    function iMacrosControlPanel() {
        this._statLine1 = "";
        this._statLine2 = "";
        this._statLine3 = "";
        this._statLine1Status = "";
        this._statLine2Status = "";
        this._statLine3Status = "";
        this._errorMessage = "";
        this._infoMessage = "";
        this._mboxType = "message";
        this._mboxStatus = "closed";
        this._currentLoop = 1;
        this._currentLine = 0;
        this.sidebar = null;
        this.registerObservers();
    }


    
    iMacrosControlPanel.prototype.registerObservers = function () {
        imns.osvc.addObserver(this, "imacros-sidebar-loaded", false);
        imns.osvc.addObserver(this, "imacros-sidebar-closed", false);
    };


    iMacrosControlPanel.prototype.unregisterObservers = function () {
        imns.osvc.removeObserver(this, "imacros-sidebar-loaded", false);
        imns.osvc.removeObserver(this, "imacros-sidebar-closed", false);
    };

    window.addEventListener("unload", function () {
        iMacros.panel.unregisterObservers();
    }, false);


    iMacrosControlPanel.prototype.observe = function (subject, topic, data) {
        
        if (topic == "imacros-sidebar-loaded") {
            var t = document.getElementById("sidebar").contentWindow;
            var sidebar_url = "chrome://imacros/content/iMacrosSidebar.xul";
            if (t.location.href != sidebar_url) 
                return;
            if (t == subject) {
                
                if (this.panelIsOpen)
                    this.closePanel();
                
                this.sidebar = subject;
                this.sidebar.mainwindow = window;
                if (this.treeViewState) {
                    var mtree = this.sidebar.getMTreeObject();
                    mtree.applyState(this.treeViewState);
                }
                
                if (this.sidebarIsOpening)
                    this.sidebarIsOpening = false;
                if (this.sidebarLoadedCallback) {
                    this.sidebarLoadedCallback();
                    this.sidebarLoadedCallback = null;
                }
            }
        } else if (topic == "imacros-sidebar-closed") {
            if (subject != window)
                return;
            this.treeViewState = JSON.parse(data);
            this.sidebar = null;
        }
        this.updateControlPanel();
    };
    
    iMacrosControlPanel.prototype.ensureSidebarIsOpen = function(callback) {
        var broadcaster = document.getElementById("imacros_ControlPanel");
        var checked = broadcaster.getAttribute("checked") == "true";
        if (this.sidebarIsOpen) {
            setTimeout(callback, 0);
        } else if (!this.sidebarIsOpening) {
            this.sidebarLoadedCallback = callback;
            if (!checked) {        
                imns.Pref.setBoolPref("close-sidebar", true);
                this.sidebarIsOpening = true;
                toggleSidebar("imacros_ControlPanel");
                
                setTimeout(function() {
                    if (!iMacros.panel.sidebarIsOpen)
                        iMacros.panel.ensureSidebarIsOpen(callback);
                }, 200);
            }
        }
    };

    iMacrosControlPanel.prototype.closeSidebar = function() {
        if (!this.sidebar)
            return;
        toggleSidebar("imacros_ControlPanel");
    };
    
    iMacrosControlPanel.prototype.
        __defineGetter__("sidebarIsOpen", function () {
            return !!this.sidebar;        
        });


    iMacrosControlPanel.prototype.showPanel = function() {
        if (!this.panelIsOpen)
            this.panel.openPopup(
                document.getElementById('imacros-toggle-button'),
                "after_end", 0, 0,
                false, false, null);
    };
    
    iMacrosControlPanel.prototype.
        __defineGetter__("panelIsOpen", function() {
            return (this.panel.state == "open" ||
                    this.panel.state == "showing");
        });


    iMacrosControlPanel.prototype.
        __defineGetter__("list", function () {
            if (this.sidebarIsOpen) {
                var doc = this.sidebar.document;
                var list = doc.getElementById('listbox');
                return list;
            }
            return null;
        });

    
    iMacrosControlPanel.prototype.showLines = function(code) {
        try {
            if (!this.sidebarIsOpen)
                return;
            var doc = this.sidebar.document;
            
            this.clearAllLines();
            
            if (code) {
                var lines = code.split("\n");
                for(var i = 0; i < lines.length; i++) {
                    this.list.appendItem(imns.str.trim(lines[i]));
                }
            }
            
            var deck = doc.getElementById("tree-box-deck");
            deck.selectedIndex = 1;
            var edit = doc.getElementById('editname');
            var rename = doc.getElementById('im-rename-button');
            edit.collapsed = true;
            rename.collapsed = true;

            
            this.list.scrollToIndex(0);
        } catch(e) {
            Components.utils.reportError(e);
        }
    };


    
    iMacrosControlPanel.prototype.addLine = function(line) {
        try {
            if (iMacros.recording) {
                this.statLine3 = this._statLine3.replace(
                        /(\s+\(\d+\))?$/,
                    " ("+iMacros.recorder.actions.length+")"
                );
            }
            if (!this.sidebarIsOpen)
                return;
            this.list.appendItem(line);
            var count = this.list.getRowCount();
            this.list.ensureIndexIsVisible(count-1);
        } catch(e) {
            Components.utils.reportError(e);
        }
    };

    iMacrosControlPanel.prototype.removeLastLine = function() {
        if (iMacros.recording) {
            this.statLine3 = this._statLine3.replace(
                    /(\s+\(\d+\))?$/,
                " ("+iMacros.recorder.actions.length+")"
            );
        }
        if (!this.sidebarIsOpen)
            return;
        this.list.removeItemAt(this.list.getRowCount()-1);
    };

    iMacrosControlPanel.prototype.highlightLine = function(line) {
        if (!line)
            return;
        this._currentLine = line;
        if (this.sidebarIsOpen) {
            this.statLine1 = imns.strings('imacrosreplaystep')+(line);
            this.list.ensureIndexIsVisible(line-1);
            this.list.selectedIndex = line-1;
        } else if (this.panelIsOpen) {
            this.statLine3 = this._statLine3.
                replace(/(\s+\(\d+\))?$/, " ("+line+")");
        }
    };

    
    iMacrosControlPanel.prototype.clearAllLines = function() {
        if (!this.sidebarIsOpen)
            return;
        while(this.list.getRowCount())
            this.list.removeChild(this.list.firstChild);    
    };



    iMacrosControlPanel.prototype.__defineSetter__(
        "statLine1", function(str) {
            this._statLine1 = str;
            if (this.sidebarIsOpen) {
                var doc = this.sidebar.document;
                var stat = doc.getElementById('replaystat');
                stat.value = str;
            } else { 
                var stat = document.getElementById(
                    "imacros-info-panel-status2"
                );
                
                
                if (/^Waiting:\s+\d+/.test(str)) {
                    stat.setAttribute("state", "waiting");
                    stat.value = str;
                } else {
                    stat.removeAttribute("state");
                    stat.value = "";
                }
            }
        }
    );


    iMacrosControlPanel.prototype.__defineSetter__(
        "statLine1Status", function(val) {
            this._statLine1Status = val;
            if (this.sidebarIsOpen) {
                var doc = this.sidebar.document;
                var stat = doc.getElementById('replaystat');
            } else { 
                var stat = document.getElementById(
                    "imacros-info-panel-status2"
                );
            }

            if (/playing|recording/.test(val.toString())) {
                stat.setAttribute("status", val);
            } else {
                stat.value = "";
                stat.removeAttribute("status");
            }

        }
    );

    iMacrosControlPanel.prototype.__defineSetter__(
        "statLine2", function(str) {
            this._statLine2 = str;
            if (this.sidebarIsOpen) {
                var doc = this.sidebar.document;
                var stat = doc.getElementById('delaystat');
            } else { 
                var stat = document.getElementById(
                    "imacros-info-panel-status2"
                );
            }
            stat.value = str;
        }
    );

    iMacrosControlPanel.prototype.__defineSetter__(
        "statLine2Status", function(val) {
            this._statLine2Status = val;
            if (this.sidebarIsOpen) {
                var doc = this.sidebar.document;
                var stat = doc.getElementById('delaystat');
            } else { 
                var stat = document.getElementById(
                    "imacros-info-panel-status2"
                )
            }

            if ("loading" == val.toString()) {
                stat.setAttribute("state", "loading");
            } else {
                stat.value = "";
                stat.removeAttribute("state");
            }
        }
    );


    iMacrosControlPanel.prototype.__defineSetter__(
        "statLine3", function(str) {
            this._statLine3 = str;
            if (!this.sidebarIsOpen) {
                var stat = document.getElementById(
                    "imacros-info-panel-status3"
                );
                stat.value = str;
            }
        }
    );

    iMacrosControlPanel.prototype.__defineSetter__(
        "statLine3Status", function(val) {
            this._statLine3Status = val;
            if (this.sidebarIsOpen)
                return;
            
        }
    );


    iMacrosControlPanel.prototype.__defineGetter__(
        "panel", function() {
            return document.getElementById('imacros-info-panel');
        }
    );
    
    iMacrosControlPanel.prototype.closePanel = function() {
        if (this.panelIsOpen)
            this.panel.hidePopup();
    };

    iMacrosControlPanel.prototype.onPanelClick = function() {
        if (this.panelIsOpen)
            this.panel.hidePopup();
        if (!this.sidebarIsOpen) 
            toggleSidebar("imacros_ControlPanel");
    };
    
    
    iMacrosControlPanel.prototype.showMacroTree = function() {
        this.statLine1Status = "idle";
        this.statLine2Status = "idle";
        this.statLine3Status = "idle";
        if (this.panelIsOpen) {
            
            if (this._mboxStatus != "open") {
                var self = this;
                this.closePanelTimeout = setTimeout(function() {
                    self.closePanelTimeout = null;
                    self.closePanel();
                }, 2000);
            }
        } if (this.sidebarIsOpen) {
            var doc = this.sidebar.document;
            var deck = doc.getElementById("tree-box-deck");
            deck.selectedIndex = 0;
            if (imns.Pref.getBoolPref("close-sidebar")) {
                imns.Pref.setBoolPref("close-sidebar", false);
                this.closeSidebar();
            }
        }
        this.updateControlPanel();
    };
    
    
    iMacrosControlPanel.prototype.__defineGetter__(
        "selectedItem", function() {
            if (!this.sidebarIsOpen)
                return null;
            var mtree = this.sidebar.getMTreeObject();
            return mtree.getSelectedItem();
        }
    );
    
    iMacrosControlPanel.prototype.updateMacroTree = function() {
        if(this.sidebarIsOpen) {
            this.sidebar.initMTree();
        }
    };

    iMacrosControlPanel.prototype.updateControlPanel = function() {
        if (this.sidebarIsOpen) {
            this.updateSidebarState();
        } else {
            var __x = function(btns, state) {
                if (typeof btns == "string")
                    btns = [btns];
                
                for (let n = 0; n < btns.length; n++) {
                    let btn = document.getElementById(
                        "imacros-info-panel-"+btns[n]+"-button"
                    );
                    btn.collapsed = state;
                }
            };

            var on = function(btns) { __x(btns, null); };
            var off = function(btns) { __x(btns, true); };
            
            if (iMacros.playing ||
                iMacros.jsplaying ||
                iMacros.recording ||
                iMacros.paused == "playing" ||
                iMacros.paused == "jsplaying" ||
                iMacros.paused == "recording" 
               ) {
                
                if (!this.panelIsOpen) {
                    this.showPanel();
                } else if (this.closePanelTimeout) {
                    clearTimeout(this.closePanelTimeout)
                    this.closePanelTimeout = null;
                }
            } else {
                
                
                this.statLine3 = this._statLine3.
                    replace(/(?:\s+\(\d+\))$/, "");
                on(["play", "record"]);
                off(["pause", "stop"]);
                return;
            }

            let pause_btn = document.getElementById(
                "imacros-info-panel-pause-button"
            );

            if (iMacros.paused == "playing" ||
                       iMacros.paused == "jsplaying") {
                on(['pause', 'stop']);
                off(['play', 'record']);
                pause_btn.setAttribute("icon", "play");
                pause_btn.setAttribute("label", "Continue");
            } else if (iMacros.paused == "recording") {
                on(['stop', 'pause']);
                off(['play', 'record']);
                pause_btn.setAttribute("icon", "record");
                pause_btn.setAttribute("label", "Continue");
            } else if (iMacros.playing ||
                       iMacros.jsplaying) {
                
                this.statLine3 = this._statLine3.
                    replace(/(\s+\(\d+\))?$/, " ("+this._currentLine+")");
                on(['pause', 'stop']);
                off(['play', 'record']);
                pause_btn.setAttribute("icon", "pause");
                pause_btn.setAttribute("label", "Pause");
            } else if (iMacros.recording) {
                this.statLine3 = this._statLine3.replace(
                        /(\s+\(\d+\))?$/,
                    " ("+iMacros.recorder.actions.length+")"
                );
                on(['stop', 'pause']);
                off(['play', 'record']);
                pause_btn.setAttribute("icon", "pause");
                pause_btn.setAttribute("label", "Pause");
            }
        }
        this.statLine1 = this._statLine1;
        this.statLine1Status = this._statLine1Status;
        this.statLine2 = this._statLine2;
        this.statLine2Status = this._statLine2Status;
        this.statLine3 = this._statLine3;
        this.statLine2Status = this._statLine3Status;
        if (this._mboxStatus == "open") {
            if (this._mboxType == "error")
                this.showErrorMessage(this._errorMessage, this.mboxErrorNumber);
            else if (this._mboxType == "message")
                this.showInfoMessage(this._infoMessage);
        }
    };

    iMacrosControlPanel.prototype.updateSidebarState = function() {
        if (!this.sidebarIsOpen)
            return;
        var doc = this.sidebar.document;
        var deck = doc.getElementById("tree-box-deck");

        var makeObject  = function (constructor ) {
            var obj = new Object();
            for (var x = 1; x < arguments.length; x++)
                obj[arguments[x]] = constructor(arguments[x]);
            return obj;
        };
        
        var butts = makeObject(
            function (name) {
                return doc.getElementById("im-"+name+"-button");
            },
            
            "play", "pause", "stopplay", "playloop",
            
            "record", "save", "stoprecord", "waitreplay",
            
            "edit", "share", "local-test", "online-test", "af-upload"
        );
        
        var tabs = makeObject( function (name) {
            return doc.getElementById("im-"+name+"-tab");
        }, "play", "record", "edit");
        
        var off = function(obj ) {
            for (var x = 1; x < arguments.length; x++)
                obj[arguments[x]].disabled = true;
        };
        var on = function(obj ) {
            for (var x = 1; x < arguments.length; x++)
                obj[arguments[x]].disabled = null;
        };
        
        var tabbox = doc.getElementById("im-tabbox");
        if (iMacros.playing || iMacros.jsplaying ||
            iMacros.paused == "playing" || iMacros.paused == "jsplaying") {
            
            off(butts, "play", "playloop");
            on(butts, "pause", "stopplay");
            off(tabs, "record", "edit");
            tabbox.selectedIndex = 0;
            butts["pause"].label = iMacros.paused ?
                imns.strings('imacrospausestate2') :
                imns.strings('imacrospausestate1');
            
            if (deck.selectedIndex != 1) {
                if (iMacros.playing) 
                    this.showLines(iMacros.player.source);
                else if (iMacros.jsplaying)
                    this.showLines(iMacros.jssrc);
                this.highlightLine(this.currentLine);
            }
        } else if (iMacros.recording || iMacros.paused == "recording") {
            
            off(butts, "record", "save");
            on(butts, "stoprecord", "waitreplay");
            off(tabs, "play", "edit");
            tabbox.selectedIndex = 1;
            
            if (deck.selectedIndex != 1) {
                this.showLines(iMacros.recorder.getRecordedMacro());
            }
        } else {
            
            on(tabs, "play", "record", "edit");
            var item = this.selectedItem;
            if (item && !item.isContainer) {
                on(butts, "play", "playloop",
                   "save", "edit", "share",
                   "local-test", "online-test", "af-upload");
            } else {
                off(butts, "play", "playloop",
                    "save", "edit", "share",
                    "local-test", "online-test", "af-upload");
            }
            on(butts, "record");
            off(butts, "pause", "stopplay", "stoprecord", "waitreplay");
            deck.selectedIndex = 0;
        }
        
        var rec_mode = imns.Pref.getCharPref("record-mode");
        var elem = doc.getElementById("im-record-label");
        if (elem) {
            if (rec_mode == "auto")
                elem.value="Auto";
            else if (rec_mode == "conventional")
                elem.value="HTM";
            else if (rec_mode == "events") 
                elem.value = "Event";
            else {
                elem.value = "Auto";
                imns.Pref.setCharPref("record-mode", "auto");
            }
        }
        
    };

    iMacrosControlPanel.prototype.mboxClose = function () {
        this.mboxClearMessage();
        if (this.panelIsOpen) {
            this.closePanel();
        }
    };

    iMacrosControlPanel.prototype.mboxHelp = function () {
        if (this.mboxErrorNumber == 31415)
            iMacros.addTab(
                "http://rd.imacros.net/redirect.aspx?type=FX&"+
		    imacros_version+
		    "&helpid=macrotoolong"
            );
        else
            iMacros.addTab(
                "http://www.iopus.com/imacros/home/fx/e.asp?browser=fx&error="
                    +this.mboxErrorNumber
            );
    };

    iMacrosControlPanel.prototype.mboxEdit = function () {
        var macro = iMacros.currentMacro;
        if (!macro.path) {      
            
            var t = imns.Cc["@mozilla.org/file/directory_service;1"]
                .getService(imns.Ci.nsIProperties)
                .get("TmpD", imns.Ci.nsILocalFile);
            
            
            
            t.append("iMacros_tmpfile.iim");
            imns.FIO.writeTextFile(t, iMacros.player.source);
            macro.path = t.path;
        }
        iMacros.edit(macro, this.mboxErrorLine);
    };
    
    
    iMacrosControlPanel.prototype.mboxResetError = function () {
        if (this._mboxType != "error")
            return;
        this.mboxClearMessage();
    };

    iMacrosControlPanel.prototype.mboxClearMessage = function () {
        if (this.sidebarIsOpen) {
            var doc = this.sidebar.document;
            var box = doc.getElementById("imacros-message-box");
            var deck = doc.getElementById("logo-message-deck");
            if (deck.selectedIndex == 0) {
                deck.selectedIndex = 1;
            }
        } else if (this.panelIsOpen) {
            document.getElementById("imacros-message-box-container").
                collapsed = true;
        }
        this._mboxType = "message";
        this._mboxStatus = "closed";
        this._errorMessage = "";
        this._infoMessage = "";
    };


    iMacrosControlPanel.prototype.showInfoMessage = function (msg) {
        this._infoMessage = msg;
        this._mboxType = "message";
        this._mboxStatus = "open";

        if (this.sidebarIsOpen) {
            var doc = this.sidebar.document;
            
            var tabbox = doc.getElementById("im-tabbox");
            tabbox.selectedIndex = 0;
            var deck = doc.getElementById("logo-message-deck");
            deck.selectedIndex = 0;
            var msgbox = doc.getElementById("imacros-message-box");
            var help_btn = doc.getElementById("message-box-button-help");
            var edit_btn = doc.getElementById("message-box-button-edit");
            help_btn.collapsed = true;
            edit_btn.collapsed = true;
            msgbox.setAttribute("msgtype", this._mboxType);
            msgbox.value = msg;
        } else {
            if (!this.panelIsOpen)
                this.showPanel();
            var con = document.getElementById(
                "imacros-message-box-container"
            );
            con.collapsed = null;

            var msgbox = document.getElementById("imacros-message-box");
            var help_btn = document.getElementById(
                "imacros-message-box-button-help"
            );
            var edit_btn = document.getElementById(
                "imacros-message-box-button-edit"
            );
            help_btn.collapsed = true;
            edit_btn.collapsed = true;
            msgbox.setAttribute("msgtype", this._mboxType);
            msgbox.value = msg;
        }
    };


    iMacrosControlPanel.prototype.showErrorMessage = function (msg, errnum) {
        if (errnum && !/\(error code: -?\d+\)$/i.test(msg)) {
            msg += " (Error code: "+errnum+")";
        }

        this._errorMessage = msg;
        this._mboxType = "error";
        this._mboxStatus = "open";
        if (this.sidebarIsOpen) {
            var doc = this.sidebar.document;
            
            var tabbox = doc.getElementById("im-tabbox");
            tabbox.selectedIndex = 0;
            var deck = doc.getElementById("logo-message-deck");
            deck.selectedIndex = 0;
            var msgbox = doc.getElementById("imacros-message-box");
            var help_btn = doc.getElementById("message-box-button-help");
            var edit_btn = doc.getElementById("message-box-button-edit");
            help_btn.collapsed = null;
            edit_btn.collapsed = null;
            msgbox.setAttribute("msgtype", this._mboxType);
            msgbox.value = msg;
        } else {
            if (!this.panelIsOpen)
                this.showPanel();
            var con = document.getElementById(
                "imacros-message-box-container"
            );
            con.collapsed = null;
            var msgbox = document.getElementById("imacros-message-box");
            var help_btn = document.getElementById(
                "imacros-message-box-button-help"
            );
            var edit_btn = document.getElementById(
                "imacros-message-box-button-edit"
            );
            help_btn.collapsed = null;
            edit_btn.collapsed = null;
            msgbox.setAttribute("msgtype", this._mboxType);
            msgbox.value = msg;
        }
        this.mboxErrorNumber = errnum;
        this.mboxErrorLine = 0;
        if (/, line\s*(\d+)(?:\s+\(.*\))?$/.test(msg))
            this.mboxErrorLine = parseInt(RegExp.$1);
    };



    
    iMacrosControlPanel.prototype.onLoopValueInput = function () {
        var textbox =
            this.sidebar.document.getElementById('im-loopval-textbox');
        textbox.value = textbox.value.replace(/^0+|[^\d]/g, "");
    };

    iMacrosControlPanel.prototype.onLoopValueChange = function () {
        var textbox =
            this.sidebar.document.getElementById('im-loopval-textbox');
        if (!textbox.value.length)
            textbox.value = "3";
    };

    
    iMacrosControlPanel.prototype.__defineGetter__(
        "maxLoopValue", function() {
            if (!this.sidebarIsOpen)
                return this._maxLoopValue;
            var doc = this.sidebar.document;
            var value = doc.getElementById('im-loopval-textbox');
            return (this._maxLoopValue = imns.s2i(value.value));
        }
    );


    iMacrosControlPanel.prototype.__defineSetter__(
        "currentLoopValue", function(val) {
            this._currentLoopValue = val;
            if (!this.sidebarIsOpen)
                return;
            var doc = this.sidebar.document;
            var value = doc.getElementById('im-curloop-textbox');
            value.value = val;
        }
    );


    return new iMacrosControlPanel(); 

}) ();
