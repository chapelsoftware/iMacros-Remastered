



Components.utils.import("resource://imacros/utils.js");

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

function onAllow() {
    if("arguments" in window && window.arguments.length > 0) {
        window.arguments[0].run = true;
        var chkbox = document.getElementById("set-default-action");
        if (chkbox.checked) {
            var watcher = getRequestWatcher();
            watcher.addSite(window.arguments[0].origin);
        }
    }
    window.close();
}


function onBlock() {
    if("arguments" in window && window.arguments.length > 0) {
        window.arguments[0].run = false;
        var chkbox = document.getElementById("set-default-action");
        if (chkbox.checked) {
            var watcher = getRequestWatcher();
            watcher.blockSite(window.arguments[0].origin);
        }
    }
    window.close();
}



function onDisclosure() {
    if("arguments" in window && window.arguments.length > 0) {
        window.openDialog("chrome://imacros/content/viewmacro.xul", "",
                          "", window.arguments[0]);
    }
}

window.onload = function () {
    var btn = document.documentElement.getButton("disclosure");
    btn.focus();
    if("arguments" in window && window.arguments.length > 0) {
        var desc = document.getElementById("warning-description");
        var warning = document.getElementById("warning-question");
        var s = desc.firstChild.nodeValue, rep_str = "macro";
        if (/\.js$/.test(window.arguments[0].filename)) 
            rep_str = "script";
        s = s.replace(/{{macro}}/, rep_str);
        s = s.replace(/{{origin}}/, window.arguments[0].origin);
        desc.firstChild.nodeValue = s;
        s = warning.value.replace(/{{macro}}/, rep_str);
        warning.value = s;
        
        var chkbox = document.getElementById("set-default-action");
        s = chkbox.label;
        s = s.replace(/{{origin}}/, window.arguments[0].origin);
        chkbox.label = s;
    }
};

