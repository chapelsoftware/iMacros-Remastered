 




iMacros.player = (function() {
    let {imns} = Components.utils.import("resource://imacros/utils.js");
    let {Rijndael} = Components.utils.import("resource://imacros/rijndael.js");
    let {ctypes} = Components.utils.import("resource://gre/modules/ctypes.jsm");
    let {Downloads} = Components.utils.import("resource://gre/modules/Downloads.jsm");

    
    function BadParameter(msg, num) {
        this.message = typeof(num) != "undefined" ? "expected "+msg+
            " as parameter "+num : msg;
        this.name = "BadParameter";
        this.errnum = 911;
    }

    BadParameter.prototype = Error.prototype;


    
    function UnsupportedCommand(msg) {
        this.message = "command "+msg+
            " is not supported in the current version";
        this.name = "UnsupportedCommand";
        this.errnum = 912;
    }

    UnsupportedCommand.prototype = Error.prototype;


    
    function RuntimeError(msg, num) {
        this.message = msg;
        if (typeof num != "undefined")
            this.errnum = num;
        this.name = "RuntimeError";
    }

    RuntimeError.prototype = Error.prototype;


    
    function MacroError(msg, num) {
        this.message = msg;
        if (typeof num != "undefined")
            this.errnum = num != 1 && num > 0? -1*num : num;
        this.name = "MacroError";
    }

    MacroError.prototype = Error.prototype;
    

    SyntaxError.prototype.
      __defineGetter__("errnum", function() { return 910; });

    
    function ShouldWaitSignal(delay) {
        this.delay = delay;
    }



    
    
    

    function MacroPlayer() {
        this.m_wnd = null;
        this.vars = new Array(10);
        this.userVars = new Object();
        this.compileExpressions();

        
        imns.osvc.addObserver(this, "imacros-si-play", false);
        imns.osvc.addObserver(this, "imacros-si-capture", false);
        imns.osvc.addObserver(this, "imacros-si-show", false);
    }

    window.addEventListener("unload", function() {
        imns.osvc.removeObserver(iMacros.player, "imacros-si-play");
        imns.osvc.removeObserver(iMacros.player, "imacros-si-capture");
        imns.osvc.removeObserver(iMacros.player, "imacros-si-show");

        if (iMacros.playing) {
            iMacros.player.errorMessage = "Browser closed";
            iMacros.player.errorCode = -102;
            iMacros.player.stop();
        }

        
        if (this.imr_worker) {
            this.imr_worker.postMessage({"command": "terminate"});
        }

    }, false);


    
    MacroPlayer.prototype.ActionTable = new Object();
    MacroPlayer.prototype.RegExpTable = new Object();



    

    
    
    const im_strre = "(?:\"(?:[^\"\\\\]|\\\\[0btnvfr\"\'\\\\])*\"|"+
        "eval\\s*\\(\"(?:[^\"\\\\]|\\\\[\\w\"\'\\\\])*\"\\)|"+
        "\\S*)";


    MacroPlayer.prototype.showErrorAndStop = function(e, proceed) {
        iMacros.panel.statLine2Status = "idle";
        this.errorMessage = e.message;
        this.errorCode = e.errnum ? -1*Math.abs(e.errnum) : -1001;
        if (!proceed)
            this.stop();
        iMacros.panel.showErrorMessage(
            this.errorMessage, this.errorCode
        );
    };

    MacroPlayer.prototype.retry = function(onerror, msg, _timeout) {
        
        var timeout = _timeout || (
            (this.tagTimeout >= 0) ? this.tagTimeout :
                this.timeout/10
        );

        if (!this.playingAgain) {
            this.nattempts = Math.round(timeout*10);
        }

        if (--this.nattempts >= 0) {
            iMacros.panel.statLine2Status = "loading";
            imns.osvc.notifyObservers(
                window, "imacros-delay-show",
                msg+" "+(this.nattempts/10).toFixed(1)+
                    "("+Math.round(timeout)+")s");
            this.playingAgain = true;
            
            throw new ShouldWaitSignal(100);
        } else {
            iMacros.panel.statLine2Status = "idle";
            this.playingAgain = false;
            onerror();
        }
    };

    
    
    MacroPlayer.prototype.RegExpTable["add"] =
        "^(\\S+)\\s+("+im_strre+")\\s*$";

    MacroPlayer.prototype.ActionTable["add"] = function (cmd) {
        var param = imns.unwrap(this.expandVariables(cmd[2]));
        var m = null;
        
        if ( m = cmd[1].match(/^!var([0-9])$/i) ) {
            var num = imns.s2i(m[1]);
            var n1 = imns.s2i(this.vars[num]), n2 = imns.s2i(param);
            if ( !isNaN(n1) && !isNaN(n2) ) {
                this.vars[num] = (n1 + n2).toString();
            } else {
                this.vars[num] += param;
            }
        } else if ( arr = cmd[1].match(/^!extract$/i) ) {
            this.addExtractData(param);
        } else if (/^!\S+$/.test(cmd[1])) {
            throw new BadParameter("Unsupported variable "+cmd[1]+
                                   " for ADD command");
        } else {
            if (!this.hasUserVar(cmd[1])) {
                throw new BadParameter("Undefinded variable "+cmd[1]);
            }
            var n1 = imns.s2i(this.getUserVar(cmd[1])), n2 = imns.s2i(param);
            if ( !isNaN(n1) && !isNaN(n2) ) {
                this.setUserVar(cmd[1], (n1 + n2).toString());
            } else {
                this.setUserVar(cmd[1], this.getUserVar(cmd[1])+param);
            }
        }
    };



    
    MacroPlayer.prototype.RegExpTable["back"] = "^\\s*$";

    MacroPlayer.prototype.ActionTable["back"] = function (cmd) {
        getWebNavigation().goBack();
    };


    
    MacroPlayer.prototype.RegExpTable["clear"] = "^\\s*$";

    MacroPlayer.prototype.ActionTable["clear"] = function (cmd) {
        if (imns.Ci.nsICacheStorageService) {
            var c = imns.Cc["@mozilla.org/netwerk/cache-storage-service;1"].
                getService(imns.Ci.nsICacheStorageService);
            c.clear();
        } else {
            var cachesvc = imns.Cc["@mozilla.org/network/cache-service;1"]
                .getService(imns.Ci.nsICacheService);
            cachesvc.evictEntries(imns.Ci.nsICache.STORE_ANYWHERE);
        }
        var cookiemgr = imns.Cc["@mozilla.org/cookiemanager;1"]
          .getService(imns.Ci.nsICookieManager);
        cookiemgr.removeAll();
    };


    
    MacroPlayer.prototype.RegExpTable["click"] =
        "^x\\s*=\\s*(\\S+)\\s+y\\s*=\\s*(\\S+)"+
        "(?:\\s+content\\s*=\\s*("+im_strre+"))?\\s*$";
    
    MacroPlayer.prototype.ActionTable["click"] = function (cmd) {
        var x = imns.s2i(imns.unwrap(this.expandVariables(cmd[1])));
        var y = imns.s2i(imns.unwrap(this.expandVariables(cmd[2])));
        if ( isNaN(x))
            throw new BadParameter("positive integer number", 1);
        if (isNaN(y))
            throw new BadParameter("positive integer number", 2);

        var data = cmd[3] ? imns.unwrap(this.expandVariables(cmd[3])) : "";
        var doc = this.currentWindow.document;
        var target = doc.documentElement;
        var details = {
            doc: doc,
            point: {x: x, y: y},
            clickCount: 1,
            button: 0,
            target: target
        };
        details.type = "mousedown";
        this.dispatchMouseEvent(details);
        details.type = "mouseup";
        this.dispatchMouseEvent(details);
        if (data) {
            TagHandler.onContentParam(
                target.tagName.toLowerCase(), target, data
            );
        }
    };


    
    MacroPlayer.prototype.RegExpTable["cmdline"] =
        "^(\\S+)\\s+("+im_strre+")\\s*$";

    MacroPlayer.prototype.ActionTable["cmdline"] = function (cmd) {
        var param = imns.unwrap(this.expandVariables(cmd[2]));
        var found = false;
        
        if (/^!(\S+)$/i.test(cmd[1])) {
            var val = RegExp.$1.toLowerCase();
            if( val == "timeout" ) {
                if (isNaN(imns.s2i(param)))
                    throw new BadParameter("integer", 2);
                this.timeout = imns.s2i(param);
            } else if (val == "loop") {
                if (isNaN(imns.s2i(param)))
                    throw new BadParameter("integer", 2);
                this.currentLoop = imns.s2i(param);
            } else if (val == "datasource") {
                this.loadDataSource(param);
            } else if ( /^var([0-9])/.test(val) ) {
                this.vars[imns.s2i(RegExp.$1)] = param;
            } else {
                throw new BadParameter("!TIMEOUT|!LOOP|!DATASOURCE|!VAR[0-9]", 1);
            }
        } else {
            if (this.hasUserVar(cmd[1])) {
                this.setUserVar(cmd[1], param);
            } else {
                throw new BadParameter("unknown variable "+cmd[1]);
            }
        }
    };



    
    
    MacroPlayer.prototype.RegExpTable["disconnect"] = ".*";

    MacroPlayer.prototype.ActionTable["disconnect"] = function (cmd) {
        throw new UnsupportedCommand("DISCONNECT");
    };



    
    
    MacroPlayer.prototype.RegExpTable["ds"] = ".*";

    MacroPlayer.prototype.ActionTable["ds"] = function (cmd) {
        
        throw new UnsupportedCommand("DS");
    };


    
    MacroPlayer.prototype.RegExpTable["event"] =
        "type\\s*=\\s*("+im_strre+")"+
        "(?:\\s+(selector|xpath)\\s*=\\s*("+im_strre+"))?"+
        "(?:\\s+(button|key|char|point)\\s*=\\s*("+im_strre+"))?"+
        "(?:\\s+modifiers\\s*=\\s*("+im_strre+"))?";


    MacroPlayer.prototype.dispatchMouseEvent = function(details) {
        var ctrlKey = /ctrl/i.test(details.modifiers);
        var altKey = /alt/i.test(details.modifiers);
        var shiftKey = /shift/i.test(details.modifiers);
        var metaKey = /meta/i.test(details.modifiers);
        var clickCount = details.clickCount || 1;
        if (details.type == "mousemove")
            clickCount = 0;

        var clientX, clientY, pageX, pageY;
        if (!details.point) {
            var rect = details.target.getBoundingClientRect();
            clientX = Math.round((rect.left+rect.right)/2);
            clientY = Math.round((rect.top+rect.bottom)/2);
            pageX = clientX + details.doc.defaultView.scrollX;
            pageY = clientY + details.doc.defaultView.scrollY;
        } else {
            pageX = details.point.x;
            pageY = details.point.y;
            if (/HTMLHtmlElement/.test(details.target)) {
                details.target = details.doc.elementFromPoint(pageX, pageY);
            }
            clientX = pageX - details.doc.defaultView.scrollX;
            clientY = pageY - details.doc.defaultView.scrollY;
        }
        
        var screenX = details.doc.defaultView.mozInnerScreenX+clientX;
        var screenY = details.doc.defaultView.mozInnerScreenY+clientY;
        var relatedTarget = null;

        if (details.type == "mousedown") {
            
            var mover = details.doc.createEvent("MouseEvent");
            mover.initMouseEvent("mouseover", true, true,
                                 details.doc.defaultView, clickCount,
                                 screenX, screenY, clientX, clientY,
                                 ctrlKey, altKey, shiftKey, metaKey,
                                 details.button, relatedTarget);
            details.target.dispatchEvent(mover);
        }

        var event = details.doc.createEvent("MouseEvent");
        event.initMouseEvent(details.type, true, true,
                             details.doc.defaultView,
                             clickCount, screenX, screenY, clientX, clientY,
                             ctrlKey, altKey, shiftKey, metaKey,
                             details.button, relatedTarget);

        details.target.dispatchEvent(event);

        if (details.type == "mousedown") {
            
            if (typeof details.target.focus == "function")
                details.target.focus();
            
            
            if (/HTMLOptionElement/.test(details.target) &&
                /HTMLSelectElement/.test(details.target.parentNode)) {
                if (!details.target.parentNode.multiple) {
                    details.target.parentNode.selectedIndex =
                        details.target.index;
                } else {
                    details.target.selected = true;
                }
                
                var change = details.doc.createEvent("Event");
                change.initEvent("change", true, true);
                details.target.dispatchEvent(change);
            }
        } else if (details.type == "mouseup") {
            
            
            
            
            var click = details.doc.createEvent("MouseEvent");
            click.initMouseEvent(clickCount == 1 ? "click" : "dblclick",
                                 true, true,
                                 details.doc.defaultView, clickCount,
                                 screenX, screenY, clientX, clientY,
                                 ctrlKey, altKey, shiftKey, metaKey,
                                 details.button, relatedTarget);
            details.target.dispatchEvent(click);
        } 
    };


    MacroPlayer.prototype.dispatchKeyboardEvent = function(details) {
        var event = details.doc.createEvent("KeyboardEvent");

        var ctrlKey = /ctrl/i.test(details.modifiers);
        var altKey = /alt/i.test(details.modifiers);
        var shiftKey = /shift/i.test(details.modifiers);
        var metaKey = /meta/i.test(details.modifiers);
        var keyCode = details.key;
        var charCode = details.char ? details.char.charCodeAt(0) : 0;
        event.initKeyEvent(details.type, true, true,
                           details.doc.defaultView,
                           ctrlKey, altKey, shiftKey, metaKey,
                           keyCode, charCode);
        
        details.target.dispatchEvent(event);
    };
    

    MacroPlayer.prototype.ActionTable["event"] = function (cmd) {
        var type = imns.unwrap(this.expandVariables(cmd[1]));
        var selector_type = cmd[2] ? cmd[2].toLowerCase() : "";
        var selector = cmd[3] ? imns.unwrap(this.expandVariables(cmd[3])) : "";
        var value_type = cmd[4] || "";
        var value = cmd[5] ? imns.unwrap(this.expandVariables(cmd[5])) : 0;
        var modifiers = cmd[6] ?
            imns.unwrap(this.expandVariables(cmd[6])) : "";

        
        

        
        var doc = this.currentWindow.document;
        var target = null;
        if (selector_type == "xpath") {
            target = TagHandler.findByXPath(
                doc, doc.documentElement, selector
            );
        } else if (selector_type == "selector") {
            target = doc.querySelector(selector);
        } else {
            target = doc.documentElement;
        }
        var rect = target ? target.getBoundingClientRect() : {};
        
        
        if (!target || !rect.width || !rect.height) {
            var self = this;
            this.retry(function() {
                if (self.ignoreErrors)
                    return;
                if (!target)
                    throw new RuntimeError(
                        "Can not locate element specified by "+
                            selector_type+" \""+selector+"\"", 921
                    );
                else if (!rect.width || !rect.height)
                    throw new RuntimeError(
                        "Element "+target.tagName+" is not visible", 921
                    );
                
            }, "Element waiting...");
        }

        
        var button = 0;
        var key = 0;
        var char = "";
        var point = null;

        if (!value_type) {
            ; 
        } else if (value_type.toLowerCase() == "button") {
            button = imns.s2i(value);
            if (isNaN(button))
                throw new BadParameter("integer BUTTON value", 3);
        } else if (value_type.toLowerCase() == "key") {
            key = imns.s2i(value);
            if (isNaN(key))
                throw new BadParameter("integer KEY value", 3);
        } else if (value_type.toLowerCase() == "char") {
            if (target.type == "password") {
                var pm = imns.getPasswordManager();
                var key = imns.getEncryptionKey();
                if (pm.encryptionType != pm.TYPE_NONE) {
                    try {
                        char = Rijndael.decryptString(value, key);
                    } catch (e) {
                        
                        var param = {
                            reenter: true, password: "",
                            master: pm.encryptionType == pm.TYPE_STORED
                        };
                        window.openDialog(
                            'chrome://imacros/content/keydlg4.xul',
                            '', 'modal,centerscreen', param
                        );
                        if (param.master) {
                            pm.setMasterPwd(param.password);
                            pm.encryptionType = pm.TYPE_STORED;
                        } else {
                            pm.setSessionPwd(param.password);
                            pm.encryptionType = pm.TYPE_TEMP;
                        }
                        char = Rijndael.decryptString(value, param.password);
                    }
                } else {
                    char = value;
                }
                
            } else {
                char = value;
            }
        } else if (value_type.toLowerCase() == "point") {
            var point_re =
                /^\(\s*(\d+(?:\.\d+)?)\s*\,\s*(\d+(?:\.\d+)?)\s*\)$/;
            var m = null;
            if ( !(m = point_re.exec(value.trim())) )
                throw new BadParameter("(x,y) POINT value", 3);
            point = {x: parseFloat(m[1]), y: parseFloat(m[2])};
        }

        
        
        if (/^mouse/i.test(type)) {
            var details = {
                doc: doc,
                target: target,
                type: type.toLowerCase(),
                point: point,
                button: button,
                modifiers: modifiers
            };
            this.dispatchMouseEvent(details);
        } else if (/^key/i.test(type)) {
            if (typeof target.focus == "function")
                target.focus();
            var details = {
                doc: doc,
                target: target,
                type: type.toLowerCase(),
                key: key,
                char: char,
                modifiers: modifiers
            };
            this.dispatchKeyboardEvent(details);
        } else if (type.toLowerCase() == "click") {
            
            var details = {
                doc: doc,
                target: target,
                point: point,
                button: button,
                clickCount: 1,
                modifiers: modifiers
            };
            details.type = "mousedown";
            this.dispatchMouseEvent(details);
            details.type = "mouseup";
            this.dispatchMouseEvent(details);
        } else if (type.toLowerCase() == "dblclick") {
            
            var details = {
                doc: doc,
                target: target,
                point: point,
                button: button,
                modifiers: modifiers
            };
            details.clickCount = 1;
            details.type = "mousedown";
            this.dispatchMouseEvent(details);
            details.type = "mouseup";
            this.dispatchMouseEvent(details);
            details.clickCount = 2;
            details.type = "mousedown";
            this.dispatchMouseEvent(details);
            details.type = "mouseup";
            this.dispatchMouseEvent(details);
        }

        if (imns.Pref.getBoolPref("highlight")) {
            this.highlightElement(target);
        }
    };


    
    MacroPlayer.prototype.RegExpTable["events"] =
        "type\\s*=\\s*("+im_strre+")"+
        "(?:\\s+(selector|xpath)\\s*=\\s*("+im_strre+"))?"+
        "(?:\\s+(keys|chars|points)\\s*=\\s*("+im_strre+"))?"+
        "(?:\\s+modifiers\\s*=\\s*("+im_strre+"))?";

    MacroPlayer.prototype.ActionTable["events"] = function (cmd) {
        var type = imns.unwrap(this.expandVariables(cmd[1]));
        var selector_type = cmd[2] ? cmd[2].toLowerCase() : "";
        var selector = cmd[3] ? imns.unwrap(this.expandVariables(cmd[3])) : "";
        var value_type = cmd[4] || "";
        var value = cmd[5] ? imns.unwrap(this.expandVariables(cmd[5])) : 0;
        var modifiers = cmd[6] ?
            imns.unwrap(this.expandVariables(cmd[6])) : "";

        
        
        

        
        var doc = this.currentWindow.document;
        var target = null;
        if (selector_type == "xpath") {
            target = TagHandler.findByXPath(
                doc, doc.documentElement, selector
            );
        } else if (selector_type == "selector") {
            target = doc.querySelector(selector);
        } else {
            target = doc.documentElement;
        }
        var rect = target ? target.getBoundingClientRect() : {};
        
        
        if (!target || !rect.width || !rect.height) {
            var self = this;
            this.retry(function() {
                if (self.ignoreErrors)
                    return;
                if (!target)
                    throw new RuntimeError(
                        "Can not locate element specified by "+
                            selector_type+" \""+selector+"\"", 921
                    );
                else if (!rect.width || !rect.height)
                    throw new RuntimeError(
                        "Element "+target.tagName+" is not visible", 921
                    );
            }, "Element waiting...");
        }

        
        var chars = "";
        var keys = [];
        var keys_re = /\[\d+(?:\s*,\s*\d+)*\]/;
        var points = [];
        var points_re =
            /^(?:\s*\(\d+(?:\.\d+)?\s*\,\s*\d+(?:\.\d+)?\s*\)(?:\s*,\s*)?)+$/;
            
        if (value_type.toLowerCase() == "chars") {
            if (target.type == "password") {
                var pm = imns.getPasswordManager();
                var key = imns.getEncryptionKey();
                if (pm.encryptionType != pm.TYPE_NONE) {
                    try {
                        chars = Rijndael.decryptString(value, key);
                    } catch (e) {
                        
                        var param = {
                            reenter: true, password: "",
                            master: pm.encryptionType == pm.TYPE_STORED
                        };
                        window.openDialog(
                            'chrome://imacros/content/keydlg4.xul',
                            '', 'modal,centerscreen', param
                        );
                        if (param.master) {
                            pm.setMasterPwd(param.password);
                            pm.encryptionType = pm.TYPE_STORED;
                        } else {
                            pm.setSessionPwd(param.password);
                            pm.encryptionType = pm.TYPE_TEMP;
                        }
                        chars = Rijndael.decryptString(value, param.password);
                    }
                } else {
                    chars = value;
                }
            } else {
                chars = value;
            }
        } else if (value_type.toLowerCase() == "keys") {
            if ( !keys_re.test(value.trim()) )
                throw new BadParameter("[k1,..,kn] as KEYS value", 3);
            keys = JSON.parse(value);
        } else if (value_type.toLowerCase() == "points") {
            if ( !points_re.test(value.trim()) )
                throw new BadParameter("(x,y)[,(x,y)] as POINTS value", 3);
            var point_re =
                /\(\s*(\d+(?:\.\d+)?)\s*\,\s*(\d+(?:\.\d+)?)\s*\)/g;
            while(m = point_re.exec(value)) {
                points.push({x: parseFloat(m[1]), y: parseFloat(m[2])});
            }
        }


        

        var g = null;    

        if (/mousemove/i.test(type)) {
            var details = {doc: doc, target: target,
                           type: type.toLowerCase(), modifiers: modifiers};

            g = (function fireEvent (details, points) {
                while(points.length) {
                    details.point = points.shift();
                    iMacros.player.dispatchMouseEvent(details);
                    yield true;
                }
                yield false;
            }) (details, points);

        } else if (/^keypress/i.test(type)) {
            if (typeof target.focus == "function")
                target.focus();
            var details = {doc: doc, target: target, modifiers: modifiers};
            g = (function fireEvent (details, keys, chars) {
                var typ = keys.length ? "key" : "char";
                while((typ == "key" ? keys : chars).length) {
                    if (typ == "key") {
                        
                        details.key = keys.shift();
                        details.type = "keydown";
                        iMacros.player.dispatchKeyboardEvent(details);
                        details.type = "keypress";
                        iMacros.player.dispatchKeyboardEvent(details);
                        details.type = "keyup";
                        iMacros.player.dispatchKeyboardEvent(details);
                    } else {
                        var char = chars.charAt(0);
                        chars = chars.substring(1);
                        
                        
                        var key = 65; 
                        if (/[A-Z]/i.test(char)) {
                            
                            key = char.toUpperCase().charCodeAt(0);
                        }
                        details.key = key;
                        details.type = "keydown";
                        iMacros.player.dispatchKeyboardEvent(details);
                        details.type = "keypress";
                        details.char = char;
                        iMacros.player.dispatchKeyboardEvent(details);
                        details.key = key;
                        details.type = "keyup";
                        iMacros.player.dispatchKeyboardEvent(details);
                    }
                    yield true;
                }
                yield false;
            }) (details, keys, chars);
        }
        
        var __delay = 0;  
        this.inEventsCommand = true;
        this.__eventsInterval = setInterval(function() {
            if (!g.next()) {
                clearInterval(iMacros.player.__eventsInterval);
                delete iMacros.player.__eventsInterval;
                iMacros.player.inEventsCommand = false;
                iMacros.player.playNextAction();
            }
        }, __delay);

        if (imns.Pref.getBoolPref("highlight")) {
            this.highlightElement(target);
        }
    };
    
    
    
    MacroPlayer.prototype.RegExpTable["extract"] = ".*";

    MacroPlayer.prototype.ActionTable["extract"] = function (cmd) {
        throw new UnsupportedCommand("EXTRACT");
    };


    
    MacroPlayer.prototype.RegExpTable["filedelete"] =
        "^name\\s*=\\s*("+im_strre+")\\s*$";

    MacroPlayer.prototype.ActionTable["filedelete"] = function (cmd) {
        var param = imns.unwrap(this.expandVariables(cmd[1])), file;
        if (param.indexOf(imns.FIO.psep) == -1 ) {
            var file = imns.Pref.getFilePref("defdownpath");
            file.append(param);
        } else 
            file = imns.FIO.openNode(param);
        file.remove(false);
    };


    
    MacroPlayer.prototype.RegExpTable["filter"] = "^type\\s*=\\s*(\\S+)\\s+"+
        "status\\s*=\\s*(\\S+)\\s*$";

    
    function getRequestWatcher() {
        var watcher = null;
        try {
            watcher = imns.Cc["@iopus.com/requestwatcher;1"];
            watcher = watcher.getService(imns.Ci.nsISupports);
            watcher = watcher.wrappedJSObject;
            return watcher;
        } catch (e) {
            Components.utils.reportError(e);
            throw "Can't instantiate RequestWatcher!";
        }
    }

    MacroPlayer.prototype.ActionTable["filter"] = function (cmd) {
        var param = imns.unwrap(this.expandVariables(cmd[2]));
        if (this.shouldFilterImages) {
            var watcher = getRequestWatcher();
            if (!/^images$/i.test(cmd[1])) {
                throw new BadParameter("TYPE=IMAGES", 1);
            }
            if (/^on$/i.test(param))
                watcher.enableImageFilter();
            else
                watcher.enableImageFilter(false);
        }
    };


    

    MacroPlayer.prototype.RegExpTable["frame"] =
        "^(f|name)\\s*=\\s*("+im_strre+")\\s*$";

    
    
    
    
    MacroPlayer.prototype.findFrame = function(win, obj) {
        var frames = win.frames, i, f;
        for (i = 0; i < frames.length; i++) {
            if (--obj.num == 0) {
                return frames[i];
            } else if (f = this.findFrame(frames[i], obj))
                return f;
        }
        return null;
    };

    
    MacroPlayer.prototype.findFrameByName = function(win, name) {
        var frames = win.frames, i;
        for (var i = 0; i < frames.length; i++) {
            if (name.test(frames[i].name))
                return frames[i];
            else if (f = this.findFrameByName(frames[i], name))
                return f;
        }
        return null;
    };

    MacroPlayer.prototype.ActionTable["frame"] = function (cmd) {
        var type = cmd[1].toLowerCase(), f = null;
        var param = imns.unwrap(this.expandVariables(cmd[2]));

        if (type == "f") {
            param = imns.s2i(param);
            if (isNaN(param))
                throw new BadParameter("F=<number>", 1);

            if (param == 0) {
                
                this.currentWindow = window.content;
                return;
            } 
        } 

        if (type == "f") {
            f =  this.findFrame(window.content, {num:param});
        } else if (type == "name") {
            var name_re = new RegExp("^"+param.replace(/\*/g, ".*")+"$");
            f = this.findFrameByName(window.content, name_re);
        }
        if (!f) {
            var self = this;
            this.retry(function() {
                if (self.ignoreErrors)
                    return;
                
                iMacros.player.currentWindow = window.content;
                throw new RuntimeError("frame "+param+" not found", 922);
            }, "Frame waiting...");
        } else {
            this.currentWindow = f;
        }
    };



    
    
    MacroPlayer.prototype.RegExpTable["imageclick"] = ".*";
    MacroPlayer.prototype.ActionTable["imageclick"] = function (cmd) {
        throw new UnsupportedCommand("IMAGECLICK");
    };

    
    MacroPlayer.prototype.RegExpTable["imagesearch"] =
	"^pos\\s*=\\s*("+im_strre+
	")\\s+image\\s*=\\s*("+im_strre+")\\s+"+
        "confidence\\s*=\\s*("+im_strre+")";


    MacroPlayer.prototype.highlightImage = function(data) {
        var doc = window.content.document;
        var div = doc.createElement("div");
        div.style.width = data.width+"px";
        div.style.height = data.height+"px";
        div.style.border = "1px solid #9bff9b";
        div.style.zIndex = "100";
        div.style.position = "absolute";
        div.style.left = Math.floor(data.x-data.width/2)+"px";
        div.style.top = Math.floor(data.y-data.height/2)+"px";
        doc.body.appendChild(div);
    };


    MacroPlayer.prototype.getIMRLibPath = function() {
        var path = null;
        if (imns.is_windows()) {
            
            var wrk = imns.Cc["@mozilla.org/windows-registry-key;1"]
                    .createInstance(imns.Ci.nsIWindowsRegKey);
            try {
                wrk.open(wrk.ROOT_KEY_LOCAL_MACHINE,
                         "SOFTWARE\\iOpus\\iMacros",
                         wrk.ACCESS_READ);
            } catch(e) {
                
                return "";
            }
            path = wrk.readStringValue("PathExe");
            wrk.close();
            var node = imns.FIO.openNode(path);
            if (!node.isDirectory()) {
                return "";
            }
            node.append("iimIRm.dll");
            if (!node.exists()) {
                Components.utils.reportError(
                    "Can not find image recognition library!"
                );
                return "";
            }
            path = node.path;
        } else {
            Components.utils.reportError(
                "Image recognition is Windows-only feature."
            );
        }

        return path;
    };


    MacroPlayer.prototype.onImrMessage = function(evt) {
        this.waitingForImageSearch = false;
        var msg = evt.data;
        if (msg.type == "message") {
            return;
        } else if (msg.type == "error") {
            this.showErrorAndStop(
                new RuntimeError(msg.error, 903), this.ignoreErrors
            );
            return;
        } 

        
        const TM_STATUS_MATCH_FOUND_OK  = 0;
        const TM_STATUS_MATCH_NOT_FOUND = 1;
        const TM_STATUS_FILE_IMAGE_NOT_FOUND = 2;
        const TM_STATUS_IMAGE_ILLEGAL_SIZE = 3;
        const TM_STATUS_INTERNAL_ERROR = 4;

        
        var tmp_image = imns.FIO.openNode(msg.image);
        tmp_image.remove(false);

        if (msg.rv == TM_STATUS_MATCH_FOUND_OK) {
            var data = {
                x: msg.result.x,
                y: msg.result.y,
                width: msg.result.width,
                height: msg.result.height
            };
            this.highlightImage(data);
            this.playingAgain = false;
            this.playNextAction();
        } else if (msg.rv == TM_STATUS_MATCH_NOT_FOUND) {
            if (this.ignoreErrors) {
                this.playNextAction();
                return;
            }
            if (!this.playingAgain) {
                
                this.retryTimeout = (this.tagTimeout >= 0) ?
                    this.tagTimeout : this.timeout/10 ;
                this.retryStartTime = new Date();
                this.playingAgain = true;
                var mplayer = this;
                this.retryInterval = setInterval(function() {
                    var remains = mplayer.retryStartTime.getTime() +
                        mplayer.retryTimeout*1000 - Date.now();
                    if (remains <= 0) {
                        clearInterval(mplayer.retryInterval);
                        delete mplayer.retryStartTime;
                        delete mplayer.retryInterval;
                        mplayer.playingAgain = false;
                        mplayer.showErrorAndStop(
                            new RuntimeError("Image specified by "+
                                             msg.template+
                                             " does not match the web-page",
                                             927)
                        );
                    } else {
                        iMacros.panel.statLine2Status = "loading";
                        imns.osvc.notifyObservers(
                            window, "imacros-delay-show",
                            "Image waiting..."+" "+(remains/1000).toFixed(1)+
                                "("+Math.round(mplayer.retryTimeout)+")s");
                    }
                }, 100);
            }
            this.playNextAction();
	} else if(msg.rv == TM_STATUS_FILE_IMAGE_NOT_FOUND) {
            this.showErrorAndStop(
                new RuntimeError("Can not open image file "+msg.template, 930)
            );
        } else {
            this.showErrorAndStop(
                new RuntimeError("Image search error "+msg.rv, 903)
            );
        }
    };

    MacroPlayer.prototype.doImageSearch = function(img, tmpl, cl) {
        var msg_no_free_beer = "This feature requires the iMacros image"+
            " recognition library, which is part of the commercial"+
            " iMacros Standard and Enterprise Editions.";

        if (!this.imr_worker) {
            var libpath = this.getIMRLibPath();
            if (!libpath) {
                if (this.ignoreErrors) {
                    this.playNextAction();
                    return;
                } else {
                    this.showErrorAndStop(
                        new RuntimeError(msg_no_free_beer, 902)
                    );
                    return;
                }
            }
            this.imr_worker = new ChromeWorker(
                "chrome://imacros/content/imr_worker.js"
            );
            this.imr_worker.onerror = function(e) {
                Components.utils.reportError(e);
            };
            this.imr_worker.onclose = function(evt) {
                
            };

            mplayer = this;
            this.imr_worker.onmessage = function(evt) {
                
                mplayer.onImrMessage(evt);
            };

            this.imr_worker.postMessage({
                "command":  "init",
                "libpath":  libpath
            });
        }

        this.imr_worker.postMessage({
            "command":  "search",
            "image":  img,
            "template": tmpl,
            "confidenceLevel": cl
        });
    };

    
    MacroPlayer.prototype.ActionTable["imagesearch"] = function (cmd) {
	var pos = imns.s2i(imns.unwrap(this.expandVariables(cmd[1])));
	var image = imns.unwrap(this.expandVariables(cmd[2]));
	var confidence = imns.s2i(imns.unwrap(this.expandVariables(cmd[3])));

        if (!imns.is_windows()) {
            throw new UnsupportedCommand("IMAGESEARCH");
        }
        
	if (!imns.FIO.isFullPath(image)) {
            var image_file = this.dataSourceFolder.clone();
            image_file.append(image);
	    image = image_file.path;
	}

        
        var ds = Cc["@mozilla.org/file/directory_service;1"];
        ds = ds.getService(Ci.nsIProperties);
        var dir = ds.get("TmpD", Ci.nsILocalFile);
        var leafName = btoa(encodeURIComponent(window.content.location.href))+
	    (new Date()).getTime()+".png";

        var mplayer = this;
        this.waitingForImage = true;
        this.savePageAsImage(window.content, leafName, dir, "png", function() {
            mplayer.waitingForImage = false;
            dir.append(leafName);

            mplayer.waitingForImageSearch = true;
            mplayer.doImageSearch(dir.path, image, confidence);
        });
    };


    
    
    MacroPlayer.prototype.RegExpTable["oncertificatedialog"] = ".*";
    MacroPlayer.prototype.ActionTable["oncertificatedialog"] = function (cmd) {
        throw new UnsupportedCommand("ONCERTIFICATEDIALOG");
    };


    
    MacroPlayer.prototype.RegExpTable["ondialog"] =
        "^pos\\s*=\\s*(\\S+)"+
        "\\s+button\\s*=\\s*(\\S+)"+
        "(?:\\s+content\\s*=\\s*("+im_strre+")?)?\\s*$";

    MacroPlayer.prototype.ActionTable["ondialog"] = function (cmd) {
        var pos = imns.s2i(imns.unwrap(this.expandVariables(cmd[1])));
        if (isNaN(pos) || pos < 1)
            throw new BadParameter("POS=<number>", 1);
        var button = imns.unwrap(this.expandVariables(cmd[2]));
        var storage = imns.storage;
        var obj = new Object();
        obj.accept = /^(ok|yes)$/i.test(button);
        if (typeof cmd[3] != "undefined")
            obj.content = imns.unwrap(this.expandVariables(cmd[3]));
        obj.timeout = this.delay;
        var actions = storage.getObjectForWindow(iMacros.wid,
                                                 "onDialogAction");
        if (!actions) {
            actions = new Array();
        }
        actions[pos-1] = obj;
        storage.setObjectForWindow(iMacros.wid, "onDialogAction", actions);
    };


    
    MacroPlayer.prototype.RegExpTable["ondownload"] =
        "^folder\\s*=\\s*("+im_strre+")\\s+"+
        "file\\s*=\\s*("+im_strre+")"+
        "(?:\\s+wait\\s*=(yes|no|true|false))?"+
        "(?:\\s+checksum\\s*=(md5|sha1):(\\S+))?"+
        "\\s*$";

    MacroPlayer.prototype.ActionTable["ondownload"] = function (cmd) {
        var storage = imns.storage;
        var obj = new Object();
        var wait = true;
        var folder = imns.unwrap(this.expandVariables(cmd[1]));
        var file = imns.unwrap(this.expandVariables(cmd[2]));
        obj.accept = true;
        if (folder != "*") {
            try {
                var f = imns.FIO.openNode(folder);
                if (!f.exists())
                    imns.FIO.makeDirectory(folder);
            } catch (e) {
                var reason = "";
                if (/ACCESS_DENIED/.test(e.toString()))
                    reason = " access denied";
                throw new RuntimeError("can not open ONDOWNLOAD folder: '"+
                                       folder+"'"+reason, 932);
            }
        }

        if (file != "*") {
            var re = null;
            if (imns.is_windows()) {
                re = /[\\\?\*\/\|\0]/;
            } else {
                re = /[\?\*\/\|\0]/;
            }
            if (re.test(file) || /^\.\.?$/.test(file) ) {
                throw new BadParameter("file name contains illegal character(s)");
            }
        }

        obj.folder = folder;
        obj.filename = file;
        obj.timeout = this.delay;
        storage.setObjectForWindow(iMacros.wid,
                                   "onDownloadAction", obj);
        this.shouldDownloadPDF = true; 
        this.setDownloadDlgFlag();

        if (typeof cmd[3] != "undefined") {
            var param = imns.unwrap(this.expandVariables(cmd[3]));
            wait = /^(?:yes|true)$/i.test(param);
        }
        this.shouldWaitDownload = wait;
        this.downloadFolder = folder;
        this.downloadFilename = file;
        if (typeof cmd[4] != "undefined") {
            if (!wait) {
                throw new BadParameter("CHECKSUM requires WAIT=YES", 3);
            }
            this.downloadCheckAlg = imns.unwrap(this.expandVariables(cmd[4]));
            this.downloadChecksum =
                imns.unwrap(this.expandVariables(cmd[5])).toLowerCase();
        } else {
            this.downloadChecksum = this.downloadCheckAlg = "";
        }
    };


    MacroPlayer.prototype.setDownloadDlgFlag = function() {
        this.shouldWaitDownloadDlg = true;
        
        if (this.downloadDlgTimeout) {
            clearTimeout(this.downloadDlgTimeout);
            this.downloadDlgTimeout = null;
        }

        
        
        
        var timeout = 4*(this.tagTimeout >= 0 ? this.tagTimeout :
                         this.timeout/10);
        if (timeout < 4) {
            
            
            timeout = 4;
        }

        var mplayer = this;
        this.downloadDlgTimeout = 
            setTimeout(function() {
                if (!mplayer.playing)
                    return;

                if (mplayer.ignoreErrors) {
                    mplayer.clearDownloadDlgFlags();
                    setTimeout(function () { mplayer.playNextAction() }, 0);
                    return;
                }

                mplayer.showErrorAndStop(
                    new RuntimeError(
                        "ONDOWNLOAD command was used but no download occurred.",
                        804)
                );
            }, timeout*1000);
    };


    MacroPlayer.prototype.clearDownloadDlgFlags = function() {
        this.shouldWaitDownloadDlg = false;
        this.waitingForDownloadDlg = false;
        if (this.downloadDlgTimeout) {
            clearTimeout(this.downloadDlgTimeout);
            this.downloadDlgTimeout = null;
        }
    };

    MacroPlayer.prototype.calculateFileHash = function (file, alg) {
        var istream = imns.Cc["@mozilla.org/network/file-input-stream;1"].
            createInstance(imns.Ci.nsIFileInputStream);
        
        istream.init(file, 0x01, 0444, 0);
        var ch = imns.Cc["@mozilla.org/security/hash;1"]
        .createInstance(imns.Ci.nsICryptoHash);
        
        var hash_alg;
        alg = alg.toUpperCase();
        if (alg == "MD5") {
            hash_alg = ch.MD5;
        } else if (alg == "SHA1") {
            hash_alg = ch.SHA1;
        } else {
            throw new RuntimeError("Unknown Hash algorithm "+alg, 911);
        }

        ch.init(hash_alg);

        
        const PR_UINT32_MAX = 0xffffffff;
        ch.updateFromStream(istream, PR_UINT32_MAX);
        var hash = ch.finish(false);
        
        let bytes = [];
        for(let x in hash)
            bytes.push(hash.charCodeAt(x));
        return bytes.reduce((s, c) => {
            return s + ("0" + c.toString(16)).slice(-2);
        }, "").toLowerCase();

        return s.toLowerCase();
    };

    
    MacroPlayer.prototype.handleOnDownloadFile = function(uri, folder, filename) {
        var leafName = "", m = null;

        if ( uri && (m = uri.match(/\/([^\/?]+)(?=\?.+|$)/)) ) {
            leafName = m[1];
        } else {
            leafName = window.content.document.title;
        }
        if (filename == "*" || !filename) {
            filename = leafName;
        } else if (m = filename.match(/^\+(.*)$/)) {
            if (/\..+$/.test(leafName))
                filename = leafName.replace(/(.+)(\..+)$/, "$1"+m[1]+"$2");
            else 
                filename = leafName + m[1];
        } else if (!/\.[^\.]+$/.test(filename)) {
	    filename += leafName.replace(/(?:.+)(\.[^\.]+)$/, "$1");
	}
        var file;
        if (folder == "*" || !folder) {
            file = imns.Pref.getFilePref("defdownpath");
        } else {
            file = imns.FIO.openNode(folder);
        }

        
        var re = new RegExp('\\s*[:*?|<>\\"/]+\\s*', "g");
        filename = filename.replace(re, "_");
        file.append(filename);

        return file;
    };
    
    
    MacroPlayer.prototype.saveTargetAs = function(element) {
        
        this.clearDownloadDlgFlags();
        
        var e = element;
        while(e && e.nodeType == Node.ELEMENT_NODE &&
              !(e.hasAttribute("href") || e.hasAttribute("src"))
             )
            e = e.parentNode;
        if (!e || e.nodeType != Node.ELEMENT_NODE)
            throw new RuntimeError("can not find link to save target", 923);
        var link = e.hasAttribute("href") ? e.href : e.src;
        
        var file = this.handleOnDownloadFile(link, this.downloadFolder,
            this.downloadFilename);
        delete this.downloadFolder;
        delete this.downloadFilename;

        
        var ios = imns.Cc["@mozilla.org/network/io-service;1"]
          .getService(imns.Ci.nsIIOService);
        var uri = ios.newURI(link, null, null);
	Downloads.fetch(uri, file).then(
	    () => {
		if (!this.shouldWaitDownload)
		    return;

		if (this.downloadChecksum) {
                    var check = this.calculateFileHash(
			file, this.downloadCheckAlg
		    );

                    if (check != this.downloadChecksum) {
			
			this.showErrorAndStop(
                            new RuntimeError(
				"Checksum of downloaded file "+check+
                                    " does not match specified", 934),
                            this.ignoreErrors
			);
			this.downloadChecksum = "";
			this.downloadCheckAlg = "";
                    }
		}

                setTimeout(()=> this.playNextAction(), 0);
	    },
	    (err) => this.showErrorAndStop(err, this.ignoreErrors)
	);
    };


    
    MacroPlayer.prototype.savePictureAs = function(element) {
        
        
        this.clearDownloadDlgFlags();

        if (!element.hasAttribute("src"))
            throw new RuntimeError("can not save picture: no src attribute"+
                                   " found for element "+element.tagName, 923);
        
        var file = this.handleOnDownloadFile(element.src, this.downloadFolder,
            this.downloadFilename);
        delete this.downloadFolder;
        delete this.downloadFilename;
        
        var ios = imns.Cc["@mozilla.org/network/io-service;1"]
          .getService(imns.Ci.nsIIOService);
        var uri = ios.newURI(element.src, null, null);
        Downloads.fetch(uri, file).then(
            () => {
                if (!this.shouldWaitDownload)
                    return;
                setTimeout(()=> this.playNextAction(), 0);
            },
            (err) => this.showErrorAndStop(err, this.ignoreErrors)
        );
    };


    MacroPlayer.prototype.saveAsScreenshot = function(element) {
        
        
        this.clearDownloadDlgFlags();

        
        var file = this.handleOnDownloadFile(element.src, this.downloadFolder,
            this.downloadFilename);
        
        var folder = file.parent;
        var filename = file.leafName;
        var content_type, param;

        if (/\.jpe?g$/i.test(filename)) {
            content_type = "image/jpeg";
            param = "quality=100";
            type = "jpeg";
        } else if (/\.png$/i.test(filename)) {
            type = "png";
            content_type = "image/png";
            param = "";
        } else {
            type = "png";           
            content_type = "image/png";
            param = "";
            filename = /\.\w+$/.test(filename) ?
                filename.replace(/\.\w+$/, ".png") : filename + ".png";
        }

        var rect = element.getBoundingClientRect();
        var win = element.ownerDocument.defaultView;
        var doc = win.document;
        var doc_el = doc.documentElement;
        var body = doc.body;
        
        var clientTop = doc_el.clientTop || body.clientTop || 0;
        var clientLeft = doc_el.clientLeft || body.clientLeft || 0;
        var scrollX = win.scrollX || doc_el.scrollLeft || body.scrollLeft;
        var scrollY = win.scrollY || doc_el.scrollTop || body.scrollTop;

        var x1 = Math.round(rect.left + scrollX - clientLeft);
        var y1 = Math.round(rect.top  + scrollY - clientTop);

        var x2 = Math.round(rect.left + element.offsetWidth);
        var y2 = Math.round(rect.top  + element.offsetHeight);
        
        var canvasW = element.offsetWidth;
        var canvasH = element.offsetHeight;
        var canvas = document.createElementNS("http://www.w3.org/1999/xhtml",
            "canvas");
        canvas.style.width = canvasW+"px";
        canvas.style.height = canvasH+"px";
        canvas.width = canvasW;
        canvas.height = canvasH;
        var ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvasW, canvasH);
        ctx.save();
        ctx.drawWindow(win, x1, y1, x2, y2, "rgb(0,0,0)");
        ctx.restore();

        file = folder.clone();
        file.append(filename);

        
        
        var ios = imns.Cc["@mozilla.org/network/io-service;1"]
          .getService(imns.Ci.nsIIOService);
        var source = ios.newURI(canvas.toDataURL(content_type, param),
            "UTF8", null);
        var target = ios.newFileURI(file);
        Downloads.fetch(source, file).then(
            ()=> {}, (err) => this.showErrorAndStop(err, this.ignoreErrors)
        );
    };


    

    MacroPlayer.prototype.RegExpTable["onerrordialog"] =
        "^(?:button\\s*=\\s*(?:\\S*))?\\s*(?:\\bcontinue\\s*=\\s*(\\S*))?\\s*$"
    MacroPlayer.prototype.ActionTable["onerrordialog"] = function (cmd) {
        var param = cmd[1] ? imns.unwrap(this.expandVariables(cmd[1])) : "";
        if (/^no|false$/i.test(param)) {
            this.shouldStopOnError = true;
        }
    };


    
    MacroPlayer.prototype.RegExpTable["onlogin"] =
        "^user\\s*=\\s*("+im_strre+")\\s+"+
        "password\\s*=\\s*("+im_strre+")\\s*$";

    MacroPlayer.prototype.ActionTable["onlogin"] = function (cmd) {
        var storage = imns.storage;
        var pm = imns.getPasswordManager(),
            key = imns.getEncryptionKey();
        var obj = new Object();
        var username = imns.unwrap(this.expandVariables(cmd[1]));
        var password = imns.unwrap(this.expandVariables(cmd[2]));
        obj.accept = true;
        obj.username = username;
        
        if (pm.encryptionType != pm.TYPE_NONE) {
            try {
                obj.password =
                    Rijndael.decryptString(password, key);
            } catch (e) {
                
                var param = { reenter: true, password: "",
                    master: pm.encryptionType == pm.TYPE_STORED };
                window.openDialog('chrome://imacros/content/keydlg4.xul',
                                  '', 'modal,centerscreen', param);
                if (param.master) {
                    pm.setMasterPwd(param.password);
                    pm.encryptionType = pm.TYPE_STORED;
                } else {
                    pm.setSessionPwd(param.password);
                    pm.encryptionType = pm.TYPE_TEMP;
                }
                obj.password = Rijndael.decryptString(
                    password, param.password
                );
            }
        } else {
            obj.password = password;
        }
        
        obj.timeout = this.delay;
        var actions = storage.getObjectForWindow(
            iMacros.wid, "onDialogAction"
        );
        if (!actions) {
            actions = new Array();
        }
        actions.push(obj);
        storage.setObjectForWindow(iMacros.wid, "onDialogAction", actions);
    };


    
    
    MacroPlayer.prototype.RegExpTable["onprint"] = ".*";
    MacroPlayer.prototype.ActionTable["onprint"] = function (cmd) {
        throw new UnsupportedCommand("ONPRINT");
    };


    
    
    MacroPlayer.prototype.RegExpTable["onsecuritydialog"] = ".*";
    MacroPlayer.prototype.ActionTable["onsecuritydialog"] = function (cmd) {
        throw new UnsupportedCommand("ONSECURITYDIALOG");
    };



    
    
    MacroPlayer.prototype.RegExpTable["onwebpagedialog"] = ".*";
    MacroPlayer.prototype.ActionTable["onwebpagedialog"] = function (cmd) {
        throw new UnsupportedCommand("ONWEBPAGEDIALOG");
    };


    
    MacroPlayer.prototype.RegExpTable["pause"] = "^\\s*$";

    MacroPlayer.prototype.ActionTable["pause"] = function (cmd) {
        this.pause(function() {
            iMacros.panel.updateControlPanel();
        });
    };


    
    
    MacroPlayer.prototype.RegExpTable["print"] = ".*";
    MacroPlayer.prototype.ActionTable["print"] = function (cmd) {
        throw new UnsupportedCommand("PRINT");
    };


    
    MacroPlayer.prototype.RegExpTable["prompt"] =
        "^("+im_strre+")"+
        "(?:\\s+("+im_strre+")"+
        "(?:\\s+("+im_strre+"))?)?\\s*$";

    MacroPlayer.prototype.ActionTable["prompt"] = function (cmd) {
        var text = imns.unwrap(this.expandVariables(cmd[1]));
        var defval = cmd[3] ? imns.unwrap(this.expandVariables(cmd[3])) : "";
        var prompts = imns.Cc["@mozilla.org/embedcomp/prompt-service;1"]
            .getService(imns.Ci.nsIPromptService);

        if (typeof cmd[2] != "undefined") {
            var check = {value: false};
            var input = {value: defval};
            var result = prompts.prompt(window, "iMacros",
                                        text, input, null, check);
            if (typeof(result) != "undefined") {
                if (/!var([0-9])/i.test(cmd[2])) {
                    this.vars[imns.s2i(RegExp.$1)] = input.value;
                } else if (/[^!]\S*/.test(cmd[2])) {
                    this.setUserVar(cmd[2], input.value);
                }
            }
        } else {
            prompts.alert(window, "iMacros", text);
        }
    };


    
    MacroPlayer.prototype.RegExpTable["proxy"] =
        "^address\\s*=\\s*("+im_strre+")"+
        "(?:\\s+bypass\\s*=\\s*("+im_strre+")\\s*)?$";

    MacroPlayer.prototype.restoreProxySettings = function() {
        var pref = imns.prefsvc.getBranch("network.proxy.");
        pref.setCharPref("http", this.proxySettings.http);
        pref.setIntPref("http_port", this.proxySettings.http_port);
        pref.setCharPref("ssl", this.proxySettings.ssl);
        pref.setIntPref("ssl_port", this.proxySettings.ssl_port);
        pref.setCharPref("no_proxies_on", this.proxySettings.no_proxies_on);
        pref.setIntPref("type", this.proxySettings.type);
    };

    MacroPlayer.prototype.storeProxySettings = function() {
        var pref = imns.prefsvc.getBranch("network.proxy.");
        this.proxySettings = new Object();
        this.proxySettings.http = pref.getCharPref("http");
        this.proxySettings.http_port = pref.getIntPref("http_port");
        this.proxySettings.ssl = pref.getCharPref("ssl");
        this.proxySettings.ssl_port = pref.getIntPref("ssl_port");
        this.proxySettings.no_proxies_on = pref.getCharPref("no_proxies_on");
        this.proxySettings.type = pref.getIntPref("type");
    };

    
    

    MacroPlayer.prototype.ActionTable["proxy"] = function (cmd) {
        var address = imns.unwrap(this.expandVariables(cmd[1]));
        var bypass = cmd[2]? imns.unwrap(this.expandVariables(cmd[2])) : null;
        var pref = imns.prefsvc.getBranch("network.proxy.");

        
        if (/^__default__$/i.test(address)) {
            pref.clearUserPref("http");
            pref.clearUserPref("http_port");
            pref.clearUserPref("ssl");
            pref.clearUserPref("ssl_port");
            pref.clearUserPref("no_proxies_on");
            pref.clearUserPref("type");
            return;
        } else if (/^__none__$/i.test(address)) {
            pref.setIntPref("type", 0);
            return;
        }

        var addr_re = /^(?:(https?)\s*=\s*)?([\d\w\.]+):(\d+)\s*$/;
        var m = addr_re.exec(address);
        if (!m) {
            throw new BadParameter("server name or IP address with port number", 1);
        }

        if (!this.proxySettings) 
            this.storeProxySettings();

        var server = m[2];
        var port = imns.s2i(m[3]);

        if (!m[1]) {
            pref.setCharPref("http", server);
            pref.setIntPref("http_port", port);
            pref.setCharPref("ssl", server);
            pref.setIntPref("ssl_port", port);
        } else if (m[1].toLowerCase() == "http") {
            pref.setCharPref("http", server);
            pref.setIntPref("http_port", port);
        } else if (m[1].toLowerCase() == "https") {
            pref.setCharPref("ssl", server);
            pref.setIntPref("ssl_port", port);
        }

        if (bypass) {
            if (/^null$/i.test(bypass)) {
                pref.setCharPref("no_proxies_on", "");
            } else {
                pref.setCharPref("no_proxies_on",
                                 this.proxySettings.no_proxies_on+","+bypass);
            }
        }
        
        pref.setIntPref("type", 1);
    };


    
    
    MacroPlayer.prototype.RegExpTable["redial"] = ".*";
    MacroPlayer.prototype.ActionTable["redial"] = function (cmd) {
        throw new UnsupportedCommand("REDIAL");
    };


    
    MacroPlayer.prototype.RegExpTable["refresh"] = "^\\s*$";

    MacroPlayer.prototype.ActionTable["refresh"] = function (cmd) {
        getWebNavigation().reload(imns.Ci.nsIWebNavigation.LOAD_FLAGS_NONE);
    };



    
    MacroPlayer.prototype.RegExpTable["saveas"] =
        "^type\\s*=\\s*(\\S+)\\s+"+
        "folder\\s*=\\s*("+im_strre+")\\s+"+
        "file\\s*=\\s*("+im_strre+")\\s*$";

    MacroPlayer.prototype.ActionTable["saveas"] = function (cmd) {
        var folder = imns.unwrap(this.expandVariables(cmd[2]));
        var type = imns.unwrap(this.expandVariables(cmd[1])).toLowerCase();
        if (folder == "*") {
            folder = imns.Pref.getFilePref("defdownpath").path;
        }
        try {
            var f = imns.FIO.openNode(folder);
        } catch (e) {
            throw new RuntimeError("Wrong path "+folder, 932);
        }
        if (!f.exists())
            throw new RuntimeError("Path "+folder+" does not exists", 932);
        var file = imns.unwrap(this.expandVariables(cmd[3])), t;

        
        var __doc_name = function(win) {
            
            var name = win.location.pathname;
            if (/\/([^\/]*)$/.test(name))
                name = RegExp.$1;
            
            if (!name.length) {
                if (/^(?:www\.)(\S+)/.test(win.location.hostname))
                    name = RegExp.$1;
            }
            
            if (!name.length)
                name = win.document.title;
            
            if (!name.length)
                return "unknown";
            
            if (/^(.*)\.(?:\w+)$/.test(name))
                return RegExp.$1;

            return name;
        };

        
        var re = new RegExp('\\s*[:*?|<>\\"/]+\\s*', "g");
        
        if (type == "extract") {
            if (file == "*") {
                file = "extract.csv";
            } else if (t = file.match(/^\+(.+)$/)) {
                file = "extract"+t[1]+".csv";
            }
            
            file = file.replace(re, "_");

            var data = this.getExtractData();
            this.clearExtractData();
            data = data.replace(/\"/g, '""');
            data = '"'+data.replace(/\[EXTRACT\]/g, '","')+'"';
            f = imns.FIO.openNode(folder);
            f.append(file);
            imns.FIO.appendTextFile(f, data+"\r\n");
        } else {
            if (file == "*") {
                file = __doc_name(window.content);
            } else if (t = file.match(/^\+(.+)$/)) {
                file = __doc_name(window.content) + t[1];
            }
            file = file.replace(re, "_");

            var wbp = null, doc = window.content.document;
            wbp = imns.Cc['@mozilla.org/embedding/browser/nsWebBrowserPersist;1'];
            wbp = wbp.createInstance(imns.Ci.nsIWebBrowserPersist);
            var flags = wbp.PERSIST_FLAGS_REPLACE_EXISTING_FILES;
            wbp.persistFlags = flags;
            
            var f = imns.FIO.openNode(folder);
            
            if (type == "cpl") {
                if (!/html?$/.test(file))
                    file += ".htm";
                f.append(file);
                var files_dir = f.path.replace(/\.html?$/, "_files");
                files_dir = imns.FIO.openNode(files_dir);
                wbp.saveDocument(doc, f, files_dir, null, null, 0);
            } else if (type == "htm") {
                if (!/html?$/.test(file))
                    file += ".htm";
                f.append(file);
                wbp.saveDocument(doc, f, null, null, null, 0);
            } else if (type == "txt") {
                if (!/\.\w+$/.test(file))
                    file += ".txt";
                f.append(file);
                wbp.saveDocument(doc, f, null, "text/plain",
                                 wbp.ENCODE_FLAGS_FORMAT_FLOWED, 0);
            } else if (/^png|jpeg$/.test(type)) {
                this.savePageAsImage(window.content, file, f, type);
            } else {
                throw new BadParameter("iMacros for Firefox supports only "+
                                       "CPL|HTM|TXT|EXTRACT|PNG|JPEG SAVEAS types");
            } 
        }
    };

    
    MacroPlayer.prototype.savePageAsImage = function(win, filename, folder, type, callback) {
        var canvasW = win.innerWidth + win.scrollMaxX;
        var canvasH = win.innerHeight + win.scrollMaxY;
        if (canvasW > 10000)
            canvasW = 10000;
        if (canvasH > 10000)
            canvasH = 10000;
        var canvas = document.createElementNS("http://www.w3.org/1999/xhtml",
            "canvas");
        canvas.style.width = canvasW+"px";
        canvas.style.height = canvasH+"px";
        canvas.width = canvasW;
        canvas.height = canvasH;
        var ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvasW, canvasH);
        ctx.save();
        ctx.drawWindow(win, 0, 0, canvasW, canvasH, "rgb(0,0,0)");
        ctx.restore();

        var content_type, param;
        if (type == "jpeg") {
            content_type = "image/jpeg";
            param = "quality=100";
            if (!/\.jpe?g$/.test(filename))
                filename = /\.\w+$/.test(filename) ?
                filename.replace(/\.\w+$/, ".jpg") : filename + ".jpg";
        } else if (type == "png") {
            content_type = "image/png";
            param = "";
            if (!/\.png$/.test(filename))
                filename = /\.\w+$/.test(filename) ?
                filename.replace(/\.\w+$/, ".png") : filename + ".png";
        } else {
            return;    
        }
        var file = folder.clone();
        file.append(filename);

        
        
        var ios = imns.Cc["@mozilla.org/network/io-service;1"]
            .getService(imns.Ci.nsIIOService);
        var source = ios.newURI(canvas.toDataURL(content_type, param),
            "UTF8", null);
        var target = ios.newFileURI(file);
        Downloads.fetch(source, file).then(
            ()=> { if (callback) callback();},
            (err)=> this.showErrorAndStop(err, this.ignoreErrors)
        );
    };


    
    MacroPlayer.prototype.RegExpTable["screenshot"] =
        "^type\\s*=\\s*(browser|page)\\s+"+
        "(?:folder\\s*=\\s*("+im_strre+")\\s+)?"+
        "file\\s*=\\s*("+im_strre+")\\s*$";
    
    MacroPlayer.prototype.ActionTable["screenshot"] = function (cmd) {
        var type = cmd[1].toLowerCase();
        var folder = cmd[2] ?
            imns.unwrap(this.expandVariables(cmd[2])) : null;
        
        try {
            var f = !folder || folder == "*" ?
		imns.Pref.getFilePref("defdownpath") : 
		imns.FIO.openNode(folder);
        } catch (e) {
            throw new RuntimeError("Wrong path "+folder, 932);
        }

        if (!f.exists()) {
            throw new RuntimeError("Path "+folder+" does not exists", 932);
        }

        var file = imns.unwrap(this.expandVariables(cmd[3]));

        
        var __doc_name = function(win) {
            
            var name = win.location.pathname;
            if (/\/([^\/]*)$/.test(name))
                name = RegExp.$1;
            
            if (!name.length) {
                if (/^(?:www\.)(\S+)/.test(win.location.hostname))
                    name = RegExp.$1;
            }
            
            if (!name.length)
                name = win.document.title;
            
            if (!name.length)
                return "unknown";
            
            if (/^(.*)\.(?:\w+)$/.test(name))
                return RegExp.$1;

            return name;
        };
                
        if (file == "*") {
            file = __doc_name(type == "browser"? window : window.content);
        }

        
        
        var re = new RegExp('\\s*[:*?|<>\\"/]+\\s*', "g");

        file = file.replace(re, "_");

        this.savePageAsImage(
            (type == "browser" ? window : window.content), file, f, "png"
        );
    };


    
    MacroPlayer.prototype.RegExpTable["search"] =
        "^source\\s*=\\s*(txt|regexp):("+im_strre+")"+
        "(?:\\s+ignore_case\\s*=\\s*(yes|no))?"+
        "(?:\\s+extract\\s*=\\s*("+im_strre+"))?\\s*$";

    MacroPlayer.prototype.ActionTable["search"] = function (cmd) {
        var query = imns.unwrap(this.expandVariables(cmd[2]));
        var extract = cmd[4] ? imns.unwrap(this.expandVariables(cmd[4])) : "";
        var ignore_case = cmd[3] && /^yes$/i.test(cmd[3]) ? "i" : "";
        var search_re;
        
        
        if (extract && !(cmd[1].toLowerCase() == "regexp"))
            throw new BadParameter("EXTRACT has sense only for REGEXP search");

        switch (cmd[1].toLowerCase()) {
        case "txt":
            
            query = TagHandler.escapeChars(query);
            
            query = query.replace(/\*/g, '(?:[\r\n]|.)*');
            
            query = query.replace(/ /g, "\\s+");
            search_re = new RegExp(query, ignore_case);
            break;
        case "regexp":
            try {
                search_re = new RegExp(query, ignore_case);
            } catch(e) {
                throw new RuntimeError("Can not compile regular expression: "
                                       +query, 983);
            }
            break;
        }

        var root = this.currentWindow.document.documentElement;
        var found = search_re.exec(root.innerHTML);
        var mplayer = this;
        if (!found) {
            this.retry(function() {
                if (mplayer.ignoreErrors)
                    return;
                throw new RuntimeError(
                    "Source does not match to "+cmd[1]+"='"+
                        imns.unwrap(mplayer.expandVariables(cmd[2]))+"'",
                    926
                );
            }, "Element waiting...");
        }

        if (extract) {
            extract = extract.replace(/\$(\d{1,2})/g, function (match_str, x) {
                return found[x];
            });
            this.addExtractData(extract);
        }
    };



    
    MacroPlayer.prototype.RegExpTable["set"] =
        "^(\\S+)\\s+("+im_strre+")\\s*$";

    MacroPlayer.prototype.ActionTable["set"] = function (cmd) {
        var param = imns.unwrap(this.expandVariables(cmd[2]));
        
        switch(cmd[1].toLowerCase()) {
        case "!encryption":
            var pm = imns.getPasswordManager();
            switch(param.toLowerCase()) {
            case "no":
                pm.encryptionType = pm.TYPE_NONE; break;
            case "storedkey": case "yes":
                pm.encryptionType = pm.TYPE_STORED; break;
            case "tmpkey": 
                pm.encryptionType = pm.TYPE_TEMP; break;
            default:
                throw new BadParameter("!ENCRYPTION can be only "+
                                       "YES|NO|STOREDKEY|TMPKEY");
            }
            break;
        case "!imagefilter":
            this.shouldFilterImages = /^on$/i.test(param); break;
        case "!useragent":
            try {
                var branch = imns.prefsvc.getBranch("general.useragent.");
                if (!this.useragent) {
                    this.useragent = new Object();
                    if (branch.prefHasUserValue("override")) {
                        this.useragent.clear = false;
                        this.useragent.previousValue =
                            branch.getCharPref("override");
                    } else {
                        this.useragent.clear = true;
                    }
                }
                branch.setCharPref("override", param);
            } catch (e) {
                Components.utils.reportError(e);
            }
            break;
        case "!loop":
            if (this.firstLoop) {
                if (isNaN(imns.s2i(param)))
                    throw new BadParameter("!LOOP must be integer");
                this.currentLoop = imns.s2i(param);
                iMacros.panel.currentLoopValue = this.currentLoop;
            }
            break;
        case "!extract":
            this.clearExtractData();
            if (!/^null$/i.test(param))
                this.addExtractData(param);
            break;
        case "!extractadd":
            this.addExtractData(param); break;
        case "!extract_test_popup":
            this.shouldPopupExtract = /^yes$/i.test(param); break;
        case "!errorignore":
            this.ignoreErrors = /^yes$/i.test(param); break;
        case "!filestopwatch":
            var filename = param, file; 
            if (imns.FIO.isFullPath(filename)) {
                var file = imns.FIO.openNode(filename);
                if (!file.parent || !file.parent.exists())
                    throw new RuntimeError("Path "+file.parent.path+
                                           " does not exists", 932);
            } else {
                file = this.stopwatchFolder ||
                    imns.Pref.getFilePref("defdownpath");
                if (filename.indexOf(imns.FIO.psep) != -1 ) { 
                    var names = filename.split(imns.FIO.psep);
                    names.reverse();
                    while(names.length) {
                        file.append(names.pop());
                    }
                } else {
                    file.append(filename);
                }
            }
            try {
                imns.FIO.appendTextFile(file, "");
            } catch (e) {
                var reason = "";
                if (/ACCESS_DENIED/.test(e.toString()))
                    reason = ", access denied";
                throw new RuntimeError("can not write to STOPWATCH file: "+
                                       file.path+reason, 931);
            }
            this.stopwatchFile = file.clone();
            this.shouldWriteStopwatchFile = true;
            break;
        case "!folder_stopwatch":
            if (param.toLowerCase() == "no") {
                this.shouldWriteStopwatchFile = false;
            } else {
                try {
                    this.stopwatchFolder = imns.FIO.openNode(param);
                    if (!this.stopwatchFolder.isWritable()) {
                        throw new RuntimeError(
                            "can not write to STOPWATCH folder: access denied",
                            931);
                    }
                } catch (e) {
                    throw new RuntimeError("can not open STOPWATCH folder: "+
                                           param, 931);
                }
                this.shouldWriteStopwatchFile = true;
            }
            break;
        case "!stopwatch_header":
            if (param.toLowerCase() == "no") {
                this.shouldWriteStopwatchHeader = false;
            } else if (param.toLowerCase() == "yes") {
                this.shouldWriteStopwatchHeader = true;
            } else {
                throw new BadParameter(
                    "!STOPWATCH_HEADER can be set to YES|NO only"
                );
            }
            break;
        case "!folder_datasource":
            try {
                this.dataSourceFolder = imns.FIO.openNode(param);
                if (!this.dataSourceFolder.isWritable()) {
                    throw new RuntimeError(
                        "can not write to FOLDER_DATASOURCE: access denied",
                        931);
                }
            } catch (e) {
                throw new RuntimeError("can not open FOLDER_DATASOURCE: "+
                                       param, 931);
            }
            break;
        case "!datasource":
            this.loadDataSource(param); break;
        case "!datasource_line":
            var x = imns.s2i(param);
            if (isNaN(x) || x <= 0)
                throw new BadParameter("!DATASOURCE_LINE must be positive integer");
            if (this.dataSource.length < x)
                throw new RuntimeError("Invalid DATASOURCE_LINE value: "+
                                       param, 951);
            this.dataSourceLine = x;
            break;
        case "!datasource_columns":
            if (isNaN(imns.s2i(param)))
                throw new BadParameter("!DATASOURCE_COLUMNS must be integer");
            this.dataSourceColumns = imns.s2i(param);
            break;
        case "!datasource_delimiter":
            if (param.length > 1)
                throw new BadParameter("!DATASOURCE_DELIMITER must be single character");
            this.dataSourceDelimiter = param;
            break;
        case "!timeout": case "!timeout_page":
            var x = imns.s2i(param);
            if (isNaN(x) || x <= 0)
                throw new BadParameter("!TIMEOUT must be positive integer");
            this.timeout = x;
            this.tagTimeout = Math.round(this.timeout/10);
            break;
        case "!timeout_macro":
            var x = parseFloat(param);
            if (isNaN(x) || x <= 0)
                throw new BadParameter("!TIMEOUT_MACRO must be positive number");
            this.globalTimer.setMacroTimeout(x);
            break;
        case "!timeout_tag": case "!timeout_step":
            var x = imns.s2i(param);
            if (isNaN(x) || x < 0)
                throw new BadParameter("!TIMEOUT_TAG must be positive integer");
            this.tagTimeout = x;
            break;
        case "!replayspeed":
            switch(param.toLowerCase()) {
            case "slow":
                this.delay = 2000; break;
            case "medium":
                this.delay = 1000; break;
            case "fast":
                this.delay = 0; break;
            default:
                throw new BadParameter("!REPLAYSPEED can be SLOW|MEDIUM|FAST");
            }
            break;
        case "!singlestep":
            this.singleStepMode = /yes/i.test(param);
            break;
        case "!clipboard":
            imns.Clipboard.putString(param);
            break;
        case "!linenumber_delta":
            var x = imns.s2i(param);
            if (isNaN(x) || x > 0)
                throw new BadParameter("!LINENUMBER_DELTA must be negative integer or zero");
            this.linenumber_delta = x;
            break;
        case "!popup_allowed":
            var site = imns.str.trim(param);
            var pmgr = imns.Cc["@mozilla.org/permissionmanager;1"]
            .getService(imns.Ci.nsIPermissionManager);
            var ios = imns.Cc["@mozilla.org/network/io-service;1"]
            .getService(imns.Ci.nsIIOService);

            try {
                if (!/^[-\w]+:\/+/.test(site))
                    site = "http://"+site;
                var uri = ios.newURI(site, null, null);
            } catch(e) {
                throw new BadParameter("Wrong URL: "+param, 3);
            }

            if (this.popupAllowed) {
                var popup = this.popupAllowed;
                if (!popup.exists) {
                    pmgr.remove(popup.uri.host, "popup");
                } else if (popup.blocked) {
                    pmgr.add(popup.uri, "popup", pmgr.DENY_ACTION);
                }
                this.popupAllowed = null;
            }

            var permission = pmgr.testPermission(uri, "popup");
            var exists = permission != pmgr.UNKNOWN_ACTION,
                blocked = permission == pmgr.DENY_ACTION;
            if (!exists || blocked) {
                pmgr.add(uri, "popup", pmgr.ALLOW_ACTION);
                if (!exists)    
                    imns.Pref.setCharPref("popupAllowed", uri.host);
            }
            
            this.popupAllowed = 
                {exists: exists, uri: uri, blocked: blocked};
            
            break;

        case "!x_continue_load_after_stop":
            if (!/^(?:yes|no)$/i.test(param))
                throw new BadParameter("!X_CONTINUE_LOAD_AFTER_STOP"+
                                       " can be only YES|NO");
            this.loadAfterStop = /yes/i.test(param);
            break;

        case "!file_profiler":
            if (param.toLowerCase() == "no") {
                this.writeProfilerData = false;
                this.profiler.file = null;
            } else {
                this.writeProfilerData = true;
                this.profiler.enabled = true;
                this.profiler.file = param;
            }
            break;

        default:
            if (/^!var([0-9])$/i.test(cmd[1])) {
                this.vars[imns.s2i(RegExp.$1)] = param;
            } else if (/^!\S+$/.test(cmd[1])) {
                throw new BadParameter("Unsupported variable "+cmd[1]);
            } else {
                this.setUserVar(cmd[1], param);
            }
        }
    };

    MacroPlayer.prototype.globalTimer = {
        init: function() {
            if (this.macroTimeout) {
                clearTimeout(this.macroTimeout);
                this.macroTimeout = null;
            }
            
            this.macroTimeoutValue = null;
        },

        start: function() {
            this.startTime = new Date();
        },

        getElapsedTime: function() {
            if (!this.startTime)
                return 0;
            var now = new Date();
            return (now.getTime()-this.startTime.getTime())/1000;
        },

        setMacroTimeout: function(x) {
            if (this.macroTimeout) {
                clearTimeout(this.macroTimeout);
                this.macroTimeout = null;
            }
            this.macroTimeoutValue = x;
            var mplayer = iMacros.player;
            this.macroTimeout = setTimeout( function () {
                mplayer.showErrorAndStop(
                    new RuntimeError(
                        "Max. macro runtime was reached. Macro stopped.", 803)
                );
            }, Math.round(x*1000));
        },

        
        
        
        
        
        
        
        
        
        
        
        
        

        stop: function() {
            if (this.macroTimeout) {
                clearTimeout(this.macroTimeout);
                this.macroTimeout = null;
            }
            
            
            
            
        }
    };


    
    
    MacroPlayer.prototype.RegExpTable["size"] = ".*";
    MacroPlayer.prototype.ActionTable["size"] = function (cmd) {
        throw new UnsupportedCommand("SIZE");
    };


    
    MacroPlayer.prototype.RegExpTable["stopwatch"] =
        "^((?:(start|stop)\\s+)?id|label)\\s*=\\s*("+im_strre+")\\s*$";

    
    MacroPlayer.prototype.addTimeWatch = function(name) {
        this.watchTable[name] = this.globalTimer.getElapsedTime();
    };


    MacroPlayer.prototype.stopTimeWatch = function(name) {
        if (typeof this.watchTable[name] == "undefined")
            throw new RuntimeError("time watch "+name+" does not exist", 962);
        var elapsed = this.globalTimer.getElapsedTime() - this.watchTable[name];
        this.lastWatchValue = elapsed;
        var x = {id: name, type: "id", elapsedTime: elapsed,
            timestamp: new Date()};
        this.stopwatchResults.push(x);
    };


    MacroPlayer.prototype.addTimeWatchLabel = function(name) {
        var elapsed = this.globalTimer.getElapsedTime();
        this.lastWatchValue = elapsed;
        var x = {id: name, type: "label", elapsedTime: elapsed,
            timestamp: new Date()};
        this.stopwatchResults.push(x);
    };


    
    MacroPlayer.prototype.ActionTable["stopwatch"] = function (cmd) {
        var action = cmd[2] ? cmd[2].toLowerCase() : null;
        var use_label = /label$/i.test(cmd[1]);
        var param = imns.unwrap(this.expandVariables(cmd[3]));

        
        param = param.toUpperCase();
        
        if (!use_label) {
            var found = typeof this.watchTable[param] != "undefined";
            switch (action) {
            case "start":
                if (found)
                    throw new RuntimeError("stopwatch id="+param+
                                           " already started", 961);
                this.addTimeWatch(param);
                break;
            case "stop":
                if (!found)
                    throw new RuntimeError("stopwatch id="+param+
                                           " wasn't started", 962);
                this.stopTimeWatch(param);
                break;
            default:                
                if (found) 
                    this.stopTimeWatch(param);
                else 
                    this.addTimeWatch(param);
                break;
            }
        } else {
            
            this.addTimeWatchLabel(param);
        }
    };


    
    MacroPlayer.prototype.RegExpTable["tab"] = "^(t\\s*=\\s*(\\S+)|"+
        "close|closeallothers|open|open\\s+new|new\\s+open"+
        ")\\s*$";

    MacroPlayer.prototype.ActionTable["tab"] = function (cmd) {
        var browser = getBrowser();
        if (/^close$/i.test(cmd[1])) { 
            browser.removeCurrentTab();
        } else if (/^closeallothers$/i.test(cmd[1])) {
            
            let tabs = browser.visibleTabs;
            let tab = browser.selectedTab;
            for (let i = 0; i <tabs.length; i++) {
                if (tabs[i] != tab)
                    browser.removeTab(tabs[i]);
            }
            
            this.startTabIndex = 0;
        } else if (/open/i.test(cmd[1])) {
            browser.addTab();
        } else if (/^t\s*=/i.test(cmd[1])) {
            var n = imns.s2i(this.expandVariables(cmd[2]));
            if (isNaN(n))
                throw new BadParameter("T=<number>", 1);

            var tab_num = n+this.startTabIndex-1;
            var tabs = browser.tabContainer.childNodes;
            
            if (tab_num >= 0 && tab_num < tabs.length ) {
                browser.selectedTab = tabs[tab_num];
            } else {
                var self = this;
                this.retry(function() {
                    if (self.ignoreErrors)
                        return;
                    throw new RuntimeError("Tab number "+n+
                                       " does not exist", 971);
                }, "waiting for Tab...");
            }
        }

        this.currentWindow = window.content;
    };



    

    
    var TagHandler = {

        
        escapeChars: function(str) {
            var chars = "^$.+?=!:|\\/()[]{}", res = "", i, j;

            for ( i = 0; i < str.length; i++) {
                for (j = 0; j < chars.length; j++) {
                    if (str[i] == chars[j]) {
                        res += "\\";
                        break;
                    }
                }
                res += str[i];
            }

            return res;
        },

        
        
        parseAtts: function(str) {
            if (!str || str == "*")
                return null;
            var arr = str.split(new RegExp("&&(?=[-\\w]+:"+im_strre+")"));
            var atts = new Object(), at, val, m;
            const re = new RegExp("^([-\\w]+):("+im_strre+")$");
            for (var i = 0; i < arr.length; i++) {
                if (!(m = re.exec(arr[i])))
                    throw new BadParameter("incorrect ATTR or FORM specifier: "
                                           +arr[i]);
                at = m[1].toLowerCase();
                if (at.length) {
                    val = imns.unwrap(iMacros.player.expandVariables(m[2]));
                    
                    
                    
                    
                    val = imns.escapeTextContent(val);
                    val = this.escapeChars(val).replace(/\*/g, '(?:[\r\n]|.)*');
                    
                    val = val.replace(/ /g, "\\s+");
                    atts[at] = new RegExp("^\\s*"+val+"\\s*$", "i");
                } else {
                    atts[at] = new RegExp("^$");
                }
            }

            return atts;
        },

        
        match: function(node, atts) {
            var match = true;

            for (var at in atts) {
                if (at == "txt") {
                    var txt = imns.escapeTextContent(node.textContent);
                    if (!atts[at].exec(txt)) {
                        match = false; break;
                    }
                } else {
                    var atval = "", propval = "";
                    
                    if (at in node) {
                        propval = node[at];
                        
                        
                        
                        
                        
                        if (at == "type")
                            switch(propval) {
                            case "color":
                            case "date":
                            case "datetime":
                            case "datetime-local":
                            case "email":
                            case "month":
                            case "number":
                            case "range":
                            case "search":
                            case "tel":
                            case "time":
                            case "url":
                            case "week":
                                propval = "text";
                            }
                    } else if (at == "href" && "src" in node) {
                        
                        
                        propval = node.src;
                    }
                    
                    if (node.hasAttribute(at)) {
                        atval = node.getAttribute(at);
                    }
                    
                    if (!(!!atts[at].exec(propval) || !!atts[at].exec(atval))) {
                        match = false; break;
                    }
                } 
            }
            return match;
        },
        
        
        
        find: function(doc, root, pos, relative, tagName, atts, form_atts) {
            var xpath = "descendant-or-self", ctx = root, nodes = new Array();
            
            if (relative) {         
                xpath = pos > 0 ? "following" : "preceding";
                if (!(ctx = this.lastNode) || ctx.ownerDocument != doc)
                    return (this.lastNode = null);
            }
            if (tagName == "*") {
                xpath += "::*";
            } else {
                xpath += "::*[translate(local-name(),"+
                    "'ABCDEFGHIJKLMNOPQRSTUVWXYZ',"+
                    "'abcdefghijklmnopqrstuvwxyz')='"+
                    tagName.toLowerCase()+"']";
            }
            
            try {
                var result = doc.evaluate(xpath, ctx, null,
                    XPathResult.ORDERED_NODE_ITERATOR_TYPE,
                    null);
                var node = null;
                while (node = result.iterateNext()) {
                    nodes.push(node);
                }
            } catch (e) {
                Components.utils.reportError(e);
            }
            
            
            var count = 0, i, start, end, increment;
            if (pos > 0) {
                start = 0; end = nodes.length; increment = 1;
            } else if (pos < 0) {
                start = nodes.length-1; end = -1; increment = -1;
            } else {
                throw new BadParameter("POS=<number> or POS=R<number>"+
                                       " where <number> is a non-zero integer", 1);
            }

            
            if (form_atts && form_atts["name"] &&
                form_atts["name"].exec("NoFormName"))
                form_atts = null;

            
            for (i = start; i != end; i += increment) {
                
                
                var match = atts ? this.match(nodes[i], atts) : true;
                
                if (match && form_atts && nodes[i].form)
                    match = this.match(nodes[i].form, form_atts);
                if (match && ++count == Math.abs(pos)) {
                    
                    return (this.lastNode = nodes[i]);
                }
            }

            return (this.lastNode = null);
        },



        
        findByXPath: function(doc, root, xpath) {
            var nodes = new Array();
            
            try {
                var result = doc.evaluate(xpath, root, null,
                    XPathResult.ORDERED_NODE_ITERATOR_TYPE,
                    null);
                var node = null;
                while (node = result.iterateNext()) {
                    nodes.push(node);
                }
            } catch (e) {
                Components.utils.reportError(e);
                throw new RuntimeError("incorrect XPath expression: "+xpath, 981);
            }
            if (nodes.length > 1)
                throw new RuntimeError("ambiguous XPath expression: "+xpath, 982);
            if (nodes.length == 1)
                return nodes[0];

            return null;
        },
        

        
        findPosition: function(element, atts, form_atts) {
            
            
            var xpath = "descendant-or-self::*[translate(local-name(),"+
                "'ABCDEFGHIJKLMNOPQRSTUVWXYZ',"+
                "'abcdefghijklmnopqrstuvwxyz')='"+
                element.tagName.toLowerCase()+"']";
            var doc = element.ownerDocument;
            var ctx = doc.documentElement;
            var nodes = new Array(), count = 0;
            
            try {
                var res = doc.evaluate(xpath, ctx, null,
                    XPathResult.ORDERED_NODE_ITERATOR_TYPE,
                    null);
                var node = null;
                while (node = res.iterateNext()) {
                    nodes.push(node);
                }
            } catch (e) {
                Components.utils.reportError(e);
            }
            
            
            if (form_atts && form_atts["name"] &&
                form_atts["name"].exec("NoFormName"))
                form_atts = null;
            
            
            for (var i = 0; i < nodes.length; i++) {
                
                
                var match = atts ? this.match(nodes[i], atts) : true;
                
                if (match && form_atts && nodes[i].form)
                    match = this.match(nodes[i].form, form_atts);
                if (match) 
                    count++;
                if (nodes[i] == element)
                    break;
            }

            return count;
        },


        
        getOuterHTML: function (node) {
            if (!node)
                return;
            var doc = node.ownerDocument;
            var div = doc.createElement("div");
            div.appendChild(node.cloneNode(true));
            var s = div.innerHTML;
            div.innerHTML = "";
            return s;
        },

        
        onExtractParam: function(tagName, element, extract_type) {
            var tmp = "", i;
            var mplayer = iMacros.player;

            if (/^(txt|txtall)$/i.test(extract_type)) {
                tmp = RegExp.$1.toLowerCase();
                switch (tagName) {
                case "input": case "textarea":
                    mplayer.showAndAddExtractData(element.value);
                    break;
                case "select":
                    if (tmp == "txtall") {
                        var s = new Array(), options = element.options;
                        for (i = 0; i < options.length; i++) {
                            s.push(options[i].text);
                        }
                        mplayer.showAndAddExtractData(s.join("[OPTION]"));
                    } else {
                        var s = element.options[element.selectedIndex].text;
                        mplayer.showAndAddExtractData(s);
                    }
                    break;
                case "table":
                    tmp = "";
                    for ( i = 0; i < element.rows.length; i++) {
                        var row = element.rows[i], ar = new Array();
                        for (var j = 0; j < row.cells.length; j++) {
                            var field = row.cells[j].textContent;
                            field = field.replace(/\"/g, '""');
                            ar.push(field);
                        }
                        tmp += '"'+ar.join('","')+'"\n';
                    }
                    mplayer.showAndAddExtractData(tmp);
                    break;
                default:
                    mplayer.showAndAddExtractData(element.textContent);
                }
            } else if (/^htm$/i.test(extract_type)) {
                tmp = this.getOuterHTML(element);
                tmp = tmp.replace(/[\t\n\r]/g, " ");
                mplayer.showAndAddExtractData(tmp);
            } else if (/^href$/i.test(extract_type)) {
                if ("href" in element) 
                    mplayer.showAndAddExtractData(element["href"]);
                else if (element.hasAttribute("href"))
                    mplayer.showAndAddExtractData(elem.getAttribute("href"));
                else if ("src" in element)
                    mplayer.showAndAddExtractData(element["src"]);
                else if (element.hasAttribute("src"))
                    mplayer.showAndAddExtractData(elem.getAttribute("src"));
                else
                    mplayer.showAndAddExtractData("#EANF#");
            } else if (/^(title|alt)$/i.test(extract_type)) {
                tmp = RegExp.$1.toLowerCase();
                if (tmp in element)
                    mplayer.showAndAddExtractData(element[tmp]);
                else if (element.hasAttribute(tmp)) 
                    mplayer.showAndAddExtractData(elem.getAttribute(tmp));
                else
                    mplayer.showAndAddExtractData("#EANF#");
            } else if (/^checked$/i.test(extract_type)) {
                if (!/^(?:checkbox|radio)$/i.test(element.type))
                    throw new BadParameter("EXTRACT=CHECKED makes sense"+
                                           " only for check or radio boxes");
                mplayer.showAndAddExtractData(element.checked ? "YES" : "NO");
            } else {
                throw new BadParameter("EXTRACT=TXT|TXTALL|HTM|"+
                                       "TITLE|ALT|HREF|CHECKED", 5);
            }
        },

        
        onContentParam: function(tagName, element, content_value) {
            var tmp;
            var mplayer = iMacros.player;

            
            this.htmlFocusEvent(element);
            
            switch (tagName) {
            case "select":
                
                
                this.handleSelectElement(element, content_value);
                this.htmlChangeEvent(element);
                break;
            case "input":
                if (content_value)
                    content_value = imns.unwrap(
                        mplayer.expandVariables(content_value)
                    );
                switch(element.type) {
                case "text": case "hidden": case "file":
                    
                case "color": case "date": case "datetime":
                case "datetime-local": case "email": case "month":
                case "number": case "range": case "search":
                case "tel": case "time": case "url": case "week":
                    element.value = content_value;
                    this.htmlChangeEvent(element);
                    break;
                case "password":
                    this.handlePasswordElement(element, content_value);
                    this.htmlChangeEvent(element);
                    break;
                case "checkbox":
                    if (/^(?:true|yes|on)$/i.test(content_value)) {
                        if (!element.checked) 
                            element.click();
                    } else if (/^(?:false|no|off)$/i.test(content_value)) {
                        if (element.checked)
                            element.click();
                    } else {
                        element.click();
                    }
                    
                    
                    
                    
                    
                    break;
                default:
                    
                    this.simulateClick(element);
                }
                break;
            case "button":
                this.simulateClick(element);
                break;
            case "textarea":
                if (content_value)
                    content_value = imns.unwrap(
                        mplayer.expandVariables(content_value)
                    );
                element.value = content_value;
                this.htmlChangeEvent(element);
                break;
            default:
                
                
                this.simulateClick(element);
            }
            
            this.htmlBlurEvent(element);
        },


        
        handleSelectElement: function(element, content_value) {
            var mplayer = iMacros.player;
            
            const re = new RegExp(
                "^(?:([%$#])"+im_strre+")(?::\\1"+im_strre+")*$"
            );
            
            const idx_re = new RegExp("^\\d+(?::\\d+)*$");

            var m, split_re = null;
            
            if(m = content_value.match(re)) {
                var non_delimeter = "(?:\"(?:[^\"\\\\]|\\\\[0btnvfr\"\'\\\\])*\"|(?:[^:\\s]|:[^"+m[1]+"])+)";
                split_re = new RegExp("(\\"+m[1]+non_delimeter+")", "g");
            } else if (m = content_value.match(idx_re)) {
                split_re = new RegExp("(#?\\d+)", "g");
            } else if (content_value.toLowerCase() =="all") {
                
            } else {
                content_value = mplayer.expandVariables(content_value);
                if (!/^\d+$/.test(content_value))
                    throw new RuntimeError("Wrong format of CONTENT value", 911);
            }

            
            var g, opts = new Array();
            if (split_re) {
                
                while(g = split_re.exec(content_value)) {
                    opts.push(g[1]);
                }
            } else {
                opts.push(content_value);
            }
            
            var options = element.options;
            
            if (element.multiple)
                element.options.selectedIndex = -1; 

            if (opts.length > 1) 
                element.multiple = true;
            for (var i = 0; i < opts.length; i++) {
                if (/^([%$])(.*)$/i.test(opts[i])) {
                    var typ = RegExp.$1, found = false;
                    var val = imns.unwrap(mplayer.expandVariables(RegExp.$2));
                    val = this.escapeChars(val).
                        replace(/\*/g, '(?:[\r\n]|.)*');
                    val = new RegExp("^\\s*"+val+"\\s*$", "i");
                    for (var j = 0; j < options.length; j++) {
                        var o = options[j];
                        var test_str = (typ == "$") ?
                            imns.escapeTextContent(o.text) : o.value;
                        if (val.exec(test_str)) {
                            found = true;
                            options[j].selected = true;
                            break;
                        }
                    }
                    if (!found && !mplayer.ignoreErrors) {
                        throw new RuntimeError(
                            "Selected entry not available: '"+
                                opts[i]+"' [Box has "+
                                options.length+" entries]", 924);
                    }
                } else if (/^(\d+|#.+)$/.test(opts[i])) { 
                    var x = RegExp.$1;
                    if (/^#(.+)$/.test(x)) {
                        x = imns.unwrap(mplayer.expandVariables(RegExp.$1));
                    }
                    var idx = imns.s2i(x);
                    if (isNaN(idx))
                        throw new RuntimeError(
                            "Index value should follow #, got "+
                                "'"+x+"' instead", 925);
                    if ( idx > element.length && !mplayer.ignoreErrors )
                        throw new RuntimeError(
                            "Selected entry not available:"+
                                idx+" [Box has "+element.length+
                                " entries]", 924);
                    options[idx-1].selected = true;
                } else if (/^all$/i.test(content_value)) { 
                    for (var j = 0; j < options.length; j++)
                        options[j].selected = true;
                } else {
                    throw new RuntimeError(
                        "Unable to select entry specified by: "+
                            content_value, 925);
                }
            }
        },

        
        handlePasswordElement: function(element, content_value) {
            var data = "",
                pm = imns.getPasswordManager(),
                key = imns.getEncryptionKey();

            if (pm.encryptionType != pm.TYPE_NONE) {
                try {
                    data = Rijndael.decryptString(content_value, key);
                } catch (e) {
                    
                    var param = { reenter: true, password: "",
                        master: pm.encryptionType == pm.TYPE_STORED };
                    window.openDialog('chrome://imacros/content/keydlg4.xul',
                                      '', 'modal,centerscreen', param);
                    if (param.master) {
                        pm.setMasterPwd(param.password);
                        pm.encryptionType = pm.TYPE_STORED;
                    } else {
                        pm.setSessionPwd(param.password);
                        pm.encryptionType = pm.TYPE_TEMP;
                    }
                    data = Rijndael.decryptString(
                        content_value, param.password
                    );
                }
            } else {
                data = content_value;
            }
            element.value = data;
        },

        
        
        simulateClick: function(element) {
            if (element.click) {      
                element.click();
                return;
            }
            var details = {
                doc: element.ownerDocument,
                target: element,
                button: 0
            };
            details.type = "mouseover";
            iMacros.player.dispatchMouseEvent(details);
            details.clickCount = 1;
            details.type = "mousedown";
            iMacros.player.dispatchMouseEvent(details);
            details.type = "mouseup";
            iMacros.player.dispatchMouseEvent(details);
        },

        
        htmlChangeEvent: function(element) {
            if (!/^(?:input|select|textarea)$/i.test(element.tagName))
                return;
            var evt = element.ownerDocument.createEvent("Event");
            evt.initEvent("change", true, false);
            element.dispatchEvent(evt);
        },

        
        htmlFocusEvent: function(element) {
            if (!/^(?:a|area|label|input|select|textarea|button)$/i.
                test(element.tagName))
                return;
            var evt = element.ownerDocument.createEvent("Event");
            evt.initEvent("focus", false, false);
            element.dispatchEvent(evt);
        },

        
        htmlBlurEvent: function(element) {
            if (!/^(?:a|area|label|input|select|textarea|button)$/i.
                test(element.tagName))
                return;
            var evt = element.ownerDocument.createEvent("Event");
            evt.initEvent("blur", false, false);
            element.dispatchEvent(evt);
        },

        reset: function() {
            this.lastNode = null; 
        }

    };


    MacroPlayer.prototype.highlightElement = function(element) {
        element.style.outline = "1px solid blue";
    };

        
    
    MacroPlayer.prototype.TagHandler = TagHandler;
    
    
    const atts_re = "(?:[-\\w]+:"+im_strre+"(?:&&[-\\w]+:"+im_strre+")*|\\*?)";

    MacroPlayer.prototype.RegExpTable["tag"] =
        "^(?:pos\\s*=\\s*(\\S+)\\s+"+
        "type\\s*=\\s*(\\S+)"+
        "(?:\\s+form\\s*=\\s*("+atts_re+"))?\\s+"+
        "attr\\s*=\\s*("+atts_re+")"+
        "|xpath\\s*=\\s*("+im_strre+"))"+
        "(?:\\s+(content|extract)\\s*=\\s*"+
        "(\\d+(?::\\d+)*|"+                         
        "[%$]"+im_strre+"(?::[%$]"+im_strre+")*|"   
        +im_strre+"))?\\s*$";   

    MacroPlayer.prototype.ActionTable["tag"] = function (cmd) {
        var pos = 0;
        var relative = false;
        var tagName = "";
        var form = null, atts = null;
        var xpath = null;
        var txt = cmd[6] ? cmd[7] : null;
        var type = cmd[6] ? cmd[6].toLowerCase() : "";

        if (cmd[5]) {
            xpath = imns.unwrap(this.expandVariables(cmd[5]));
        } else {
            pos = imns.unwrap(this.expandVariables(cmd[1])), relative;
            tagName = imns.unwrap(this.expandVariables(cmd[2])).toLowerCase();
            form = TagHandler.parseAtts(cmd[3]);
            atts = TagHandler.parseAtts(cmd[4]);
            
            
            if (/^r(-?\d+)$/i.test(pos)) {
                pos = imns.s2i(RegExp.$1);
                relative = true;
            } else if (/^(\d+)$/.test(pos)) {
                pos = imns.s2i(RegExp.$1);
                relative = false;
            } else {
                throw new BadParameter(
                    "POS=<number> or POS=R<number>"+
                        "where <number> is a non-zero integer", 1
                );
            }
            
            if (/^(\S+):(\S+)$/i.test(tagName)) { 
                if (!atts) atts = new Object();
                var val = RegExp.$2;
                tagName = RegExp.$1.toLowerCase();
                val = TagHandler.escapeChars(val).
                    replace(/\*/g, '(?:[\r\n]|.)*');
                atts["type"] = new RegExp("^"+val+"$");
            }

        }
        
        
        var doc = this.currentWindow.document;
        var root = doc.documentElement;
        var element = xpath ? TagHandler.findByXPath(doc, root, xpath) :
            TagHandler.find(doc, root, pos, relative, tagName, atts, form);
        if (!element) {
            var self = this;
            this.retry(function() {
                if (type == "extract"){
                    self.showAndAddExtractData("#EANF#");
                } else {
                    if (type == "content" &&
                        /^event:fail_if_found$/i.test(txt))
                        return; 

                    throw new RuntimeError(
                        "element "+tagName.toUpperCase()+
                            " specified by "+(cmd[4] || '"'+xpath+'"')+
                            " was not found", 921);
                }
            }, "Tag waiting...");
        } else {
	    this.playingAgain = false;
            try {
                this.processElement(element, type, txt);
            } catch (e) {
                if (e.message &&
                    /^Selected entry not/.test(e.message) &&
                    this.nattempts) {
                    ;           
                } else {
                    throw e;
                }
            }
        }
    };


    MacroPlayer.prototype.processElement = function(element, type, txt) {
        
        if (this.shouldWaitDownloadDlg) {
            this.shouldWaitDownloadDlg = false;
            this.waitingForDownloadDlg = true;
        }

        
        if (imns.Pref.getBoolPref("scroll")) {
            var rect = element.getBoundingClientRect();
            this.currentWindow.scrollTo(rect.left, rect.top);
        }
        
        if (imns.Pref.getBoolPref("highlight")) {
            this.highlightElement(element);
        }
        
        var tagName = element.tagName.toLowerCase();
        var doc = this.currentWindow.document;
        
        if (type == "extract") {
            TagHandler.onExtractParam(tagName, element, txt);
        } else if (type == "content" || !type) {
            if (txt && /^event:(\S*)$/i.test(txt)) {
                var etype = RegExp.$1.toLowerCase();
                switch(etype) {
                case "saveitem": case "savepictureas":
                    this.savePictureAs(element);
                    break;
                case "save_element_screenshot":
                    this.saveAsScreenshot(element);
                    break;
                case "savetargetas": case "savetarget":
                    this.saveTargetAs(element);
                    break;
                case "mouseover":
                    var evt = doc.createEvent("MouseEvent");
                    evt.initMouseEvent("mouseover", true, true,
                                       doc.defaultView, 0, 0, 0, 0, 0,
                                       false, false, false, false, 0, null);
                    element.dispatchEvent(evt);
                    break;
                case "fail_if_found":
                    throw new RuntimeError("FAIL_IF_FOUND event", 990);
                    break;
                default:
                    throw new BadParameter("unknown event type: "+etype);
                }
            } else {
                TagHandler.onContentParam(tagName, element, txt);
            }
        }
    };




    
    MacroPlayer.prototype.RegExpTable["url"] =
        "^goto\\s*=\\s*("+im_strre+")\\s*$";

    MacroPlayer.prototype.ActionTable["url"] = function (cmd) {
        var param = imns.unwrap(this.expandVariables(cmd[1])), scheme = null;
        
        if (!/^([a-z]+):.*/i.test(param)) {
            param = "http://"+param;
        } 
        
        var ios = imns.Cc["@mozilla.org/network/io-service;1"]
            .getService(imns.Ci.nsIIOService);
        try {
            
            ios.newChannel(param, null, null);
        } catch (e) {
            Components.utils.reportError(e);
            throw new BadParameter("The URL syntax is not correct: '"+param+"'");
        }

        try {
            
            
            if (this.shouldWaitDownloadDlg) {
                this.shouldWaitDownloadDlg = false;
                this.waitingForDownloadDlg = true;
            }

            gBrowser.loadURI(param, null, null);
        } catch (e) {
            var s = e.toString();   
            
            
            if (/NS_ERROR_FILE_NOT_FOUND/.test(s))
                throw new RuntimeError("File "+param+" not found", 930);
            else
                throw e;
        }
    };



    
    MacroPlayer.prototype.RegExpTable["version"] = "^(?:build\\s*=\\s*(\\S+))?"+
        "(?:\\s+recorder\\s*=\\s*(\\S+))?\\s*$";
    MacroPlayer.prototype.ActionTable["version"] = function (cmd) {
        
    };


    
    MacroPlayer.prototype.RegExpTable["wait"] = "^seconds\\s*=\\s*(\\S+)\\s*$";

    function WaitReporter( delay ) {
        this.period = 100;         
        this.counter = Math.round(delay/this.period);
        if (this.counter <= 0)
            this.counter = 1;
        this.timer = imns.Cc["@mozilla.org/timer;1"].
        createInstance(imns.Ci.nsITimer);
        this.timer.initWithCallback(this, this.period,
                                    imns.Ci.nsITimer.TYPE_REPEATING_PRECISE);
        iMacros.player.inWaitCommand = true;
    }

    WaitReporter.prototype = {
        notify: function(timer) {
            var mplayer = iMacros.player;
            this.counter--;
            iMacros.panel.statLine1 = "Waiting: "+
                (this.counter/1000*this.period).toFixed(2).toString();
            if (!this.counter || !mplayer.playing || mplayer.pauseIsPending) {
                iMacros.panel.statLine1 = "";
                this.timer.cancel();
                mplayer.inWaitCommand = false;
                if (mplayer.pauseIsPending) {
                    mplayer.waitCommandSuspended = true;
                    mplayer.waitCommandRemains = this.counter*this.period;
                }
                setTimeout(function () { mplayer.playNextAction() }, 0);
            } 
        }
    };

    MacroPlayer.prototype.ActionTable["wait"] = function (cmd) {
        var param = Number(imns.unwrap(this.expandVariables(cmd[1])));
        
        if (isNaN(param))
            throw new BadParameter("SECONDS=<number>", 1);
        param = Math.round(param*10)*100; 
        if (param == 0)
            param = 10;
        else if (param < 0)
            throw new BadParameter("positive number of seconds", 1);
        new WaitReporter(param);
    };


    
    
    MacroPlayer.prototype.RegExpTable["winclick"] = ".*";
    MacroPlayer.prototype.ActionTable["winclick"] = function (cmd) {
        throw new UnsupportedCommand("WINCLICK");
    };


    
    
    MacroPlayer.prototype.RegExpTable["saveitem"] = ".*";
    MacroPlayer.prototype.ActionTable["saveitem"] = function (cmd) {
        
    };


    

    MacroPlayer.prototype.compileExpressions = function () {
        for (var x in this.RegExpTable) {
            try {
                this.RegExpTable[x] = new RegExp(this.RegExpTable[x], "i");
            } catch (e) {
                console.log("failed on compiling regexp "+x);
                throw e;
            }
        }
    };


    
    
    MacroPlayer.prototype.
    __defineGetter__("currentWindow",
                     function() {
                         if (!this.m_wnd ||
                             (Components.utils.isDeadWrapper &&
                              Components.utils.isDeadWrapper(this.m_wnd)) ||
                             this.m_wnd.closed ||
                             !this.m_wnd.document)
                             this.m_wnd = window.content;
                         return this.m_wnd;
                     }
                    );

    MacroPlayer.prototype.
    __defineSetter__("currentWindow",
                     function(new_wnd) { this.m_wnd = new_wnd; }
                    );


    
    MacroPlayer.prototype.onErrorOccurred = function(msg, url, line) {
        if (!this.playing || !this.shouldStopOnError)
            return;
        var data = msg+" on "+url+":"+line;
        iMacros.panel.showInfoMessage(data);
        this.stop();

    };


    MacroPlayer.prototype.handleSICommand = function(subject, topic, data) {
        if (subject != window)
                return;

        if (topic == "imacros-si-play") {
            var play_args = JSON.parse(data);
            var macro;
            if (play_args.type == "source")
                macro = play_args.source;
            else
                macro = imns.FIO.openNode(play_args.filePath);

            
            this.profiler.si_enabled = play_args.use_profiler;

            for (var x in play_args.vars)
                this.setUserVar(x, play_args.vars[x]);
            
            if (/\.js$/.test(play_args.filePath)) {
                iMacros.client_id = play_args.clientId;
                iMacros.playJSFile(macro);
            } else {
                iMacros.player.client_id = play_args.clientId;
                iMacros.player.play(macro);
            }
            iMacros.panel.updateControlPanel();

        } else if (topic == "imacros-si-capture") {
            var capture_args = JSON.parse(data);
            var file = imns.FIO.openNode(capture_args.filePath);
            var type = capture_args.type;
            this.savePageAsImage(
                (type == "browser" ? window : window.content),
                file.leafName,
                file.parent,
                "png"
            );
            var sicmd = imns.Cc["@iopus.com/sicmdlistener;1"].
                getService(imns.Ci.nsISupports).wrappedJSObject;
            sicmd.sendResponse(capture_args.clientId, "OK", 1);

        } else if (topic == "imacros-si-show") {
            var show_args = JSON.parse(data);
            iMacros.panel.showInfoMessage(show_args.message);
            var sicmd = imns.Cc["@iopus.com/sicmdlistener;1"].
                getService(imns.Ci.nsISupports).wrappedJSObject;
            sicmd.sendResponse(show_args.clientId, "OK", 1);
        } 
    };


    MacroPlayer.prototype.observe = function (subject, topic, data) {
        var mplayer = this;
        if (/^imacros-si-/.test(topic)) {
            this.handleSICommand(subject, topic, data);
        } else if (topic == "imacros-download-hook") {
            if (subject != window)
                return;
            this.clearDownloadDlgFlags();
            setTimeout(function () {
                mplayer.playNextAction()
            }, 0);
        }
    };


    MacroPlayer.prototype.registerObservers = function () {
        var mplayer = this;
        Downloads.getList(Downloads.PUBLIC).then(function(l) {
            l.addView(mplayer);
        });
        imns.osvc.addObserver(this, "imacros-download-hook", false);
        
    };


    MacroPlayer.prototype.unregisterObservers = function () {
        var mplayer = this;
        Downloads.getList(Downloads.PUBLIC).then(function(l) {
            l.removeView(mplayer);
        });
        imns.osvc.removeObserver(this, "imacros-download-hook", false);
    };


    MacroPlayer.prototype.onDownloadAdded = function(dl) {
        if (!this.playing || !this.shouldWaitDownload)
            return;
        
        
        
        
        
        
        
        
        if (dl.succeeded || dl.stopped)
            return;  
        this.waitingForDownload = true;
        this.downloadArray.push(dl);
        
        
        var mplayer = this;
        this.downloadStartTime = new Date();
        this.downloadInterval = setInterval(function () {
            var remains = mplayer.downloadStartTime.getTime() +
                mplayer.timeout*1000 - Date.now();
            if (remains <= 0) {
                if (!mplayer.playing || mplayer.ignoreErrors)
                    return;
                clearInterval(mplayer.downloadInterval);
                delete mplayer.downloadStartTime;
                delete mplayer.downloadInterval;
                dl.cancel();
                var idx = mplayer.downloadArray.indexOf(dl);
                if ( idx != -1 )
                    mplayer.downloadArray.splice(idx, 1);
                mplayer.showErrorAndStop(
                    new RuntimeError("Download timed out", 802)
                );

            } else {
                iMacros.panel.statLine2Status = "loading";
                imns.osvc.notifyObservers(
                    window, "imacros-delay-show",
                    "Download waiting..."+" "+(remains/1000).toFixed(1)+
                        "("+Math.round(mplayer.timeout)+")s");
            }
        }, 100);
    };
    
    MacroPlayer.prototype.onDownloadChanged = function(dl) {
        if (!this.playing || !this.shouldWaitDownload)
            return;

        
        
        
        if (!dl.cancelled && !dl.succeeded && !dl.stopped)
            return;

        var idx = this.downloadArray.indexOf(dl);
        if (idx == -1)
            return;  

        this.downloadArray.splice(idx, 1);
        if (this.downloadChecksum) {
            try {
                var targetFile = imns.FIO.openNode(dl.target.path);
                var check = this.calculateFileHash(
                    targetFile, this.downloadCheckAlg
                );
                if (check != this.downloadChecksum) {
                    
                    this.showErrorAndStop(
                        new RuntimeError(
                            "Checksum of downloaded file "+check+
                                " does not match specified", 934),
                        this.ignoreErrors
                    );
                    this.downloadChecksum = "";
                    this.downloadCheckAlg = "";
                }
            } catch (e) {
                this.showErrorAndStop(e, this.ignoreErrors);
            }
        }
        
        if (!this.downloadArray.length) {
            if (this.downloadInterval) {
		iMacros.panel.statLine2Status = "idle";
                clearInterval(this.downloadInterval);
                this.downloadInterval = null;
            }
            this.waitingForDownload = false;
            var mplayer = this;
            setTimeout(function () { mplayer.playNextAction(); }, 0);
        }
    };

    MacroPlayer.prototype.onDownloadRemoved = function(dl) {
        
    };



    

    function LCTimer() {
        this.counter = 0;
        this.period = 100;
        this.timer = imns.Cc["@mozilla.org/timer;1"].
          createInstance(imns.Ci.nsITimer);
    }

    LCTimer.prototype = {
        
        
        start: function(period) {
            this.counter = 0;
            this.period = period ? period : 100;
            this.timeout = iMacros.player.timeout ||
                imns.Pref.getIntPref("maxwait");
            this.timer.initWithCallback(this, this.period,
                                        imns.Ci.nsITimer.TYPE_REPEATING_SLACK);
        },

        
        stop: function() {
            this.timer.cancel();
            imns.osvc.notifyObservers(window, "imacros-delay-show", "");
        },

        onTimeout: function() {
            this.stop();
            if (!iMacros.playing)
                return;
            if (!iMacros.player.ignoreErrors) {
                iMacros.player.showErrorAndStop(
                    new RuntimeError("Page loading timeout"+
                    ", URL: "+iMacros.player.requestURL+", line "+
                    iMacros.player.currentLine, 802)
                );
                
                const stopFlags = imns.Ci.nsIWebNavigation.STOP_ALL;
                getWebNavigation().stop(stopFlags);
            } else {
                iMacros.player.waitingForPageLoad = false;
                iMacros.player.stopLoadTimer();
                setTimeout(function () {
                    iMacros.player.playNextAction()
                }, 0);
            }
        },
        
        
        notify: function(timer) {
            
            this.counter++;
            var elapsed_time = this.counter*this.period/1000;
            if (elapsed_time >= this.timeout) {
                
                this.onTimeout();
                return;
            }
            elapsed_time = elapsed_time.toFixed(2).toString();
            imns.osvc.notifyObservers(window,
                                      "imacros-delay-show",
                                      "Loading: "+elapsed_time+'('+
                                      this.timeout.toString()+')s');
        }
    };


    
    MacroPlayer.prototype.startLoadTimer = function() {
        if (this.loadTimer) {
            this.loadTimer.stop();
            this.loadTimer = null;
        }
        this.loadTimer = new LCTimer();
        this.loadTimer.start();
        iMacros.panel.statLine2Status = "loading";
    };
    
    MacroPlayer.prototype.stopLoadTimer = function() {
        if (this.loadTimer) {
            this.loadTimer.stop();
            iMacros.panel.statLine2Status = "idle";
            this.loadQueue = new Array();
        }
    };

    MacroPlayer.prototype.__defineGetter__("hasActiveLoads", function() {
        var wp = getBrowser().webProgress;
        return wp.isLoadingDocument;
    });


    
    MacroPlayer.prototype.onStateChange = function(progress, req, flag, stat) {
        var url = null;
        
        if (!this.playing)
            return;
        
        const STATE_START = imns.Ci.nsIWebProgressListener.STATE_START;
        const STATE_STOP = imns.Ci.nsIWebProgressListener.STATE_STOP;
        const STATE_REDIRECTING = imns.Ci.nsIWebProgressListener.STATE_REDIRECTING;
        const STATE_TRANSFERRING = imns.Ci.nsIWebProgressListener.STATE_TRANSFERRING;
        const STATE_NEGOTIATING = imns.Ci.nsIWebProgressListener.STATE_NEGOTIATING;

        const STATE_IS_NETWORK = imns.Ci.nsIWebProgressListener.STATE_IS_NETWORK;
        const STATE_IS_REQUEST = imns.Ci.nsIWebProgressListener.STATE_IS_REQUEST;
        const STATE_IS_DOCUMENT = imns.Ci.nsIWebProgressListener.STATE_IS_DOCUMENT;
        const STATE_IS_WINDOW = imns.Ci.nsIWebProgressListener.STATE_IS_WINDOW;

        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        

        
        
        
        if (!(flag & STATE_IS_NETWORK))
            return;     
        
        if(flag & STATE_START) {
            
            
            try {
                if (!this.waitingForPageLoad) {
                    if (req) {
                        let url = req.QueryInterface(imns.Ci.nsIChannel).
                            originalURI.spec;
                        
                        
                        
                        if (! /^(?:https?|file):\/\//.test(url))
                            return;
                        this.requestURL = url;
                    }
                    
                    this.waitingForPageLoad = true;
                    this.startLoadTimer();
                    this.networkErrorProxyConnection = false;
                    this.networkErrorHTTPCode = 0;
                }
            } catch (e) {
                Components.utils.reportError(e);
            }
        } else if(flag & STATE_STOP) { 
            if (!this.waitingForPageLoad)
                return;
            
            
            
            
            
            
	    
	    
	    const NS_IMAGELIB_ERROR_LOAD_ABORTED = 0x80540008;
	    const NS_ERROR_PARSED_DATA_CACHED = 0x805D0021;
	    const NS_BINDING_ABORTED = 0x804B0002;
            this.networkError = !(Components.isSuccessCode(stat) ||
                                  stat == NS_IMAGELIB_ERROR_LOAD_ABORTED ||
                                  stat == NS_ERROR_PARSED_DATA_CACHED ||
                                  stat == NS_BINDING_ABORTED);
	    
            if (this.networkError) {
                
		
                
                
                
                
                
                if (stat == Cr.NS_ERROR_PROXY_CONNECTION_REFUSED)
                    this.networkErrorProxyConnection = true;
            } else {
                
                try {
                    var x = req.QueryInterface(imns.Ci.nsIHttpChannel);
                    
                    
                    
                    
                    
                    
                    if (!x.requestSucceeded ) {
                        this.networkError = true;
                        this.networkErrorHTTPCode = x.responseStatus;
                    }
                } catch(e) {
                    
                    
                    
                }
            }
            this.waitingForPageLoad = false;
            this.stopLoadTimer();
            setTimeout(function () {
		iMacros.player.playNextAction()
	    }, 0);
        }
    };

    MacroPlayer.prototype.onLocationChange =
        function(progress, request, uri) {};

    MacroPlayer.prototype.onProgressChange =
        function(progress, request, cur_self_progress, max_self_progress,
                 cur_total_progress, max_total_progress) {};

    MacroPlayer.prototype.onStatusChange =
        function(progress, request, status, message) {};

    MacroPlayer.prototype.onSecurityChange =
        function(web_progress, request, state) {};

    MacroPlayer.prototype.QueryInterface = function(iid) {
        if (iid.equals(imns.Ci.nsIWebProgressListener) ||
            iid.equals(imns.Ci.nsISupportsWeakReference) ||
            iid.equals(imns.Ci.nsISupports))
            return this;
        throw Components.results.NS_NOINTERFACE;
    };


    MacroPlayer.prototype.checkAlertFoxCompatibility = function(line, num, iDrone) {
        const forbiddenCommands = new RegExp(
            "^(?:pause|prompt|clear|ds|size|imageclick|imagesearch|print)$",
            "i");

        const forbiddenVariables = new RegExp(
            "^(?:timeout_macro|clipboard|filestopwatch|file_profiler|"+
            "folder_datasource|folder_stopwatch|loop|singlestep|datasource)$",
            "i");


        if (/^\s*(\w+)(?:\s+(.*))?$/.test(line)) {
            var command = RegExp.$1.toLowerCase();
            if (forbiddenCommands.test(command)) {
                throw new Error(
                    "Command "+command+" on line "+(num+1)+
                        " is not compatible with Alertfox"
                );
            }
        }

        if (/^\s*set\s+!(\w+)/i.test(line)) {
            var variable = RegExp.$1.toLowerCase();
            if (forbiddenVariables.test(variable)) {
                throw new Error(
                    "Variable !"+variable+
                        " on line "+(num+1)+" is not compatible with Alertfox"
                );
            } else if (variable == "encryption") {
                if (!/!encryption\s+no\s*$/i.test(line) && !iDrone) {
                    throw new Error(
                        "Only iDrone allows encrypted passwords"
                    );
                }
            }
        }
    };


    
    MacroPlayer.prototype.parseMacro = function(warnOnLoop, AFTest) {
        const comment = new RegExp("^\\s*(?:'.*)?$");
        const linenumber_delta_re =
            new RegExp("^\\s*'\\s*!linenumber_delta\\s*:\\s*(-?\\d+)", "i");
        
        this.source = this.source.replace(/\r+/g, ""); 
        var lines = this.source.split("\n");

        for (var i = 0; i < lines.length; i++) {
            
            let m = lines[i].match(linenumber_delta_re);
            if (m) {
                this.linenumber_delta = imns.s2i(m[1]);
                continue;
            }
            
            if (lines[i].match(comment)) {
                continue;
            }

            if (AFTest) {
                
                this.checkAlertFoxCompatibility(lines[i], i, AFTest.iDrone);
            }

            if ( warnOnLoop && /{{!loop}}/i.test(lines[i]) &&
                 !imns.Pref.getBoolPref('noloopwarning') ) {
                warnOnLoop = false;
                window.openDialog('chrome://imacros/content/loopwarning.xul',
                                  '', 'modal,centerscreen');
            }
            
            if (/^\s*(\w+)(?:\s+(.*))?$/.test(lines[i])) {
                var command = RegExp.$1.toLowerCase();
                var arguments = RegExp.$2 ? RegExp.$2 : "";
                
                if (!(command in this.RegExpTable))
                    throw new SyntaxError("unknown command: "+
                                          command.toUpperCase()+
                                          ", line "+(i+1));
                
                
                var args = this.RegExpTable[command].exec(arguments);
                if ( !args )
                    throw new SyntaxError(
                        "wrong format of "+command.toUpperCase()+" command"+
                            ", line "+(i+1+this.linenumber_delta)
                    );

                if (AFTest) {
                    this.actions.push({name: "clear", args: [], line: 0});
                    this.actions.push({name: "set", args: [
                        "", "!TIMEOUT_MACRO", "300"
                    ], line: 0});
                    this.actions.push({name: "tab", args: [
                        "", "T=", "1"
                    ], line: 0});
                    this.actions.push({name: "tab", args: [
                        "", "CLOSEALLOTHERS"
                    ], line: 0});
                    this.actions.push({name: "set", args: [
                        "", "!LINENUMBER_DELTA", "-5"
                    ], line: 0});
                }
                
                this.actions.push({name: command,
                                   args: args, line: i+1});
                
            } else {
                throw new SyntaxError("can not parse macro line: "+lines[i]);
            }
        }
    };
    
    
    
    
    
    MacroPlayer.prototype.play = function(macro, times, name, AFTest) {
        const comment = new RegExp("^\\s*(?:'.*)?$");
        
        try {
            
            this.reset();
            
            this.registerObservers();
            this.old_window_onerror = window.onerror;
            window.onerror = function(msg, url, line) {
                iMacros.player.onErrorOccurred(msg, url, line);
            };
            
            var browser = getBrowser();
            
            
            
            browser.addProgressListener(this);

            if (typeof(macro) != "string") {
                if (!macro.exists()) 
                    throw new RuntimeError("Macro "+macro.leafName+
                                           " not found", 930);

                this.source = imns.FIO.readTextFile(macro);
                if (!this.source.length) 
                    throw new RuntimeError(
                        "File "+macro.path+
                            " is empty or can not be read", 931
                    );
                name = name || macro.leafName;
                iMacros.currentMacro = {name: name, path: macro.path};
            } else {
                this.source = macro;
                name = name || "Embedded macro";
                iMacros.currentMacro = {name: name, path: null};
            }

            var line_re = /\r?\n/g, count = 0;
            while (line_re.exec(this.source))
                count++;

            if (count > imns.Pref.getIntPref("maxMacroLength")) {
                var msg = "Macro length exceeds "+
                    imns.Pref.getIntPref("maxMacroLength")+
                    " lines, this might take too long to load.\n\n"+
                    "Would you like to proceed?\n\n"+
                    "Note: You can disable this warning message by "+
                    "increasing the"+
                    "\n\"extensions.imacros.maxMacroLength\" parameter.";
                if (!imns.Dialogs.confirm(msg)) {
                    this.stop();
                    return;
                }
            }
            
            
            if (!times || times < 0)
                times = 1;
            else if (times > 1)
                this.cycledReplay = true;
            var warnOnLoop = !(this.cycledReplay || iMacros.in_iimPlay ||
                               this.client_id);
            
            this.parseMacro(warnOnLoop, AFTest);

            this.playing = true;
            
            iMacros.panel.statLine3 = name;
            iMacros.panel.showLines(this.source);
            iMacros.panel.updateControlPanel();
            
            this.player = this.getPlayer(times);
            setTimeout(function () {
                iMacros.player.playNextAction();
            }, 0);
        } catch (e) {
            Components.utils.reportError(e);
            this.showErrorAndStop(e);
        }
    };


    MacroPlayer.prototype.playNextAction = function() {
        if ( this.pauseIsPending ) {
            this.pauseIsPending = false;
            this.paused = true;
            if (this.pauseCallback) {
                this.pauseCallback();
                this.pauseCallback = null;
            }
            return;
        } else if (this.waitCommandSuspended) {
            this.waitCommandSuspended = false;
            new WaitReporter(this.waitCommandRemains);
            return;
        } else if ( this.paused ||
                    this.waitingForDelay ||    
                    this.waitingForDownload || 
                    this.waitingForDownloadDlg || 
                    this.waitingForPageLoad || 
                    this.waitingForImage ||    
                    this.waitingForImageSearch ||
                    this.inEventsCommand ||    
                    this.inWaitCommand ) { 
                return;
        } else if (this.networkError) {
            
            
            this.networkError = false;
            if (!this.ignoreErrors) {
                var msg = "Error loading page "+
                    this.requestURL;
                var code = -1001;
                if (this.networkErrorProxyConnection) {
                    code = -935;
                    msg += " (Proxy server refused connection)";
                } else {
                    code = -933;
                    if (this.networkErrorHTTPCode) {
                        msg += " (HTTP status code "+
                            this.networkErrorHTTPCode +")";
                    }
                }
                msg += ", line "+this.currentLine;
                this.showErrorAndStop(new RuntimeError(msg, code));
            } else {
                setTimeout(function () {
                    iMacros.player.playNextAction()
                }, this.delay);
            }
        } else {
            if (!this.player) 
                return;
            if (!this.player.next()) 
                this.stop();         
        }
    };



    MacroPlayer.prototype.stop = function() {    
        if (this.player) {
            
            try {
                this.player.close();
            } catch(ex) {
                Components.utils.reportError(ex);
            } finally {
                this.player = null;
            }
            
            this.unregisterObservers();
            
            var browser = getBrowser();
            browser.removeProgressListener(this);
            window.onerror = this.old_window_onerror;
            
            this.stopLoadTimer();
            
            if (this.downloadDlgTimeout) {
                clearTimeout(this.downloadDlgTimeout);
                this.downloadDlgTimeout = null;
            }
            
            this.profiler.end("OK", 1, this);
        }

        if (this.__eventsInterval) {
            clearInterval(this.__eventsInterval);
            delete this.__eventsInterval;
        }

        if (this.retryInterval) {
            clearInterval(this.retryInterval);
            delete this.retryInterval;
        }

        if (this.writeProfilerData) {
            this.saveProfilerData();
        }

        if (this.proxySettings) {
            
            
            this.restoreProxySettings();
            this.proxySettings = null;
        }

        if (this.errorCode != 1) 
            this.saveStopwatchResults();
        
        this.vars = new Array(10);
        this.userVars = new Object();

        
        
        this.m_wnd = null;
        
        TagHandler.reset();
        
        if (this.popupAllowed) {
            var pmgr = imns.Cc["@mozilla.org/permissionmanager;1"]
                .getService(imns.Ci.nsIPermissionManager);
            var popup = this.popupAllowed;
            if (!popup.exists) {
                pmgr.remove(popup.uri.host, "popup");
            } else if (popup.blocked) {
                pmgr.add(popup.uri, "popup", pmgr.DENY_ACTION);
            }
            this.popupAllowed = null;
            imns.Pref.clearPref("popupAllowed");
        }

        
        iMacros.panel.currentLoopValue = 1;

        
        this.clearDownloadDlgFlags();

        
        if (!this.loadAfterStop) {
            getWebNavigation().stop(imns.Ci.nsIWebNavigation.STOP_ALL);
        }

        
        try {
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
            
        } catch (e) {
            Components.utils.reportError(e);
        }

        
        window.removeEventListener("click", this.onClickHandler, true);

        this.playing = false;
        if (!iMacros.in_iimPlay) {
            
            
            iMacros.panel.showMacroTree();
            if (this.client_id) {   
                var sicmd = imns.Cc["@iopus.com/sicmdlistener;1"].
                    getService(imns.Ci.nsISupports).wrappedJSObject;
                var extra = {
                    extractData: this.getExtractData(),
                    lastPerformance: this.lastPerformanceArray,
                };
                if (this.profiler.si_enabled) {
                    delete this.profiler.si_enabled;
                    extra.profilerData =
                        this.profiler.getResultingXMLFragment(this);
                }
                sicmd.sendResponse(
                    this.client_id,
                    this.errorMessage,
                    this.errorCode,
                    extra
                );
                delete sicmd.clients[this.client_id].in_use;
                delete this.client_id;
            }
        }
    };


    
    MacroPlayer.prototype.saveStopwatchResults = function() {
        
        this.globalTimer.stop();

        
        this.totalRuntime = this.globalTimer.getElapsedTime();
        

        
        let format = function(x) {
            let m = x.toFixed(3).match(/^(\d+)\.(\d{3})/);
            let s = m[1];
            while (s.length < 5)
                s = "0"+s;
            
            return s+"."+m[2];
        };
        
        this.lastPerformance = "Total Runtime="+
            format(this.totalRuntime)+"[!S!]";

        if (!this.lastPerformanceArray)
            this.lastPerformanceArray = new Array();

        this.lastPerformanceArray.push(
            {
                name: "TotalRuntime",
                value: this.totalRuntime.toFixed(3).toString()
            }
        );
        
        const delim = this.dataSourceDelimiter;
        let newline = imns.is_windows() ? "\r\n" : "\n";
        let s = "";
        if (this.shouldWriteStopwatchHeader) {
            
            let now = new Date();
            let d = imns.formatDate("yyyy/mm/dd", now);
            let t = imns.formatDate("hh:nn", now);
            s = "\"Date: "+d+"  Time: "+t+
                ", Macro: "+iMacros.currentMacro.name+
                ", Status: "+this.errorMessage+" ("+this.errorCode+")\""+
                delim+delim+delim;
            s += newline;
        }

        if (!this.stopwatchResults || !this.stopwatchResults.length)
            return;

        for (var i = 0; i < this.stopwatchResults.length; i++) {
            
            let r = this.stopwatchResults[i];
            let timestamp = imns.formatDate("yyyy/mm/dd"+delim+"hh:nn:ss",
                                            r.timestamp);
            s += timestamp+delim+r.id+delim+r.elapsedTime.toFixed(3).toString();
            s += newline;
            this.lastPerformance += r.id+"="+
                format(r.elapsedTime)+"[!S!]";
            this.lastPerformanceArray.push(
                {
                    name: r.id,
                    value: r.elapsedTime.toFixed(3).toString()
                }
            );
        }

        
        if (!this.shouldWriteStopwatchFile)
            return;

        let file = null;

        if (this.stopwatchFile) {
            file = this.stopwatchFile;
        } else {
            if (this.stopwatchFolder) 
                file = this.stopwatchFolder;
            else
                file = imns.Pref.getFilePref("defdownpath");

            let filename = /^(.+)\.iim$/.test(iMacros.currentMacro.name) ?
                RegExp.$1 : iMacros.currentMacro.name;
            file.append("performance_"+filename+".csv");
        }

        try {
            imns.FIO.appendTextFile(file, s);
        } catch (e) {
            this.errorCode = -931;
            this.errorMessage = "RuntimeError: "+
                "Can not write to file "+file.path;
            iMacros.panel.showErrorMessage(
                this.errorMessage, this.errorCode
            );
        }
    };


    MacroPlayer.prototype.pause = function (callback) {
        if (!this.paused) {
            this.pauseCallback = callback;
            this.pauseIsPending = true;
        }
    };


    MacroPlayer.prototype.unPause = function (callback) {
        if (!this.paused) {
            this.pauseIsPending = false;
            return;
        }
        setTimeout(function () {
            iMacros.player.paused = false;
            if (callback)
                callback();
            iMacros.player.playNextAction();
        }, 0);
    };


    MacroPlayer.prototype.isPaused = function() {
        return this.paused;
    };

    
    MacroPlayer.prototype.exec = function(action) {
        this.ActionTable[action.name].call(this, action.args);
        this.waitingForDelay = true;

        setTimeout(function () {
            iMacros.player.waitingForDelay = false;
            iMacros.player.playNextAction();
        }, this.delay);

        if (this.singleStepMode)
            iMacros.pause();
        return true;
    };


    MacroPlayer.prototype.profiler = {
        
        make_str: function(x) {
            var prepend = function(str, num) {
                str = str.toString(); 
                var x = imns.s2i(str), y = imns.s2i(num);
                if (isNaN(x) || isNaN(y))
                    return;
                while (str.length < num)
                    str = '0'+str;
                return str;
            };
            var str = prepend(x.getHours(), 2)+":"+
                prepend(x.getMinutes(), 2)+":"+
                prepend(x.getSeconds(), 2)+"."+
                prepend(x.getMilliseconds(), 3);
            return str;
        },

        init: function() {
            this.profiler_data = new Array();
            this.macroStartTime = new Date();
        },

        start: function(action) {
            if (!this.enabled)
                return;
            if (this.currentAction !== action) { 
                this.currentAction = action;
                this.startTime = new Date();
            }
        },

        
        end: function(err_text, err_code, mplayer) {
            if (!this.enabled || !this.startTime)
                return;
            var now = new Date();
            var elapsedTime = (now.getTime()-this.startTime.getTime())/1000;

            
            var data = {
                Line: this.currentAction.line+mplayer.linenumber_delta,
                StartTime: this.make_str(this.startTime),
                EndTime: this.make_str(now),
                ElapsedSeconds: elapsedTime.toFixed(3),
                StatusCode: err_code,
                StatusText: err_text,
                type: mplayer.ignoreErrors ? "errorignoreyes" : "errorignoreno"
            };
            
            
            if (this.currentAction.name == "tag") {
                var threshold = (mplayer.tagTimeout > 0) ?
                    mplayer.tagTimeout : mplayer.timeout/10;
                
                data.timeout_threshold =
                    ((elapsedTime/threshold)*100).toFixed();
            } else if (this.currentAction.name == "url") {
                
                data.timeout_threshold =
                    ((elapsedTime/mplayer.timeout)*100).toFixed();
            }
            
            this.profiler_data.push(data);

            
            delete this.currentAction;
            delete this.startTime;
        },

        getResultingXMLFragment: function(mplayer) {
            if (!this.enabled)
                return "";
            var macroEndTime = new Date();
            var source = imns.str.trim(mplayer.source).split("\n");
            var doc = document.implementation.createDocument("", "Profile", null);
            var macro = doc.createElement("Macro");
            var name = doc.createElement("Name");
            name.textContent = iMacros.currentMacro.name;
            macro.appendChild(name);

            var lastStartTime = null; 

            
            var j = mplayer.linenumber_delta == 0 ? 0 :
                -mplayer.linenumber_delta;
            for (var i = 0; i < source.length; i++) {
                if (j < this.profiler_data.length &&
                    this.profiler_data[j].Line == i+1+mplayer.linenumber_delta) {
                    var command = doc.createElement("Command");
                    var string = doc.createElement("String");
                    
                    string.textContent = imns.str.trim(source[i]);
                    command.appendChild(string);
                    var x = this.profiler_data[j];
                    for (var y in x) {
                        if (y != "type" && y != "timeout_threshold") {
                            var z = doc.createElement(y);
                            z.textContent = x[y];
                            command.appendChild(z);
                        }
                    }
                    
                    command.setAttribute("type", x.type);
                    
                    if (x.timeout_threshold) {
                        command.setAttribute("timeout_threshold",
					     x.timeout_threshold);
                    }
                    lastStartTime = x.StartTime;
                    j++;
                    
                    macro.appendChild(command);
                }
            }

            
            var start = doc.createElement("Start"); 
            start.textContent = this.make_str(this.macroStartTime);
            var end = doc.createElement("End"); 
            end.textContent = this.make_str(macroEndTime);
            var elapsed = doc.createElement("ElapsedSeconds"); 
            var duration = (macroEndTime.getTime()-
                            this.macroStartTime.getTime())/1000;
            elapsed.textContent = duration.toFixed(3);
            var status = doc.createElement("Status"); 
            var code = doc.createElement("Code");
            code.textContent = mplayer.errorCode;
            var text = doc.createElement("Text");
            text.textContent = mplayer.errorMessage;
            
            status.appendChild(code);
            status.appendChild(text);
            macro.appendChild(start);
            macro.appendChild(end);
            macro.appendChild(elapsed);
            macro.appendChild(status);
            
            doc.documentElement.appendChild(macro);
            var s = new XMLSerializer();
            var result = s.serializeToString(doc);

            return result.replace(/^[.\n\r]*<Profile>\s*/, "").replace(/\s*<\/Profile>/, "");
        }
    };

    MacroPlayer.prototype.saveProfilerData = function() {
        var xml_frag = this.profiler.getResultingXMLFragment(this);
        var file = null;
        if (this.profiler.file) { 
            if (imns.FIO.isFullPath(this.profiler.file)) {
                file = imns.FIO.openNode(this.profiler.file);
            } else {
                file = imns.Pref.getFilePref("defdownpath");
                var leafname = /\.xml$/i.test(this.profiler.file)?
                    this.profiler.file : this.profiler.file+".xml";
                file.append(leafname);
            }
        } else {
            file = imns.Pref.getFilePref("defdownpath");
            file.append("Firefox_Profiler_"+
                        imns.formatDate("yyyy-mm-dd")+".xml");
        }

        if (file.exists()) {
            var x = imns.FIO.readTextFile(file);
            x = x.replace(/\s*<\/Profile>\s*$/, "\n"+
                          xml_frag+"</Profile>");
            imns.FIO.writeTextFile(file, x);
        } else {
            var x = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n"+
                "<?xml-stylesheet type='text/xsl' href='Profiler.xsl'?>\n"+
                "<Profile>\n"+
                "<!--Profiled with iMacros for Firefox "+
                imns.Pref.getCharPref("version")+
                " on "+(new Date())+"-->";
            x += xml_frag;
            x += "</Profile>";
            imns.FIO.writeTextFile(file, x);
        }
    }

    
    MacroPlayer.prototype.getPlayer = function(times) {
        while (this.currentLoop++ < times) {
            this.beforeEachRun();
            iMacros.panel.currentLoopValue = this.currentLoop;

            var actions = this.actions.slice(0); 
            actions.reverse();     

            while (actions.length || this.playingAgain) {
                var action = this.playingAgain? this.lastAction : actions.pop();
                this.lastAction = action;
                iMacros.panel.highlightLine(action.line);
                this.currentLine = action.line+this.linenumber_delta;
                try {
                    
                    this.profiler.start(action);
                    
                    yield (this.exec(action));
                    
                    this.profiler.end("OK", 1, this);
                } catch (e if e instanceof ShouldWaitSignal) {
                    if (e.delay) {
                        setTimeout(function () {
                            iMacros.player.waitingForDelay = false;
                            iMacros.player.playNextAction();
                        }, e.delay);
                    }
                    yield true;
                }  catch (e) {
                    Components.utils.reportError(e);
                    
                    this.profiler.end(e.toString(), e.errnum, this);
                    if (!this.ignoreErrors) {
                        this.errorCode = e.errnum ?
                            -1*Math.abs(e.errnum) : -1001;
                        this.errorMessage = (e.name ? e.name : "Error")+": "+
                            e.message+", line "+ this.currentLine;
                        iMacros.panel.showErrorMessage(this.errorMessage,
                                                  this.errorCode);
                        yield false;
                    }
                }
            }
            this.firstLoop = false;
            this.afterEachRun();
        }
        yield false;
    };



    MacroPlayer.prototype.beforeEachRun = function() {
        
        this.watchTable = new Object();
        this.stopwatchResults = new Array();
        this.totalRuntime = 0;
        this.stopwatchFile = null;  
        this.stopwatchFolder = null; 
        this.shouldWriteStopwatchFile = true; 
        this.shouldWriteStopwatchHeader = true;
        
        this.lastWatchValue = 0;
        this.lastPerformance = "";
        this.lastPerformanceArray = new Array();

        
        this.globalTimer.start();

        
        this.popupAllowed = null;

        
        this.shouldWaitDownloadDlg = false;

        
        this.currentLine = 0;

        
        this.loadAfterStop = true;

        
        this.proxySettings = null;

        
        this.useragent = null;

        
        this.clearExtractData();

        
        
        
        

        
        this.writeProfilerData = imns.Pref.getBoolPref("profiler-enabled");
        this.profiler.file = null;
        
        this.profiler.init();
        this.profiler.enabled = this.profiler.si_enabled ||
            imns.Pref.getBoolPref("profiler-enabled");
    };


    MacroPlayer.prototype.afterEachRun = function() {
        
        this.saveStopwatchResults();
        
        
        var watcher = getRequestWatcher();
        watcher.enableImageFilter(false);

        
        if (this.writeProfilerData) {
            this.saveProfilerData();
            this.writeProfilerData = false;
        }
        
        if (this.popupAllowed) {
            var pmgr = imns.Cc["@mozilla.org/permissionmanager;1"]
            .getService(imns.Ci.nsIPermissionManager);
            var popup = this.popupAllowed;
            if (!popup.exists) {
                pmgr.remove(popup.uri.host, "popup");
            } else if (popup.blocked) {
                pmgr.add(popup.uri, "popup", pmgr.DENY_ACTION);
            }
            this.popupAllowed = null;
            imns.Pref.clearPref("popupAllowed");
        }

        
        if (this.proxySettings) {
            this.restoreProxySettings();
            this.proxySettings = null;
        }

        if (this.useragent) {
            var branch = imns.prefsvc.getBranch("general.useragent.");
            if (this.useragent.clear) {
                branch.clearUserPref("override");
            } else {
                branch.setCharPref("override", this.useragent.previousValue);
            }
            this.useragent = null;
        }
    };

    
    MacroPlayer.prototype.reset = function() {
        
        this.m_wnd = null;
        
        this.shouldStopOnError = false;

        
        this.globalTimer.init();

        
        this.actions = new Array();
        
        this.source = "";
        
        this.ignoreErrors = false;
        this.playing = false;
        this.paused = false;
        this.pauseIsPending = false;
        this.waitCommandSuspended = false;
        this.inWaitCommand = false;
        this.inEventsCommand = false;
        
        this.currentLoop = 0;
        this.firstLoop = true;
        
        this.playingAgain = false;
        
        this.downloadArray = new Array();
        this.waitingForDownload = false;
        this.waitingForPageLoad = false;
        this.networkError = false;
        this.networkErrorProxyConnection = false;
        this.networkErrorHTTPCode = 0;
        this.downloadFilename = null;
        this.downloadFolder = null;
        this.downloadCheckAlg = "";
        this.downloadChecksum = "";
        
        this.loadTimer = null;
        this.loadQueue = new Array();
        
        this.extractData = "";
        this.shouldPopupExtract = true;
        
        this.dataSource = new Array();
        this.dataSourceColumns = 0;
        this.dataSourceLine = 0;
        this.dataSourceFile = "";
        this.dataSourceDelimiter = ",";
        this.dataSourceFolder = imns.Pref.getFilePref("defdatapath");
        
        this.timeout = imns.Pref.getIntPref("maxwait");
        this.tagTimeout = Math.round(this.timeout/10);
        this.delay = imns.Pref.getIntPref("delay");
        
        this.shouldFilterImages = true;
        
        this.shouldDownloadPDF = false;
        
        this.startTabIndex = getBrowser().mTabContainer.selectedIndex;
        
        this.errorCode = 1;
        this.errorMessage = "OK";
        
        this.singleStepMode = false;
        this.waitingNextStep = false;
        
        this.cycledReplay = false;
        
        this.linenumber_delta = 0;
        
        
        iMacros.panel.mboxResetError();

        
        
        var popup = imns.Pref.getCharPref("popupAllowed");
        if (popup) {
            var pmgr = imns.Cc["@mozilla.org/permissionmanager;1"]
            .getService(imns.Ci.nsIPermissionManager);
            pmgr.remove(popup, "popup");
            imns.Pref.clearPref("popupAllowed");
        }


        
        
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

        
        this.onClickHandler = function (e) { iMacros.player.onClick(e); };
        window.addEventListener("click", this.onClickHandler, true);

        
        this.warnCommands = null;

        
        TagHandler.reset();
    };


    MacroPlayer.prototype.onClick = function(e) {
        var elem = e.explicitOriginalTarget;
        if (elem.nodeType != Node.ELEMENT_NODE)
            elem = e.originalTarget;
        if (!elem.ownerDocument.URL ||
            !/^(?:https?|ftp|file):\/\//.test(elem.ownerDocument.URL))
            return;
        
        if (this.shouldDownloadPDF) {
            
            if (e.button != 0)
                return;
            
            var element = elem;
            while(element &&
                  element.nodeType == Node.ELEMENT_NODE &&
                  !element.hasAttribute("href"))
                element = element.parentNode;
            if (!element || element.nodeType != Node.ELEMENT_NODE)
                return;
            var leafName = "", m = null;
            if ( !/\/(?:[^\/?]+\.pdf(?:\.gz)?)(?=\?.+|$)/.test(element.href) )
                return;
            this.shouldDownloadPDF = false;
            this.saveTargetAs(element);
            e.preventDefault();
            e.stopPropagation();
        }
    },


    
    MacroPlayer.prototype.setUserVar = function(name, value) {
        this.userVars[name.toLowerCase()] = value;
    };

    MacroPlayer.prototype.getUserVar = function(name) {
        return this.userVars[name.toLowerCase()];
    };

    MacroPlayer.prototype.hasUserVar = function(name) {
        return this.userVars.hasOwnProperty(name.toLowerCase());
    };


    
    MacroPlayer.prototype.getExtractData = function () {
        return this.extractData;
    };

    MacroPlayer.prototype.addExtractData = function(str) {
        if ( this.extractData.length ) {
            this.extractData += "[EXTRACT]"+str;
        } else {
            this.extractData = str;
        }
    };

    MacroPlayer.prototype.clearExtractData = function() {
        this.extractData = "";
    };


    
    MacroPlayer.prototype.showAndAddExtractData = function(str) {
        this.addExtractData(str);
        if (!this.shouldPopupExtract ||
            iMacros.in_iimPlay ||
            this.client_id ||
            this.cycledReplay
           )
            return;
        var param = {extractData: str};
        window.openDialog('chrome://imacros/content/extract.xul', '',
                          'modal,centerscreen', param);
    }; 



    
    MacroPlayer.prototype.loadDataSource = function(filename) {
        var file;
        if (filename.indexOf(imns.FIO.psep) == -1) {
            file = this.dataSourceFolder.clone();
            file.append(filename);
        } else {
            file = imns.FIO.openNode(filename);
        }
        if (!file.exists()) 
            throw new RuntimeError("Data source file does not exist", 930);
        this.dataSourceFile = file.path;
        var data = imns.FIO.readTextFile(file);
        if (!/\r?\n$/.test(data))
            data += "\n";     
        this.dataSource = new Array();
        
        
        const ws = '[ \t\v]';   
                                
        const delim = this.dataSourceDelimiter;
        const field = ws+'*("(?:[^\"]+|"")*"|[^'+delim+'\\n\\r]*)'+ws+
            '*('+delim+'|\\r?\\n|\\r)';
        var re = new RegExp(field, "g"), m, vals = new Array();
        while (m = re.exec(data)) {
            var value = m[1], t;
            if (t = value.match(/^\"((?:[\r\n]|.)*)\"$/))
                value = t[1];   
            value = value.replace(/\"{2}/g, '"'); 

            
            
            
            
            if (t = value.match(/^\"((?:[\r\n]|.)*)\"$/))
                value = '"\\"'+t[1]+'\\""';
            vals.push(value);

            if (m[2] != delim) {
                this.dataSource.push(vals.slice(0));
                vals = new Array();
            }
        }

        if (!this.dataSource.length)
            throw new RuntimeError("Can not parse datasource file "+
                                   filename, 952);
    };


    MacroPlayer.prototype.getColumnData = function (col) {
        var line =  this.dataSourceLine || this.currentLoop;

        if (!line) 
            line = 1;

        var max_columns = this.dataSourceColumns || this.dataSource[line-1].length;
        if (col > max_columns)
            throw new RuntimeError("Column number "+col+
                                   " greater than total number"+
                                   " of columns "+max_columns, 953);
        
        return this.dataSource[line-1][col-1];
    };


    MacroPlayer.prototype.evalString = function(s) {
        var str = s ? imns.unwrap(s) : "";
        var err = function(txt) {
            throw new MacroError(txt, -1340);
        };

        
        var sandbox = Components.utils.Sandbox(this.currentWindow);

        sandbox.importFunction(err, "MacroError")
        var result = Components.utils.evalInSandbox(str, sandbox);
        
        return (typeof result == "undefined" ? "" : result).toString();
    };


    
    
    
    
    MacroPlayer.prototype.expandVariables = function(param) {
        
        param = param.replace(/#novar#\{\{/ig, "#NOVAR#{");
        
        var mplayer = this;
        var handleVariable = function (match_str, var_name) {
            var t = null;
            if ( t = var_name.match(/^!var([0-9])$/i) ) {
                return mplayer.vars[imns.s2i(t[1])];
            } else if ( t = var_name.match(/^!extract$/i) ) {
                return mplayer.getExtractData();
            } else if ( t = var_name.match(/^!errorignore$/i) ) {
                return mplayer.ignoreErrors ? "YES" : "NO";
            } else if ( t = var_name.match(/^!encryption$/i) ) {
                var pm = imns.getPasswordManager();
                switch(pm.encryptionType) {
                case pm.TYPE_NONE:
                    return "NO"; break;
                case pm.TYPE_STORED:
                    return "STOREDKEY"; break;
                case pm.TYPE_TEMP:
                    return "TMPKEY"; break; 
                }
            } else if ( t = var_name.match(/^!loop$/i) ) {
                return mplayer.currentLoop;
            } else if ( t = var_name.match(/^!urlcurrent$/i) ) {
                return window.content.document.location.toString();
            } else if ( t = var_name.match(/^!now:(\S+)$/i) ) {
                return imns.formatDate(t[1]).toString();
            } else if ( t = var_name.match(/^!col(\d+)$/i) ) {
                return mplayer.getColumnData(imns.s2i(t[1]));
            } else if ( t = var_name.match(/^!datasource_line$/i) ) {
                return mplayer.dataSourceLine || mplayer.currentLoop;
            } else if ( t = var_name.match(/^!datasource_columns$/i) ) {
                return mplayer.dataSourceColumns;
            } else if ( t = var_name.match(/^!datasource_delimiter$/i) ) {
                return mplayer.dataSourceDelimiter;
            } else if ( t = var_name.match(/^!datasource$/i) ) {
                return mplayer.dataSourceFile;
            } else if ( t = var_name.match(/^!folder_datasource$/i) ) {
                return mplayer.dataSourceFolder.path;
            } else if ( t = var_name.match(/^!stopwatchtime$/i) ) {
                
                var value = mplayer.lastWatchValue.toFixed(3).toString();
                return value;
            } else if ( t = var_name.match(/^!clipboard$/i) ) {
                return imns.Clipboard.getString() || "";
            } else if ( t = var_name.match(/^!timeout(?:_page)?$/i) ) {
                return mplayer.timeout;
            } else if ( t = var_name.match(/^!timeout_(?:tag|step)?$/i) ) {
                return mplayer.tagTimeout;
            } else if ( t = var_name.match(/^!timeout_macro$/i) ) {
                return mplayer.globalTimer.macroTimeoutValue || "undefined";
            } else if ( t = var_name.match(/^!singlestep$/i) ) {
                return mplayer.singleStepMode.toString();
            } else if ( t = var_name.match(/^!replayspeed$/i) ) {
                if  (mplayer.delay <= 100 ) {
                    return "FAST";
                } else if (mplayer.delay <= 1000) {
                    return "MEDIUM";
                } else {
                    return "SLOW";
                }
            } else {                
                var value = "__undefined__";
                if (mplayer.hasUserVar(var_name))
                    value = mplayer.getUserVar(var_name);
                return value;
            }
        };


        
        var eval_re = new RegExp("^eval\\s*\\((.*)\\)$", "i");
        var match = null;
        if (match = eval_re.exec(param)) {
            var escape = function (s) {
                var x = s.toString();
                return x.replace(/"/g, "\\\\\"").
                    replace(/'/g, "\\\\\'").
                    replace(/\n/g, "\\\\n").
                    replace(/\r/g, "\\\\r");
            };
            var js_str = match[1].replace(/\{\{(\S+?)\}\}/g, function(m, s) {
                return escape(handleVariable(m, s))
            });
            
            js_str = js_str.replace(/#novar#\{(?=[^\{])/ig, "{{");
            param = this.evalString(js_str);
        } else {
            param = param.replace(/\{\{(\S+?)\}\}/g, handleVariable);
            
            param = param.replace(/#novar#\{(?=[^\{])/ig, "{{");
        }

        return param;
    };

    return new MacroPlayer();
})();
