



let {imns} = Components.utils.import("resource://imacros/utils.js");
 
 
var DownloadDlgHook = {
    
    get storage() {
        var str = null;
        try {
            str = imns.Cc["@iopus.com/storage;1"];
            str = str.getService(imns.Ci.nsISupports);
            str = str.wrappedJSObject;
            return str;
        } catch (e) {
            Components.utils.reportError(e);
            throw "Can't instantiate Storage!";
        }
    },
    
    get opener() {
        if (!this.m_opener) {
            var wm = imns.Cc["@mozilla.org/appshell/window-mediator;1"]
                .getService(imns.Ci.nsIWindowMediator);
            var win = wm.getMostRecentWindow("navigator:browser");
            this.m_opener = win;

        }
        return this.m_opener;
    },

    
    get playing() {
        return this.opener.iMacros.playing;
    },

    
    get recording() {
        return this.opener.iMacros.recording;
    },

    
    onAccept: function() {
        this.accept = true;
        dialog.onOK();
    },


    onCancel: function() {
        this.accept = false;
        dialog.onCancel();
    },

    
    hookButtons: function() {
        var dlg = document.documentElement;
        dlg.setAttribute("ondialogaccept",
                         "return DownloadDlgHook.onAccept()");
        dlg.setAttribute("ondialogcancel",
                         "return DownloadDlgHook.onCancel()");
    },

    
    showMessage: function (msg) { 
        var con = document.getElementById("container");
        var hbox = document.createElement("hbox");
        var hbox_label = document.createElement("hbox");
        var hbox_image = document.createElement("hbox");
        var el = document.createElement("label");
        var image = document.createElement("image");
        
        hbox.setAttribute("id", "imacros-commdlg-message");
        hbox.setAttribute("align", "center");
        hbox.appendChild(hbox_label);
        hbox.appendChild(image);
        hbox_label.setAttribute("pack", "center");
        hbox_label.setAttribute("flex", "1");
        hbox_label.appendChild(el);
        
        el.setAttribute("value", msg);
        image.setAttribute("id", "imacros-commdlg-image");
        
        con.insertBefore(hbox, con.firstChild);
    },


    init: function() {
        if (this.recording) {
            this.hookButtons();
            this.showMessage(imns.strings("imacrosrecordingdialog"));
        } else if (this.playing) {
            this.action = this.storage.
                getObjectForWindow(this.opener.iMacros.wid, "onDownloadAction");
            this.showMessage(imns.strings("imacrosreplayingdialog"));
            
            this.filename = this.action.filename;
            var t = null;
            var loc = document.getElementById("location");
            if (this.filename == "*") {
                this.filename = loc.value;
            } else if (t = this.filename.match(/^\+(.+)/)) {
                if (/\..*$/.test(loc.value))
                    this.filename = loc.value.replace(/(.+)(\..*)$/,
                                                      "$1"+t[1]+"$2");
                else 
                    this.filename = loc.value+t[1];
            } else if (!/\.[^\.]+$/.test(this.filename)) {
		this.filename += loc.value.replace(/(?:.+)(\.[^\.]+)$/, "$1");
	    }
            loc.value = this.filename;
            this.timer = imns.Cc["@mozilla.org/timer;1"].
                createInstance(imns.Ci.nsITimer);
            this.timer.initWithCallback(this, this.action.timeout,
                                        imns.Ci.nsITimer.TYPE_ONE_SHOT);
        }
    },

    
    notify: function(timer) {
        
        this.storage.clearWindowObject(this.opener.iMacros.wid,
                                       "onDownloadAction");
        this.timer = null;

        var folder = this.action.folder, new_loc;
        if (folder == "*") {
            new_loc = imns.Pref.getFilePref("defdownpath");
        } else {
            new_loc = imns.FIO.openNode(folder);
        }
        new_loc.append(this.filename);
        
        if (this.action.accept) {
            
            
            dialog.mLauncher.saveToDisk(new_loc, false);
            dialog = null;
            window.close();
        } else {
            document.documentElement.cancelDialog();
        }
    },

    
    handleEvent: function(evt) {
        if (evt.type == "load") {
            window.removeEventListener("load", this, true);
            window.addEventListener("unload", this, true);
            
            if (!this.recording && !this.playing)
                return;
            this.init();
        } else if (evt.type == "unload") {
            window.removeEventListener("unload", this, true);
            
            if ((this.recording && this.accept) || this.playing) {
                imns.osvc.notifyObservers(this.opener, "imacros-download-hook",
                                          null);
            }
        }
    }
};


window.addEventListener("load", DownloadDlgHook, true);
