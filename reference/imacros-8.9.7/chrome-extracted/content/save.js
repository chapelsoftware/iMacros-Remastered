



Components.utils.import("resource://imacros/utils.js");




window.onload = function () {
    try {
        var default_path = imns.Pref.getFilePref("defsavepath").path;
        var folder = document.getElementById("imacros-folder-name");
        var filename = document.getElementById('imacros-file-name');
        if("arguments" in window && window.arguments.length > 0) {
            filename.value = window.arguments[0].filename;
            folder.value = window.arguments[0].folder ? 
                window.arguments[0].folder : default_path;
        } else {
            filename.value = "untitled";
            folder.value = default_path;
        }
    } catch(e) {
	Components.utils.reportError(e);
    }
};


function chooseFolder() {
    setTimeout(function() {
        var folder = document.getElementById("imacros-folder-name");
        var defdir = null;
        try {
            defdir = imns.FIO.openNode(folder.value);
        } catch (e) {
            
            defdir = imns.Pref.getFilePref("defsavepath");
        }
        var dir = imns.Dialogs.browseForFolder("", defdir);
        if (dir) {
            folder.value = dir.path;
        }
    }, 0);
}


function onAccept () {
    if("arguments" in window && window.arguments.length > 0) {
        var folder = document.getElementById("imacros-folder-name");
        try {
            var dummy = imns.FIO.openNode(folder.value);
            if (!dummy.exists()) {
                window.alert("Directory "+folder.value+" does not exists!");
                return;
            }
        } catch(e) {
            window.alert("Wrong path: "+folder.value);
            return;
        }
        var filename = document.getElementById('imacros-file-name');
        if (!filename.value) {
            window.alert("File name can not be empty!");
            return;
        }
        var bookmark = document.getElementById('bookmark');

        window.arguments[0].folder = folder.value;
        window.arguments[0].filename = filename.value;
        window.arguments[0].confirm = true;
        window.arguments[0].bookmark = bookmark.checked;
    }
    window.close();
}


function onCancel () {
    if("arguments" in window && window.arguments.length > 0) {
        window.arguments[0].confirm = false;
    }
    window.close();
}
