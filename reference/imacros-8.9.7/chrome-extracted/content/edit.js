



Components.utils.import("resource://imacros/utils.js");



var Editor = {
    get editbox() {
        return document.getElementById("editbox");
    },

    get doc() {
        return this.editbox.contentDocument;
    },

    init: function (file, line) {
        var bypass = this.doc.getElementById("bypass");
        if (!bypass || !bypass.hasAttribute("inited")) {
            setTimeout(function () { Editor.init(file, line); }, 100);
            return;
        }

        bypass.setAttribute("lang", "en");
        bypass.setAttribute("syntax", file && /\.js$/.test(file.leafName) ?
                            "js" : "imacro");
        var evt = this.doc.createEvent("Events");
        evt.initEvent("iMacrosEditorInitEvent", true, false);
        bypass.dispatchEvent(evt);

        if (file) {
            this.completeLoad(file, line);
        } 

        this.attachListeners();
    },

    attachListeners: function () {
        document.addEventListener("iMacrosEditorSaveEvent",
                                  function(e) { Editor.listen(e); },
                                  false);
        document.addEventListener("iMacrosEditorLoadEvent",
                                  function(e) { Editor.listen(e); },
                                  false);
    },

    saveFileAs: function () {
        var r = this.getEditAreaData();
        var dir = r.dirpath ? imns.FIO.openNode(r.dirpath) :
             imns.Pref.getFilePref("defsavepath");
        var ext = r.syntax == "js" ? "js" : "iim";
        var file = imns.Dialogs.browseForFileSave("iMacros save file",
                                     r.filename || ("untitled."+ext), dir);
        if (file) {
            if (!this.checkPermissions(file))
                return false;
                                
            imns.FIO.writeTextFile(file, r.content);
            return true;
        }
        return false;
    },


    getEditAreaData: function () {
        
        var bypass = this.doc.getElementById("bypass");
        var evt = this.doc.createEvent("Events");
        evt.initEvent("iMacrosEditorGetContentEvent", true, false);
        bypass.dispatchEvent(evt);
        var content = bypass.getAttribute("content");
        var filename = bypass.getAttribute("filename");
        var dirpath = bypass.getAttribute("dirpath");
        var syntax = bypass.getAttribute("syntax");

        return {content: content,
                filename: filename,
                dirpath: dirpath,
                syntax: syntax};
    },

    saveFile: function () {
        var r = this.getEditAreaData();
        if (r.filename && r.dirpath) {
            var file = imns.FIO.openNode(r.dirpath);
            file.append(r.filename);
            if (!this.checkPermissions(file))
                return false;
            imns.FIO.writeTextFile(file, r.content);
            return true;
        } else {
            return this.saveFileAs();
        }
    },


    checkFileChanged: function () {
        var r = this.getEditAreaData();
        if (r.filename && r.dirpath) {
            var file = imns.FIO.openNode(r.dirpath);
            file.append(r.filename);
            r.content = r.content.replace(/\r/g, "");
            var filecontent = imns.FIO.readTextFile(file).replace(/\r/g, "");
            return filecontent != r.content;
        } else {
            return true;
        }
    },


    checkPermissions: function(file) {
        if (file.exists()) {
            if (!file.isWritable()) {
                alert("Can not write to file "+file.path);
                return false;
            }
        } else {
            if (!file.parent.exists()) {
                alert("Directory "+file.parent.path+" does not exists");
                return false;
            } else {
                if (!file.parent.isWritable()) {
                    alert("Can not write to directory "+
                          file.parent.path);
                    return false;
                }
            }
        }
        return true;
    },


    loadFile: function () {
        var file = imns.Dialogs.browseForFileOpen("iMacros",
                         imns.Pref.getFilePref("defsavepath"));
        if (file)
            this.completeLoad(file);
    },

        
    completeLoad: function (file, line) {
        
        var bypass = this.doc.getElementById("bypass");
        bypass.setAttribute("filename", file.leafName);
        bypass.setAttribute("dirpath", file.parent.path);
        bypass.setAttribute("syntax", /\.js$/.test(file.leafName) ?
                            "js" : "imacro");
        var content = imns.FIO.readTextFile(file);
        bypass.setAttribute("content", content);
        if (line) {             
            
            
            var count = 1;
            for(var i = 0; i < content.length; i++) {
                if (count == line) {
                    bypass.setAttribute("start", i);
                    bypass.setAttribute("end", i);
                    break;
                }
                if (content[i] == "\r")
                    continue;
                if (content[i] == "\n")
                    count++;
            }
        }
        var evt = this.doc.createEvent("Events");
        evt.initEvent("iMacrosEditorLoadCompleteEvent", true, false);
        bypass.dispatchEvent(evt);
        
        document.title = file.leafName+" - iMacros Editor";
    },


    getSelection: function () {
        
        var bypass = this.doc.getElementById("bypass");
        var evt = this.doc.createEvent("Events");
        evt.initEvent("iMacrosEditorGetSelection", true, false);
        bypass.dispatchEvent(evt);
        var selection = bypass.getAttribute("selection");
        return selection;
    },


    setSelection: function (text) {
        
        var bypass = this.doc.getElementById("bypass");
        var evt = this.doc.createEvent("Events");
        evt.initEvent("iMacrosEditorSetSelection", true, false);
        bypass.setAttribute("selection", text);
        bypass.dispatchEvent(evt);
    },
    
    

    onContextShowing: function() {
        var cut = document.getElementById("context-cut");
        var copy = document.getElementById("context-copy");
        var paste = document.getElementById("context-paste");
        var sel = this.getSelection();
        var clip_content = imns.Clipboard.getString();
        if (sel && sel.length) {
            cut.disabled = false;
            copy.disabled = false;
            paste.disabled = true;
        } else {
            cut.disabled = true;
            copy.disabled = true;
            if (clip_content.length)
                paste.disabled = false;
        }
    },


    cut: function() {
        var sel = this.getSelection();
        if (sel && sel.length) {
            imns.Clipboard.putString(sel);
            this.setSelection("");
        }
    },


    copy: function() {
        var sel = this.getSelection();
        if (sel && sel.length) {
            imns.Clipboard.putString(sel);
        }
    },


    paste: function() {
        var clip_content = imns.Clipboard.getString();
        if (clip_content && clip_content.length) {
            this.setSelection(clip_content);
        }
    },


    listen: function(evt) {
        if (evt.type == "iMacrosEditorSaveEvent") {
            var content = evt.target.getAttribute("content");
            this.saveFileAs(evt);
        } else if (evt.type == "iMacrosEditorLoadEvent") {
            this.loadFile(evt);
        }
    }
};



