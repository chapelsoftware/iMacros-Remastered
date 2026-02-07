



iMacros.CommonDialogHook = ( function () {
    let {imns} = Components.utils.import("resource://imacros/utils.js");

    var obj = {};
    
    obj.__defineGetter__("strings", function() {
        var bsvc = imns.Cc["@mozilla.org/intl/stringbundle;1"].
        getService(imns.Ci.nsIStringBundleService);
        var b = bsvc.createBundle("chrome://imacros/locale/rec.properties");
        return b;
    });
    
    
    obj.__defineGetter__("playing", function() {
        return iMacros.playing;
    });

    
    obj.__defineGetter__("recording", function() {
        return iMacros.recording;
    });


    
    obj.__defineGetter__("storage", function() {
        return imns.storage;
    });

    
    obj.hookDialogs = function() {
        imns.osvc.addObserver(this, "tabmodal-dialog-loaded", false);
        imns.osvc.addObserver(this, "common-dialog-loaded", false);
    };

    obj.unhookDialogs = function() {
        imns.osvc.removeObserver(this, "tabmodal-dialog-loaded", false);
        imns.osvc.removeObserver(this, "common-dialog-loaded", false);
    };


    
    obj.showMessage = function (message) {
        try {
            var doc = !this.tabmodal ? this.dlg.ui.prompt.document :
                this.dlg.ui.prompt.ownerDocument;
            this.msg = {};
            this.msg.hbox = doc.createElement("hbox");
            var hbox_label = doc.createElement("hbox");
            var hbox_image = doc.createElement("hbox");
            var label = doc.createElement("label");
            var image = doc.createElement("image");

            this.msg.hbox.setAttribute("id", "imacros-commdlg-message");
            this.msg.hbox.setAttribute("align", "center");
            this.msg.hbox.appendChild(hbox_label);
            this.msg.hbox.appendChild(image);
            hbox_label.setAttribute("pack", "center");
            hbox_label.setAttribute("flex", "1");
            hbox_label.appendChild(label);
            label.setAttribute("value", message);
            image.setAttribute("id", "imacros-commdlg-image");
            var el = this.tabmodal ? this.dlg.ui.prompt :
                this.dlg.ui.prompt.document.documentElement;
            el.insertBefore(this.msg.hbox, el.firstChild);
        } catch(e) {
            Components.utils.reportError(e);
        }
    };


    obj.onAccept = function() {
        this.result.accept = true;
        imns.osvc.notifyObservers(window, "imacros-commdlg-hook",
                                  this.result.toSource());
    };


    obj.onCancel = function() {
        this.result.accept = false;
        imns.osvc.notifyObservers(window, "imacros-commdlg-hook",
                                  this.result.toSource());
    };

    
    obj.recordDialog = function() {
        this.result = new Object();
        this.result.type = this.promptType;
        this.showMessage(this.strings.
                         GetStringFromName("imacrosrecordingdialog"));
        var self = this;
        if (this.promptType == "prompt" || this.promptType == "login") {
            this.result.val1 = this.dlg.ui.loginTextbox.value;
            this.dlg.ui.loginTextbox.addEventListener("input", function() {
                self.result.val1 = self.dlg.ui.loginTextbox.value;
            });
        }
            
        if (this.promptType == "login") {
            this.result.val2 = this.dlg.ui.password1Textbox.value;
            this.dlg.ui.password1Textbox.addEventListener("input", function(){
                self.result.val2 = self.dlg.ui.password1Textbox.value;
            });
        }

        this.dlg.ui.button0.addEventListener("command", function() {
            self.onAccept();
        }, true);
        
        this.dlg.ui.button1.addEventListener("command", function() {
            self.onCancel();
        }, true);
    };


    obj.replayDialog = function() {
        var actions = this.storage.
            getObjectForWindow(iMacros.wid, "onDialogAction");
        if (!actions || !actions.length || !(this.action = actions.shift())) {
            
            
            
            
            
            if (!iMacros.player.ignoreErrors) {
                iMacros.player.errorCode = -1450;
                iMacros.player.errorMessage = "RuntimeError: unhandled "+
                    this.promptType+" dialog detected."+
                    " Dialog message: \""+this.dlg.args.text+"\""+
                    ", line "+iMacros.player.currentLine;
                iMacros.panel.showErrorMessage(iMacros.player.errorMessage,
                                               iMacros.player.errorCode);
                setTimeout(function() {iMacros.player.stop();}, 0);
            }
            this.completeDialog();

            return;
            
            
            
            
            
            
        } else {
            if (!actions.length) {
                this.storage.clearWindowObject(window.iMacros.wid,
                                               "onDialogAction");
            } else {
                this.storage.setObjectForWindow(window.iMacros.wid,
                                                "onDialogAction", actions);
            }

            this.showMessage(this.strings.
                             GetStringFromName("imacrosreplayingdialog"));

            switch (this.promptType) {
            case "alert": case "confirm":
                break;
            case "prompt":
                if (this.action.content)
                    this.dlg.ui.loginTextbox.value = this.action.content;
                break;
            case "login":
                this.dlg.ui.loginTextbox.value = this.action.username;
                this.dlg.ui.password1Textbox.value = this.action.password;
                break;
            default:
            }
        }

        this.timer = setTimeout(function() {
            iMacros.CommonDialogHook.completeDialog();
        }, this.action ? this.action.timeout : 0);
    };

    
    obj.completeDialog = function() {
        try {
            
            this.timer = null;
            if (this.msg && this.msg.hbox) {
                let el = this.tabmodal ? this.dlg.ui.prompt :
                    this.dlg.ui.prompt.document.documentElement;
                el.removeChild(this.msg.hbox);
                this.msg = null;
            }

            var self = this;
            var ok = function() {
                if (self.tabmodal) {
                    self.dlg.ui.prompt.onButtonClick(0);
                } else {
                    self.dlg.ui.prompt.document.
                        documentElement.acceptDialog();
                }
            };
            var cancel = function() {
                if (self.tabmodal) {
                    self.dlg.ui.prompt.onButtonClick(1);
                } else {
                    self.dlg.ui.prompt.document.
                        documentElement.cancelDialog();
                }
            };

            if (this.action && this.action.accept ||
                !this.action && this.promptType == "alert") {
                ok();
            } else {
                cancel();
            }

            this.action = null;
            this.dlg = null;
        } catch(e) {
            Components.utils.reportError(e);
        }
    };


    obj.observe = function(subject, topic, data) {
        if (!(this.recording || this.playing) || iMacros.paused)
            return;
            
        if (topic == "tabmodal-dialog-loaded") {
            
            
            
            
            if (gBrowser.selectedTab != subject.linkedTab)
                return;
            this.tabmodal = true;
        } else if (topic == "common-dialog-loaded") {
            const browser_xul = "chrome://browser/content/browser.xul";
            if (subject.opener && subject.opener.document.URL == browser_xul)
                return;     
            this.tabmodal = false;
        }
        this.dlg = subject.Dialog;
        this.promptType = this.dlg.args.promptType == "promptUserAndPass" ?
            "login" : this.dlg.args.promptType;
        try  {
            if (this.recording) {
                this.recordDialog();
            } else if (this.playing) {
                this.replayDialog();
            }
        } catch(ex) {
            Components.utils.reportError(ex);
        }
    };

    return obj;
})();

window.addEventListener("load", function() {
    iMacros.CommonDialogHook.hookDialogs();
}, false);

window.addEventListener("unload", function() {
    iMacros.CommonDialogHook.unhookDialogs();
}, false);
