




var iMacros = ( function() {
    const Cu = Components.utils;
    let {imns} = Cu.import("resource://imacros/utils.js");
    let {SOAPClient} = Cu.import("resource://imacros/SOAPClient.js");

    var obj = {};

    
    obj.GUID = "{81BF1D23-5F17-408D-AC6B-BD6DF7CAF670}";

    obj.__defineGetter__("recorder", function() {
        return this.conv_recorder;
    });

    obj.__defineGetter__("playing", function() {
        return this.player && this.player.playing;
    });

    obj.__defineGetter__("jsplaying", function() {
        return this.jsplayer2 && this.jsplayer2.playing;
    });

    obj.__defineGetter__("recording", function() {
        return this.recorder && this.recorder.recording;
    });

    obj.__defineGetter__("paused", function() {
        if (this.recording && this.recorder.isPaused())
            return "recording";
        else if (this.playing && this.player.isPaused())
            return "playing";
        else if (this.jsplaying && this.jsplayer2.isPaused())
            return "jsplaying";
        else
            return null;
    });


    obj.__defineGetter__("currentMacro", function() {
        return this._currentMacro || null;
    });


    obj.__defineSetter__("currentMacro", function(x) {
        if (typeof(x) != "object")
            return;
        this._currentMacro = new Object();
        this._currentMacro.name = x.name;
        this._currentMacro.path = x.path;
    });

    
    
    obj.reviseAddonUpdated = function () {
        var version, prefv = imns.Pref.getCharPref("version");
        if (!imns.reviseLock)
            imns.reviseLock = true;
        else
            return;

        

        AddonManager.getAddonByID(this.GUID, function(addon) {
            version = addon.version;
            if (!prefv) {
                imns.Pref.setCharPref("version", version);
                prefv = imns.Pref.getCharPref("imacros-version", true);
                if (prefv) {
                    imns.Pref.clearPref("imacros-version", true);
                } else {
                    setTimeout(function() {
                        iMacros.onFirstTime();
                    }, 2000);
                    return;
                }
            }

            if (prefv != version) {
                
                imns.Pref.setCharPref("version", version);
                setTimeout(function() { iMacros.onUpdate() }, 2000);
            }
        });
    };

        
        
    obj.addTab = function(url) {
        var browser = getBrowser();
        if (window.content.document.location.href == "about:blank")
            window.content.document.location = url;
        else
            browser.selectedTab = browser.addTab(url);
    };


    obj.copySampleMacros = function(ask) {
        var ds = imns.Cc["@mozilla.org/file/directory_service;1"];
        ds = ds.getService(imns.Ci.nsIProperties);
        var samples = ds.get("ProfD", imns.Ci.nsILocalFile);
        samples.append("extensions");
        samples.append(this.GUID);
        samples.append("samples");

        var portable = ds.get("ProfD", imns.Ci.nsILocalFile);
        portable.append("iMacros");

        var macros = samples.clone();
        macros.append("Macros");

        var datasources = samples.clone();
        datasources.append("Datasources");

        var xsl_file = samples.clone(), xsl_dst;
        xsl_file.append("Profiler.xsl");
        
        var home, t, tdst, pdst;
        home = ds.get(imns.is_windows() ? "Pers" : "Home",
                      imns.Ci.nsILocalFile);
        home.append("iMacros");

        
        imns.FIO.makeDirectory(home.path);

        if (!imns.Pref.getFilePref("deflogpath")) {
            imns.Pref.setFilePref("deflogpath", home);
        }
        
        
        if (!portable.exists())
            imns.FIO.makeDirectory(portable.path);
        
        
        pdst = portable.clone();
        pdst.append("Macros");
        if (!pdst.exists())
            imns.FIO.makeDirectory(pdst.path);
        pdst.append("Demo-Firefox");
        if (!pdst.exists())
            imns.FIO.makeDirectory(pdst.path);
        
        imns.FIO.copyFiles(macros.path, pdst.path);

        if (ask) {
            
            var param = {copy: false, path: null};
            window.openDialog("chrome://imacros/content/smplcopy.xul",
                              "", "modal,centerscreen", param);
            if (!param.copy)
                return;
            tdst = imns.FIO.openNode(param.path);
        } else {
            if ( !(tdst = imns.Pref.getFilePref("defsavepath")) ) {
                tdst = home.clone();
                tdst.append("Macros");
            }
            imns.Pref.setFilePref("defsavepath", tdst);
            tdst.append("Demo-Firefox");
        }
        imns.FIO.copyFiles(macros.path, tdst.path);
        
        
        pdst = portable.clone();
        pdst.append("Datasources");
        if (!pdst.exists())
            imns.FIO.makeDirectory(pdst.path);
        imns.FIO.copyFiles(datasources.path, pdst.path);

        if (!(tdst = imns.Pref.getFilePref("defdatapath"))) {
            tdst = home.clone();
            tdst.append("Datasources");
        } 
        imns.FIO.copyFiles(datasources.path, tdst.path);
        imns.Pref.setFilePref("defdatapath", tdst);

        
        pdst = portable.clone();
        pdst.append("Downloads");
        if (!pdst.exists())
            imns.FIO.makeDirectory(pdst.path);
        
        xsl_dst = pdst.clone();
        xsl_dst.append("Profiler.xsl");
        if (xsl_dst.exists())
            xsl_dst.remove(false);
        xsl_file.copyTo(pdst, null);

        
        if (!(tdst = imns.Pref.getFilePref("defdownpath"))) {
            tdst = home.clone();
            tdst.append("Downloads");
            imns.FIO.makeDirectory(tdst.path);
            imns.Pref.setFilePref("defdownpath", tdst);
        }

        
        xsl_dst = tdst.clone();
        xsl_dst.append("Profiler.xsl");
        if (xsl_dst.exists())
            xsl_dst.remove(false);
        xsl_file.copyTo(tdst, null);

        
        setTimeout(function() {
            
            try {
                iMacros.panel.updateMacroTree();
            } catch(e) {
                Cu.reportError(e);
            }
        }, 500);
    };


    
    obj.onUpdate = function() {
        this.addTab("http://www.iopus.com/imacros/home/fx/quicktour/?v="+
                    imacros_version);
        
        if (imns.Pref.getBoolPref("sidebar-opened")) {
            toggleSidebar();
            setTimeout(function() {
                toggleSidebar("imacros_ControlPanel", true);
            }, 300);
        }

        this.copySampleMacros(true);
        this.ensureBookmarksHaveIcons();

    };


        
    obj.ensureBookmarksHaveIcons = function () {
        var bmsvc = imns.Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
            .getService(imns.Ci.nsINavBookmarksService);
        var ios = imns.Cc["@mozilla.org/network/io-service;1"]
            .getService(imns.Ci.nsIIOService);
        var favsvc = imns.Cc["@mozilla.org/browser/favicon-service;1"]
            .getService(imns.Ci.nsIFaviconService);
        var icon = ios.newURI("chrome://imacros/skin/imglog.png",
                              null, null);

        var walkThroughFolder = function(folderId) {
            var i = 0;
            var re = /^(?:http:\/\/run\.imacros\.net|imacros:\/\/run)\/\?(?:code|m)=.*$/;
            while(true) { 
                try {
                    var id = bmsvc.getIdForItemAt(folderId, i++);
                    var type = bmsvc.getItemType(id);
                } catch(e) {
                    
                    return;
                }    
                if (type == 1) { 
                    var uri = bmsvc.getBookmarkURI(id);
                    if (re.test(uri.spec)) { 
                        var load_type = imns.Ci.nsIFaviconService.
                            FAVICON_LOAD_NON_PRIVATE;
                        favsvc.setAndLoadFaviconForPage(
                            uri, icon, true, load_type
                        );
                    }
                } else if (type == 2) { 
                    walkThroughFolder(id);
                }
            }
        };

        var folders = [bmsvc.placesRoot,
                       bmsvc.bookmarksMenuFolder,
                       bmsvc.tagsFolder,
                       bmsvc.unfiledBookmarksFolder,
                       bmsvc.toolbarFolder];
        for (var j = 0; j < folders.length; j++) {
            walkThroughFolder(folders[j]);
        }

    };


    
    obj.onFirstTime = function() {
        
        this.addTab("http://www.iopus.com/imacros/home/fx/welcome.htm");
        this.copySampleMacros(false);
        this.ensureBookmarksHaveIcons();
	this.addiMacrosIcon();
    };


    obj.addiMacrosIcon = function() {
	var toolbar = document.getElementById("nav-bar");
	if (toolbar.currentSet.search("imacros-toggle-button") != -1)
            return;    

        if (!document.getElementById("imacros-toggle-button")) {
            var arr = toolbar.currentSet.split(","), found = false;
            for (var i = 0; i < arr.length; i++) {
                if (arr[i] == "search-container") {
                    
                    arr.splice(i+1, 0, "imacros-toggle-button");
                    found = true;
                    break;
                }
            }
            if (!found) {
                
                
                arr.splice(arr.length-1, 0, "imacros-toggle-button");
            }
            toolbar.setAttribute("currentset", arr.join(","));
            toolbar.currentSet = arr.join(",");
            document.persist(toolbar.id, "currentset");
	}
    };
    
    obj.showPrefDialog = function(pane) {    
        try {
            var param = { pane: pane };
            window.openDialog('chrome://imacros/content/options.xul', '', 
                              "chrome,titlebar,toolbar,centerscreen,modal",
                              param);
        } catch(e) {
            Cu.reportError(e);
        }
    };


    
    obj.makeBookmarkletURL = function(name, code) {
        
        var pattern = "(function() {"+
            "try{"+
            "var e_m64 = \"{{macro}}\", n64 = \"{{name}}\";"+
            "if(!/^(?:chrome|https?|file)/.test(location)){"+
            "alert('iMacros: Open webpage to run a macro.');"+
            "return;"+
            "}"+
            "var macro = {};"+
            "macro.source = decodeURIComponent(atob(e_m64));"+
            "macro.name = decodeURIComponent(atob(n64));"+
            "var evt = document.createEvent(\"CustomEvent\");"+
            "evt.initCustomEvent(\"iMacrosRunMacro\", true, true, macro);"+
            "window.dispatchEvent(evt);"+
            "}catch(e){alert('iMacros Bookmarklet error: '+e.toString());}"+
            "}) ();";
        
        var macro_name = name || "Unnamed Macro", source = code;
        macro_name = btoa(encodeURIComponent(name));
        macro_name = imns.escapeLine(macro_name);
        pattern = pattern.replace("{{name}}", macro_name);
        source = btoa(encodeURIComponent(source));
        source = imns.escapeLine(source);
        pattern = pattern.replace("{{macro}}", source);
        var url = "javascript:" + pattern;

        return url;
    };

        
    obj.encodeBase64 = function(str) {
        var conv = imns.Cc["@mozilla.org/intl/scriptableunicodeconverter"]
        .createInstance(imns.Ci.nsIScriptableUnicodeConverter);
        conv.charset = 'UTF-8';
        var s = conv.ConvertFromUnicode(str);
        return btoa(s);
    };

        
    obj.decodeBase64 = function(str) {
        var conv = imns.Cc["@mozilla.org/intl/scriptableunicodeconverter"]
        .createInstance(imns.Ci.nsIScriptableUnicodeConverter);
        conv.charset = 'UTF-8';
        var s = atob(str);
        return conv.ConvertToUnicode(s);
    };

        
    obj.addBookmark = function(type) {
        var item = this.panel.selectedItem;
        var path = encodeURIComponent(item.path);
        var file = imns.FIO.openMacroFile(item.path);
        var data = imns.FIO.readTextFile(file);
        var jsurl = this.makeBookmarkletURL(file.leafName, data);
        var code = encodeURIComponent(this.encodeBase64(data));
        
        var params = {
            title: file.leafName,
            url: "imacros://run/?m="+path,
            bookmarklet: jsurl,
            res: null,
            type: 1,
            folderId: -1,
            tags: ""
        };

        window.openDialog('chrome://imacros/content/bookmark.xul','',
                          'modal,dialog,centerscreen,resizable=yes', params);
        if (params.res) {
            if (params.type == 1) {
                this.addStandardBookmark(params);
            } else if (params.type == 2) {
                imns.Clipboard.putString(params.url);
            } 
        }
    };

    obj.addStandardBookmark = function (options) {
        var bmsvc = imns.Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
            .getService(imns.Ci.nsINavBookmarksService);
        var ios = imns.Cc["@mozilla.org/network/io-service;1"]
            .getService(imns.Ci.nsIIOService);
        var uri = ios.newURI(options.url, null, null);
        var favsvc = imns.Cc["@mozilla.org/browser/favicon-service;1"]
            .getService(imns.Ci.nsIFaviconService);
        var icon = ios.newURI("chrome://imacros/skin/imglog.png",
                              null, null);

        if (favsvc.setAndLoadFaviconForPage) {
            favsvc.setAndLoadFaviconForPage(
                uri, icon, true,
                imns.Ci.nsIFaviconService.FAVICON_LOAD_NON_PRIVATE
            );
        } else {
            favsvc.setAndFetchFaviconForPage(uri, icon, true, null);
        }

        var bmid = bmsvc.insertBookmark(
            options.folderId, uri,
            bmsvc.DEFAULT_INDEX,
            options.title
        );
        
        
        var tagsvc = imns.Cc["@mozilla.org/browser/tagging-service;1"]
            .getService(imns.Ci.nsITaggingService);
        tagsvc.tagURI(uri, options.tags.split(","));
    };

    
    obj.openRecordPrefDlg = function () {
        window.openDialog('chrome://imacros/content/recordPrefDlg.xul','',
                          'modal,centerscreen');
        this.panel.updateControlPanel();
    };


    obj.editSelectedMacro = function() {
	var item = this.panel.selectedItem;
        if (!item || item.isContainer)
            return;
        var file = imns.FIO.openMacroFile(item.path)
        var macro = {name: file.leafName, path: file.path};
        this.edit(macro);
    };

    
    obj.edit = function(_macro, highlight_line) {
        var macro = _macro || this.currentMacro;
        if (!macro)
            return;
        var source_file = imns.FIO.isFullPath(macro.path) ?
            imns.FIO.openNode(macro.path) :
            imns.FIO.openMacroFile(macro.path);
        
        if (imns.Pref.getBoolPref("externaleditor")) {
            
            try {
                
                var file = imns.Pref.getFilePref("externaleditorpath");
                if (!file.exists()) {
                    iMacros.panel.showErrorMessage(
                        "Editor \""+file.path+"\" "+
                            "does not exist.");
                    return;
                }

                if (!imns.is_macosx() && !file.isExecutable()) {
                    iMacros.panel.showErrorMessage(
                        "Editor \""+file.path+"\" "+
                            "is not an executable file.");
                    return;
                }
                
                
                var process = imns.Cc["@mozilla.org/process/util;1"]
                    .createInstance(imns.Ci.nsIProcess);

                var args = [];
                var source_path = source_file.path;
                if (imns.is_macosx() && /\.app$/.test(file.leafName)) {
                    var bin_open = imns.FIO.openNode("/usr/bin/open");
                    process.init(bin_open);
                    args = ["-a", file.leafName.replace(/\.app$/,''),
                            source_path];
                } else {
                    process.init(file);
                    args = [source_path];
                }

                
                process.runw(false, args, args.length);

            } catch (e) {
                Cu.reportError(e);
                this.panel.showErrorMessage(
                    "Can not start editor located at: "+file.path
                );
            }
        } else {
            
            try {
                var param = {name: macro.name,
                             file: source_file,
                             line: highlight_line};
                window.openDialog('chrome://imacros/content/edit.xul','',
                                  'centerscreen,resizable,dialog=no,modal=no',
                                  param);
            } catch(e) {
                Cu.reportError(e);
            }
        }
    };


    obj.playURLMacro = function (data) {
        var runobject = JSON.parse(data);
        if (!( "type" in runobject) || !("data" in runobject))
            return;

        if (this.playing)
            this.stop();

        var filename = null, code = null;

        if ( runobject.type == "m" ) {
            filename  = imns.FIO.fixSlashes(runobject.data);
            var file = imns.FIO.openMacroFile(filename);
            if (!file.exists()) {
                iMacros.player.errorMessage = "iMacros run command: macro "+
                    filename+" not found";
                iMacros.player.errorCode = -930;
                iMacros.panel.showErrorMessage(
                    iMacros.player.errorMessage, iMacros.player.errorCode
                );
                return;
            }
            code = imns.FIO.readTextFile(file);
        } else if (runobject.type == "bookmarklet") {
            code = runobject.data;
            filename = "Embedded macro";
        } else if (runobject.type == "code") {
            code = runobject.data.replace(/\s+/g, '+');
            code = iMacros.decodeBase64(code);
            if (code.search(/iim(?:Play|Set|Display|Exit)\s*\([^\)]*\)/) != -1)
                filename = "Embedded code";
            else
                filename = "Embedded macro";

        } else {
            iMacros.panel.showErrorMessage("iMacros run command:"+
                                           " unknown parameter "+ type);
            return;
        }
        
        var param = {
            code: code,
            filename: filename,
            origin: runobject.origin,
            type: runobject.type,
            run: null
        };

        if (runobject.grant) {
            param.run = true;
        } else {
            window.openDialog('chrome://imacros/content/runwarning.xul',
                              '', 'modal, centerscreen', param);
        }

        if (param.run) {
            var file = null;
            if (/\.js$/i.test(param.filename)) {
                
                file = imns.FIO.isFullPath(param.filename) ?
                    imns.FIO.openNode(param.filename) :
                    imns.FIO.openMacroFile(param.filename);
                iMacros.playJSFile(file);
            } else if (/\.iim$/i.test(param.filename)) {
                
                file = imns.FIO.isFullPath(param.filename) ?
                    imns.FIO.openNode(param.filename) :
                    imns.FIO.openMacroFile(param.filename);
                iMacros.player.play(file, 1, runobject.name);
            } else if ("Embedded macro" == param.filename) {
                iMacros.player.play(code, 1, runobject.name);
            } else if ("Embedded code" == param.filename) {
                
                iMacros.playJSFile(code, runobject.name);
            }
            iMacros.panel.updateControlPanel();
        }
    };


    obj.share = function () {
        try {
            var item = this.panel.selectedItem;
            var file = imns.FIO.openMacroFile(item.path);
            var name = file.leafName;
            
            var data = imns.FIO.readTextFile(file);
            var jsurl = this.makeBookmarkletURL(file.leafName, data);
            
            
            
            
            
            var params = { url: jsurl, name: name};
            window.openDialog('chrome://imacros/content/share.xul','',
                              'modal,centerscreen', params);
        } catch(e) {
            Cu.reportError(e);
        }
    };

    
    obj.play = function() {  
        var item = this.panel.selectedItem, macro;
        if (!item || item.isContainer)
            macro = "#Current.iim";
        else
            macro = item.path;
        var file = imns.FIO.openMacroFile(macro);
        if (/\.js$/.test(macro)) {
            this.playJSFile(file);
        } else {
            this.player.play(file);
        }
        this.panel.updateControlPanel();
    };


    obj.playLoop = function() {   
        var item = this.panel.selectedItem;
        if (!item || item.isContainer)
            return;
        
        if (item.path.match(/\.js$/i)) {
            this.panel.showErrorMessage(
                "The LOOP button can only be used with macro (\".iim\") files."+
                    "\nIn a Javascript (\".js\") file you can use"+
                    " Javascript itself for loops."
            );
            return;
        }
        var times = this.panel.maxLoopValue;
        var file = imns.FIO.openMacroFile(item.path);
        this.player.play(file, times);
        this.panel.updateControlPanel();
    };


    obj.record = function() {
        this.recorder.start();
    };

        
    obj.saveMacroAs = function() { 
        var item = this.panel.selectedItem, macro;
        if (!item || item.isContainer)
            macro = "#Current.iim";
        else
            macro = item.path;
        var file = imns.FIO.openMacroFile(macro);
        
        var param = {filename: file.leafName,
                     folder: file.parent.path,
                     confirm: false};
        window.openDialog('chrome://imacros/content/save.xul', '',
                          'modal,centerscreen', param);
        if (!param.confirm)
            return;

        var filename = param.filename;
        if (!/(?:\.iim|\.js)$/i.test(filename))
            filename = filename + ".iim";
        
        
        var re = new RegExp('\\s*[:*?|<>\\"/]+\\s*', "g");
        filename = filename.replace(re, "_");
        
        var new_dir = imns.FIO.openNode(param.folder);
        var check_file = new_dir.clone();
        check_file.append(filename);
        var file_exists_msg = "File "+check_file.path+
            " already exists. Would you like to overwrite it?";
        if (check_file.exists() && !imns.Dialogs.confirm(file_exists_msg)) 
            return;
        file.copyTo(new_dir, filename);

        var macro_dir = imns.Pref.getFilePref("defsavepath");
        if (param.bookmark) {
            var data = imns.FIO.readTextFile(check_file);
            var mlink = "unavailable";
            if (macro_dir.contains(check_file)) {
                var endname = check_file.path.slice(macro_dir.path.length+1);
                mlink = "imacros://run/?m=" + encodeURIComponent(endname);
            }
            var code = encodeURIComponent(this.encodeBase64(data));
            var jsurl = this.makeBookmarkletURL(check_file.leafName, data);
            var params = {
                title: check_file.leafName,
                url: mlink,
                url2: "imacros://run/?code="+code,
                bookmarklet: jsurl,
                res: null,
                type:1,
                folderId: -1
            };
            window.openDialog('chrome://imacros/content/bookmark.xul','',
                              'modal,centerscreen', params);
            if (params.res) {
                if (params.type == 1) {
                    this.addStandardBookmark(params);
                } else if (params.type == 2) {
                    imns.Clipboard.putString(params.url);
                }
            }
        }
        
        if (!macro_dir.contains(check_file)) {
            
            
            return;
        }
        
        var mtree = this.panel.sidebar.getMTreeObject();
        var name = check_file.path.slice(macro_dir.path.length+1);
        item = mtree.findItem(name);
        if (!item) {
            var path = name.split(imns.FIO.psep);
            var con = mtree.children, x = 0;
            while(x < path.length-1) {
		con = mtree.getContainer(path[x], con); x++;
	    }
	    mtree.insertLeaf(path[x], con);
            item = mtree.findItem(name);
        }
        var idx = mtree.getIndexOfItem(item);
        mtree.tree.view.selection.select(idx);

        
        
        
        
        
        
        

        
        
        
        
        
        
        
        

        
        

        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
    };

        
    obj.pause = function() {         
        if (!this.paused) {
            if (this.recording) {
                this.recorder.pause(function() {
                    iMacros.panel.updateControlPanel();
                });
            } else if (this.playing) {
                this.player.pause(function() {
                    iMacros.panel.updateControlPanel();
                });
            } else if (this.jsplaying) {
                this.jsplayer2.pause(function() {
                    iMacros.panel.updateControlPanel();
                });
            }
        } else {
            switch(this.paused) {
            case "recording":
                this.recorder.unPause(function() {
                    iMacros.panel.updateControlPanel();
                });
                break;
            case "playing":
                this.player.unPause(function() {
                    iMacros.panel.updateControlPanel();
                });
                break;
            case "jsplaying":
                this.jsplayer2.unPause(function() {
                    iMacros.panel.updateControlPanel();
                });
                break;
            }

        }
    };

    obj.stop = function() {    
        try {
            if (this.paused)
                this.pause();
            
            if (this.playing) {
                this.player.errorMessage = "Macro stopped manually";
                this.player.errorCode = -101;
                this.player.stop();
            } else if (this.recording) {
                this.recorder.stop();
            }

            if (this.jsplaying) {
                this.jsplayer2.stop();
            }

            this.panel.showMacroTree();
        } catch(e) {
            Cu.reportError(e);
        }
    };


        
    obj.savePageAs = function () {
        if (!this.recording) { 
            var cmd = document.getElementById("Browser:SavePage");
            cmd.doCommand("Browser:SavePage");
        } else {
            this.recorder.savePageAs();
        }
    };


    obj.takeScreenshot = function () {
        if (this.recording) {
            this.recorder.takeScreenshot();
        } else {    
            
            var __doc_name = function(win) {
                
                var name = win.document.title;
                
                if (!name.length) {
                    var name = win.location.pathname;
                    if (/\/([^\/]*)$/.test(name))
                        name = RegExp.$1;
                }
                if (!name.length)   
                    return "unknown";
                
                if (/^(.*)\.(?:\w+)$/.test(name))
                    name = RegExp.$1;
                
                
                var re = new RegExp('\\s*[:*?|<>\\"/]+\\s*', "g");
                name = name.replace(re, "_");
                
                return name;
            };
            var filename = __doc_name(content)+".png";
            var file = imns.Dialogs.browseForFileSave(
                "", filename,
                imns.Pref.getFilePref("defdownpath")
            );
            this.player.savePageAsImage(
                content, file.leafName, file.parent, "png"
            );
        }
    };


    obj.clearCookies = function () {
        var show = imns.Pref.getBoolPref("clearparam");
        if (show) {
            var prompts = imns.Cc["@mozilla.org/embedcomp/prompt-service;1"]
            .getService(imns.Ci.nsIPromptService);
            var check = {value: true};
            var result = prompts.confirmCheck(
                window,
                imns.__getstr(window, "imacros-clear-title"),
                imns.__getstr(window, "imacros-clear-enter1"),
                imns.__getstr(window, "imacros-checkbox-display-this"),
                check
            );
            if (!result)
                return;
            imns.Pref.setBoolPref("clearparam", check.value);
        }

        var cachesvc = imns.Cc["@mozilla.org/network/cache-service;1"].
        getService(imns.Ci.nsICacheService);
        cachesvc.evictEntries(imns.Ci.nsICache.STORE_ANYWHERE);
        var cookiemgr = imns.Cc["@mozilla.org/cookiemanager;1"].
        getService(imns.Ci.nsICookieManager);
        cookiemgr.removeAll();

        if (this.recording) {
            this.recorder.clearCookies();
        }
    };


    obj.addWaitCommand = function() {
        this.recorder.addWaitCommand();
    };


    obj.playJSFile = function(file) {
        try {
            var name;
            let data = null;
            if (typeof(file) == "string") {
                data = file;
                name = "Embedded code";
                this.currentMacro = {name: name, path: null};
            } else {
                data = imns.FIO.readTextFile(file);
                name = file.leafName;
                this.currentMacro = {name: name, path: file.path};
            }
            this.jssrc = data;
            this.jsplayer2.play(this.jssrc, name);
        } catch(e) {
            Cu.reportError(e);
        }

    };


    obj.runLocalTest = function() {
        var skip_warning = imns.Pref.getBoolPref("af-no-local-test-warning");
        if (!skip_warning) {
            var msg = "The AlertFox local test simulates server environment as close as possible."
            var check_msg = "Do not show this warning again";
            var check = {value: false};
            var result = imns.Dialogs.confirmCheck(
                "iMacros", msg, check_msg, check
            );
            if (!result)
                return;
            if (check.value)
                imns.Pref.setBoolPref("af-no-local-test-warning", true);
        }

        var path = this.panel.selectedItem.path;
        var file = imns.FIO.openMacroFile(path);
        if (/\.js$/.test(file.leafName)) {
            this.panel.showErrorMessage(
                "Local Test can only be used with macro (\".iim\") files."
            );
            return;
        } else {
            var AFTest = { iDrone: this.panel.sidebar.document.
                           getElementById("im-test-for-idrone").checked };
            this.player.play(file, 1, file.leafName, AFTest);
        }
        this.panel.updateControlPanel();
    };


    obj.__uploadMacro = function(usr, pwd, skip) {
        var path = this.panel.selectedItem.path;
        var file = imns.FIO.openMacroFile(path);
        var macro_source = imns.FIO.readTextFile(file);
        var args = {accountName: usr,
                    accountPassword: pwd,
                    macro: macro_source,
                    browserType: "FX",
                    skipOnlineTest: skip};

        var btn = this.panel.sidebar.document.
            getElementById(skip ? "im-af-upload-button" :
                           "im-online-test-button");
        
        
        
        
        var wsdl_url = "https://my.alertfox.com/imu/AlertFoxManagementAPI.asmx";
        SOAPClient.invoke(wsdl_url, "UploadMacro", args, function(rv, err) {
            btn.disabled = null;
            btn.image = "";
            if (!rv) {
                alert("Unexcpected error occured while uploading macro: "+
                      err.message);
                return;
            }
            if (rv.errorMessage) {
                alert(rv.errorMessage);
                return;
            } 
            if (!/^https:\/\/my\.alertfox\.com/i.test(rv.UploadMacroResult)) {
                alert("Unexpected server response. URL value "+
                      rv.UploadMacroResult+
                      " does not refer to AlertFox service.");
                return;
            }
            
            iMacros.addTab(rv.UploadMacroResult); 
            
            
        });
    };
    
    obj.uploadMacro = function(skipOnlineTest) {
        const AF_auth_host = "https://my.alertfox.com";
        var lm = imns.Cc["@mozilla.org/login-manager;1"].
            getService(imns.Ci.nsILoginManager);
        var logins = lm.findLogins({}, AF_auth_host, "", null);
        if (logins.length == 0) {
            
            var msg = "No Alertfox credentials found. Please enter your credentials in the Settings dialog";
            if (imns.Dialogs.confirm(msg)) {
                this.showPrefDialog("cloud-service-pane");
                setTimeout(function() { iMacros.uploadMacro(); }, 0);
            } 
            return;
        }
        
        var uname = logins[0].username;
        var pwd = logins[0].password;
        if (logins.length > 1) {
            for (var i = 1; i < logins.length; i++) {
                var stored_uname = imns.Pref.getCharPref("af-username");
                if (stored_uname == logins[i].username) {
                    uname = logins[i].username;
                    pwd = logins[i].password;
                }
            }
        }

        
        
        
        
        var args = {accountName: uname, accountPassword: pwd};
        var wsdl_url = "https://my.alertfox.com/imu/AlertFoxManagementAPI.asmx";
        var btn = this.panel.sidebar.document.
            getElementById(skipOnlineTest ? "im-af-upload-button" :
                           "im-online-test-button");
        btn.disabled = true;
        btn.image = "chrome://imacros/skin/waiting_16x16.gif";
        SOAPClient.invoke(wsdl_url, "CheckLogin", args, function(rv, err) {
            if (!rv) {
                btn.image = ""; btn.disabled = null;
                alert("Error occured while checking credentials: "+
                      err.message);
                return;
            }
            if (rv.CheckLoginResult) {
                iMacros.__uploadMacro(uname, pwd, skipOnlineTest);
            } else {
                btn.image = ""; btn.disabled = null;
                var msg = "Either user name or password is incorrect. Please enter your credentials in the Settings dialog";
                if (imns.Dialogs.confirm(msg)) {
                    
                    iMacros.showPrefDialog("cloud-service-pane");
                    setTimeout(function() { iMacros.uploadMacro(); }, 0);
                }
            }
        });
    };
    
        
    obj.observe = function (subject, topic, data) {
        if (topic == "quit-application-granted") {
            ;
        }
        
        else if(topic == "imacros-runmacro") {
            if (subject != window)
                return;
            if (!this.playURLMacroDelay) {
                this.playURLMacroDelay = setTimeout(function () { 
                    delete iMacros.playURLMacroDelay;
                    iMacros.playURLMacro(data);
                }, 50); 
            }
        }
        
        else if (topic == "imacros-delay-show") {
            if (subject != window)
                return;
            if (!(this.playing || this.recording)) {
                iMacros.panel.statLine2 = "";
                return;
            }
            this.panel.statLine2 = data;
        }
    };
        
    
    obj.topics = {
        "quit-application-granted": false,
        "imacros-runmacro": false,
        "imacros-delay-show": false
    };

    obj.onUninstalling = function(addon, need_restart) {
	if (addon.id != iMacros.GUID)
	    return;

	try {
	    if (imns.is_windows()) {
		var wrk = imns.
		    Cc["@mozilla.org/windows-registry-key;1"].
		    createInstance(imns.Ci.nsIWindowsRegKey);
		wrk.open(wrk.ROOT_KEY_CURRENT_USER,
			 "Software\\iMacros",
			 wrk.ACCESS_WRITE);
		wrk.removeValue("fx");
		wrk.close();
	    }
	} catch (e) {
	    Cu.reportError(e);
	}

	[ "defsavepath", "defdatapath", "deflogpath",
          "defdownpath", "externaleditor",
          "externaleditorpath", "version",
          "sidebar-opened", "close-sidebar",
          "toolbar-checked", "scroll", "clickmode",
          "highlight", "showjs", "delay", "maxwait",
          "noloopwarning", "clearparam", "record-mode",
          "id-priority"].forEach(function(pref) {
	      imns.Pref.clearPref(pref);
	  });
    };
        
    obj.registerObservers = function() {
        for (var x in this.topics)
            imns.osvc.addObserver(this, x, this.topics[x]);

	let {AddonManager} = Cu.import(
            "resource://gre/modules/AddonManager.jsm"
        );

	AddonManager.addAddonListener(this);
    };

    obj.unregisterObservers = function() {
        for (var x in this.topics)
            imns.osvc.removeObserver(this, x, this.topics[x]);

	let {AddonManager} = Cu.import(
            "resource://gre/modules/AddonManager.jsm"
        );

	AddonManager.removeAddonListener(this);
    };


    
    obj.generateWinId = function() {
        var rnd = Math.random().toString(); 
        
        var conv = imns.Cc["@mozilla.org/intl/scriptableunicodeconverter"].
	createInstance(imns.Ci.nsIScriptableUnicodeConverter);
        conv.charset = "UTF-8";
        var res = {}, data = conv.convertToByteArray(rnd, res);
        var ch = imns.Cc["@mozilla.org/security/hash;1"]
	.createInstance(imns.Ci.nsICryptoHash);
        ch.init(ch.SHA1);
        ch.update(data, data.length);
        var hash = ch.finish(false);
        
        this.wid = window.btoa(hash);
    };
        

    obj.onLoad = function() {
        this.generateWinId();
        this.registerObservers();

        
        this.jsplaying = false;
        this.jssrc = "";
        this.in_iimPlay = false;

        
        var k = document.getElementById("imacros_key_OpenPanel");
        if (imns.Pref.getBoolPref("use-toggle-hotkey")) {
            k.setAttribute("keycode",
                           imns.Pref.getCharPref("openiMacrosShortcut"));
        }

        
        
        
        

        
        this.reviseAddonUpdated();

        
        imns.Pref.setBoolPref("close-sidebar", false);
        
    };


    obj.onUnload = function() {
        this.unregisterObservers();
    };        

    return obj;

}) ();



window.addEventListener("load", function() {
    iMacros.onLoad();
}, false);


window.addEventListener("unload", function() {
    iMacros.onUnload();
}, false);