function saveAndQuit() {
    if (Editor.saveFile())
        window.close();
}

function cancel() {
    if (Editor.checkFileChanged()) {
        var msg = "File content was changed. Would you like to save changes?";
        if (imns.Dialogs.confirm(msg))
            return Editor.saveFile();
    }
    return true;
}

window.onload = function () {
    try {
        var spacer = document.getElementById("spacer");
        var btn = document.getElementById("help-button");
        spacer.width = btn.boxObject.width;
        if("arguments" in window && window.arguments.length > 0) {
            Editor.init(window.arguments[0].file, window.arguments[0].line);
        }
    } catch(e) {
        Components.utils.reportError(e);
    }
};



function showHTMLTooltip(tip) {
    var ret = false;
    if (/there\.is\.only\.xul$/.test(tip.namespaceURI)) {
        return ret;
    }
    const XLinkNS = "http://www.w3.org/1999/xlink";
    var titleText = null;
    var XLinkTitleText = null;
    while (!titleText && !XLinkTitleText && tip) {
        if (tip.nodeType == Node.ELEMENT_NODE) {
            titleText = tip.getAttribute("title");
            XLinkTitleText = tip.getAttributeNS(XLinkNS, "title");
        }
        tip = tip.parentNode;
    }
    var texts = [titleText, XLinkTitleText];
    var tipNode = document.getElementById("html-tooltip");
    for (var i = 0; i < texts.length; ++i) {
        var t = texts[i];
        if (t && t.search(/\S/) >= 0) {
            tipNode.setAttribute("label", t.replace(/\s+/g, " "));
            ret = true;
        }
    }
    return ret;
}
