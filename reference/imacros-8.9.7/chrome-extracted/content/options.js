



Components.utils.import("resource://imacros/utils.js");
Components.utils.import("resource://imacros/SOAPClient.js");









function initGeneralPane() {
    
    var delayval = imns.Pref.getIntPref("delay");
    var elem = null;
    if  (delayval <= 100 || isNaN(delayval) ) {
        elem = document.getElementById('delayfast');
    } else if (delayval <= 1000) {
        elem = document.getElementById('delaymedium');
    } else {
        elem = document.getElementById('delayslow');
    }
    var radiogrp = document.getElementById("replay-speed");
    radiogrp.selectedItem = elem;
    
    
    var effects = {scroll: null, highlight: null, showjs: null};
    for (var x in effects) {
        var chkbox = document.getElementById(x);
        effects[x] = imns.Pref.getBoolPref(x);
        chkbox.checked = effects[x];
    }
    
    var chkbox = document.getElementById("use-toggle-hotkey");
    chkbox.checked = imns.Pref.getBoolPref("use-toggle-hotkey");

    
    var maxwait = document.getElementById("maxwait");
    maxwait.value = imns.Pref.getIntPref("maxwait");

    var profiler = document.getElementById("profiler-enabled");
    profiler.checked = imns.Pref.getBoolPref("profiler-enabled");
}

function setShortcuts() {
    var chkbox = document.getElementById("use-toggle-hotkey");
    imns.Pref.setBoolPref("use-toggle-hotkey", chkbox.checked);

    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
}

function setGeneralPane() {
    
    if  ( document.getElementById('delayfast').selected) {
        imns.Pref.setIntPref("delay", 0);
    } else if (document.getElementById('delaymedium').selected) {
        imns.Pref.setIntPref("delay", 1000);
    } else {
        imns.Pref.setIntPref("delay", 2000);
    }


    
    var effects = {scroll: null, highlight: null, showjs: null};
    for (var x in effects) {
        var chkbox = document.getElementById(x);
        effects[x] = chkbox.checked;
        imns.Pref.setBoolPref(x, effects[x]);
    }

    
    setShortcuts();
    
    
    var maxwait = document.getElementById("maxwait");
    if (/^\d+$/.test(maxwait.value))
        imns.Pref.setIntPref("maxwait", imns.s2i(maxwait.value));
    
    
    var profiler = document.getElementById("profiler-enabled");
    imns.Pref.setBoolPref("profiler-enabled", profiler.checked);
}





function initSecurityPane() {
    
    var pm = imns.getPasswordManager();
    var sec = document.getElementById("sec"+pm.encryptionType.toString());
    var pwdusage = document.getElementById("masterpwd-usage");
    pwdusage.selectedItem = sec;
    updatePasswordControls(pm.encryptionType);
    var sec2master = document.getElementById("sec2master");
    try {
        sec2master.value = pm.getMasterPwd();
    } catch(x) {
        
    }
}




function updatePasswordControls(val) {
    try {
        var pm = imns.getPasswordManager();
        if (!/^[123]$/.test(val.toString()))
            val = 1;
        pm.encryptionType = val;
        var sec2master = document.getElementById("sec2master");
	var tmp_master = document.getElementById('tmp-master');
        if (val == 1) {
            sec2master.disabled = true;
            tmp_master.disabled = true;
        } else if (val == 2) {
            sec2master.disabled = null;
            tmp_master.disabled = true;
            sec2master.focus();
        } else if (val == 3) {
            sec2master.disabled = true;
            tmp_master.disabled = null;
            tmp_master.focus();
        }
    } catch(e) {
        Components.utils.reportError(e);
    }
}



function enterTempPassword() {
    var pm = imns.getPasswordManager(),
        param = {password: pm.getSessionPwd()};
    window.openDialog('chrome://imacros/content/keydlg1.xul', '',
                      'modal,centerscreen', param);
    pm.setSessionPwd(param.password);
}

function setSecurityPane() {
    
    var pm = imns.getPasswordManager();
    if (pm.encryptionType == pm.TYPE_STORED) {
        var sec2master = document.getElementById("sec2master");
        if (!sec2master.value) {
            alert("Master password can not be empty!");
            sec2master.focus();
            return;
        }
        pm.setMasterPwd(sec2master.value);
    }

}




function initPathPane() {
    
    var epath = document.getElementById('editpath');
    var ebtn = document.getElementById('editpathbtn');
    var chkeditor = document.getElementById('chkeditor');
    if (imns.Pref.getBoolPref("externaleditor")) {
        chkeditor.checked = true;
        epath.disabled = null;
        ebtn.disabled = null;
    } else {
        chkeditor.checked = false;
        epath.disabled = true;
        ebtn.disabled = true;
    }
    
    var x = imns.Pref.getFilePref("externaleditorpath");
    epath.value  = x ? x.path : "";

    
    setPathValues();
    var store_check = document.getElementById("store-in-profile");
    if (imns.Pref.getBoolPref("store-in-profile")) {
        store_check.checked = true;
        disablePathsBoxes(true);
    } else {
        store_check.checked = false;
        disablePathsBoxes(null);
    }
}

function browseForFile(prefname, elemname) {
    try {
        var fp = imns.Cc["@mozilla.org/filepicker;1"]
            .createInstance(imns.Ci.nsIFilePicker);
        fp.init(window, " ", imns.Ci.nsIFilePicker.modeOpen);
        fp.appendFilters(imns.Ci.nsIFilePicker.filterApps);
        fp.appendFilters(imns.Ci.nsIFilePicker.filterAll);
        fp.filterIndex = 0;
        var rv = fp.show();
        if (rv == imns.Ci.nsIFilePicker.returnOK) {
            var file = fp.file.path.toString();
            imns.Pref.setFilePref(prefname, imns.FIO.openNode(file));
            document.getElementById(elemname).value = file;
        }
    } catch(e) {
        Components.utils.reportError(e);
    }
}



function browseForFolder(prefname, elemname) {
    try {
        var fp = imns.Cc["@mozilla.org/filepicker;1"]
            .createInstance(imns.Ci.nsIFilePicker);
        fp.init(window, " ", imns.Ci.nsIFilePicker.modeGetFolder);
        var rv = fp.show();
        if (rv == imns.Ci.nsIFilePicker.returnOK) {
            var file = fp.file.path.toString();
            imns.Pref.setFilePref(prefname, imns.FIO.openNode(file));
            document.getElementById(elemname).value = file;
        }
    } catch(e) {
        Components.utils.reportError(e);
    }
}


function updateEditorField() {
    try {
        var path = document.getElementById('editpath');
        var btn = document.getElementById('editpathbtn');
        var chkbox = document.getElementById('chkeditor');
        if (!chkbox.checked) {   
            path.disabled = true;
            btn.disabled = true;
        } else {
            path.disabled = null;
            btn.disabled = null;
            path.focus();
        }
    } catch(e) {
        Components.utils.reportError(e);
    }
}

function setPathValues() {
    var paths = ["savepath", 
                 "datapath", "downpath"];
    for (var i = 0; i < paths.length; i++) {
        var box = document.getElementById(paths[i]);
        var value = imns.Pref.getFilePref("def"+paths[i]);
        if (value && value.path) 
            box.value = value.path;
    }
}

function disablePathsBoxes(val) {
    var paths = ["savepath", 
                 "datapath", "downpath"];
    for (var i = 0; i < paths.length; i++) {
        var p = document.getElementById(paths[i]);
        var b = document.getElementById("browse-"+paths[i]);
        p.disabled = val ? val : null;
        b.disabled = val ? val : null;
    }
}


function storeInProfile() {
    var store_check = document.getElementById('store-in-profile');
    imns.Pref.setBoolPref("store-in-profile", store_check.checked);
    disablePathsBoxes(store_check.checked);
    setPathValues();
    if (!store_check.checked) {
        var paths = ["savepath", 
                     "datapath", "downpath"];
        for (var i = 0; i < paths.length; i++) {
            var p = document.getElementById(paths[i]);
            if (!testPath(p.value))
                return;
        }
    }
        
    
    var wm = imns.Cc["@mozilla.org/appshell/window-mediator;1"]
        .getService(imns.Ci.nsIWindowMediator);
    var enumerator = wm.getEnumerator("navigator:browser");
    while(enumerator.hasMoreElements()) {
        var win = enumerator.getNext();
        if (win.sidebar && win.sidebar.initMTree)
            win.sidebar.initMTree();
    }
}

function testPath(path) {
    try {
        var x = imns.FIO.openNode(path);
    } catch (e) {
        window.alert("Can not recognize path syntax for '"+path+"'!");
        return false;
    }
    
    if (!x.exists()) {
        window.alert("Path '"+path+"' does not exist!");
        return false;
    }
    return true;
}


function setPathPane() {
    
    
    
    var chkeditor = document.getElementById('chkeditor');
    if (chkeditor.checked) {
        imns.Pref.setBoolPref("externaleditor", true);
        var epath = document.getElementById('editpath');
        if (!testPath(epath.value))
            return false;
        imns.Pref.setFilePref("externaleditorpath",
                              imns.FIO.openNode(epath.value));
    } else {
        imns.Pref.setBoolPref("externaleditor", false);
    }

    
    if (!imns.Pref.getBoolPref("store-in-profile")) {
        var savepath = document.getElementById("savepath");
        if (!testPath(savepath.value))
            return false;
        imns.Pref.setFilePref("defsavepath",
                              imns.FIO.openNode(savepath.value));
        
        
        
        
        
        

        var datapath = document.getElementById("datapath");
        if (!testPath(datapath.value))
            return false;
        imns.Pref.setFilePref("defdatapath",
                              imns.FIO.openNode(datapath.value));

        var downpath = document.getElementById("downpath");
        if (!testPath(downpath.value))
            return false;
        imns.Pref.setFilePref("defdownpath",
                              imns.FIO.openNode(downpath.value));
        
        var wm = imns.Cc["@mozilla.org/appshell/window-mediator;1"]
            .getService(imns.Ci.nsIWindowMediator);
        var enumerator = wm.getEnumerator("navigator:browser");
        while(enumerator.hasMoreElements()) {
            var win = enumerator.getNext();
            if (win.sidebar && win.sidebar.initMTree)
                win.sidebar.initMTree();
        }
    }

    return true;
}


function lookAt(folder) {
    
}





function getRequestWatcher() {
    var watcher = null;
    try {
        watcher = imns.Cc["@iopus.com/requestwatcher;1"];
        watcher = watcher.getService(imns.Ci.nsISupports);
        watcher = watcher.wrappedJSObject;
        return watcher;
    } catch (e) {
        Components.utils.reportError(e);
        throw "Can't instantiate ReqeustWatcher!";
    } 
}

function onSelectWhiteList() {
    var wlist = document.getElementById("white-list");
    var btn_remove = document.getElementById("remove-site");
    var btn_toggle = document.getElementById("toggle-site");

    btn_remove.disabled = null;
    btn_toggle.disabled = null;

    var item = wlist.selectedItem;
    if (!item)
        return;
    var state = item.lastChild.getAttribute("label");
    if (state == "allowed") {
        btn_toggle.label = "Block";
    } else {
        btn_toggle.label = "Allow";
    }
}

function onTextBoxKeypress(evt) {
    const VK_ENTER = imns.Ci.nsIDOMKeyEvent.DOM_VK_ENTER;
    const VK_RETURN = imns.Ci.nsIDOMKeyEvent.DOM_VK_RETURN;

    if (evt.keyCode == VK_RETURN || evt.keyCode == VK_ENTER) {
        addSite();
        evt.preventDefault();
    }
}


function onListKeydown(evt) {
    const VK_DELETE = imns.Ci.nsIDOMKeyEvent.DOM_VK_DELETE;
    
    if (evt.keyCode == VK_DELETE) {
        removeSites();
        evt.preventDefault();
    } 
}


function onListDblClick(evt) {
    if (evt.button == 0)
        toggleSite();
}


function checkSiteSpelling(site) {
    var arr = null;
    if (arr = site.match(/^(\w+):\/\/([\w.]+)\/(\S*)$/)) {
        return arr[2];
    } else if (arr = site.match(/^([\w-]+(\.[\w-]+)+)\/?.*$/)) {
        return arr[1];
    } else {
        
        alert("The value entered must be a valid URL or domain name (e.g. www.example.com)");
        return null;
    }
}



function fillList(sortorder) {
    var wlist = document.getElementById("white-list");
    var watcher = getRequestWatcher();
    var sites = watcher.enumerateSites();
    if (!sortorder)
        sortorder = "a";        

    
    while( wlist.getRowCount() )
        wlist.removeItemAt(0);

    
    var site = null;
    var arr = new Array();
    for (site in sites)
        arr.push(site);

    var ascending = function (x, y) { return x.localeCompare(y); };
    var descending = function (x, y) { return y.localeCompare(x); };
    if (sortorder == "a")
        arr.sort(ascending);
    else
        arr.sort(descending);
    
    for (var i = 0; i < arr.length; i++) {
        var li = document.createElement("listitem");
        var lc_site = document.createElement("listcell");
        lc_site.setAttribute("label", arr[i]);
        lc_site.setAttribute("tooltiptext",
                             "Double click on the item changes its status");
        var lc_status = document.createElement("listcell");
        lc_status.setAttribute("label", sites[arr[i]]? "allowed" : "blocked");
        li.appendChild(lc_site);
        li.appendChild(lc_status);
        wlist.appendChild(li);
    }
}

function addSite() {
    var textbox = document.getElementById("add-site-textbox");
    var watcher = getRequestWatcher();
    var site = checkSiteSpelling(textbox.value);
    if (!site) {
        textbox.focus();
        textbox.select();
        return;
    }

    watcher.addSite(site);
    textbox.value = "";
    textbox.popupOpen = false;
    fillList();
}


function removeSites() {
    var wlist = document.getElementById("white-list");
    var watcher = getRequestWatcher();

    for (var i = 0; i < wlist.selectedCount; i++) {
        var li = wlist.getSelectedItem(i);
        var site = li.firstChild.getAttribute("label");
        watcher.removeSite(site);
    }
    fillList();
}


function toggleSite() {
    var wlist = document.getElementById("white-list");
    var watcher = getRequestWatcher();
    var btn_toggle = document.getElementById("toggle-site");

    var li = wlist.selectedItem;
    var site = li.firstChild.getAttribute("label");
    var status = li.lastChild.getAttribute("label");
    
    if (status == "allowed") {
        watcher.blockSite(site);
        li.lastChild.setAttribute("label", "blocked");
        btn_toggle.label = "Allow";
    } else {
        watcher.addSite(site);
        li.lastChild.setAttribute("label", "allowed");
        btn_toggle.label = "Block";
    }
}

function initScriptsPane() {
    
    fillList();
}







function editCommandsList() {
    var param = {};
    window.openDialog("chrome://imacros/content/warncmds.xul",
                      "", "modal,centerscreen", param);
}

function enableAFSupport(enable) {
    var enabled_chkbox = document.getElementById("af-enable-support");
    var runtime_chkbox = document.getElementById("af-warn-runtime");
    var runtime_value = document.getElementById("af-runtime-value");
    var commands_chkbox = document.getElementById("af-warn-commands");
    var commands_btn = document.getElementById("af-edit-commands");

    enable = typeof(enable) == "undefined" ? enabled_chkbox.checked : enable;
    if (enable) {
        runtime_chkbox.disabled = null;
        runtime_value.disabled = null;
        commands_chkbox.disabled = null;
        commands_btn.disabled = null;
    } else {
        runtime_chkbox.disabled = true;
        runtime_value.disabled = true;
        commands_chkbox.disabled = true;
        commands_btn.disabled = true;
    }
}


var g_af_logins = {};

function onAfLoginChange(evt) {
    var usr_deck = document.getElementById("af-username-deck");
    var btn = document.getElementById("af-check-credentials-btn");
    btn.image = "";
    if (evt.type == "command" && usr_deck.selectedIndex == 1) {
        var pwd_box = document.getElementById("af-password-box");
        pwd_box.value = g_af_logins[usr_deck.selectedPanel.value];
    }
    
    checkAfCredentials(true);
}

function initAlertfoxPane() {
    
    var usr_deck = document.getElementById("af-username-deck");
    var pwd_box = document.getElementById("af-password-box");
    const AF_auth_host = "https://my.alertfox.com";
    var lm = imns.Cc["@mozilla.org/login-manager;1"].
        getService(imns.Ci.nsILoginManager);
    var logins = lm.findLogins({}, AF_auth_host, "", null);
    if (logins.length == 1) {
        usr_deck.selectedIndex = 0;
        usr_deck.selectedPanel.value = logins[0].username;
        pwd_box.value = logins[0].password;
    } else if (logins.length > 1) {
        usr_deck.selectedIndex = 1;
        var ml = usr_deck.selectedPanel, idx = 0;
        for (var i = 0; i < logins.length; i++) {
            var uname = logins[i].username;
            g_af_logins[uname] = logins[i].password;
            ml.appendItem(uname, uname, "");
            if (imns.Pref.getCharPref("af-username") == uname) {
                idx = i;
            }
        }
        ml.selectedIndex = idx;
        pwd_box.value = g_af_logins[ml.value];
    }

    
    
    

    
    

    
    

    
    
}


function setAlertfoxPane() {
    var usr_deck = document.getElementById("af-username-deck");
    var pwd_box = document.getElementById("af-password-box");
    if (!pwd_box.value)
	return;
    const AF_auth_host = "https://my.alertfox.com";
    var lm = imns.Cc["@mozilla.org/login-manager;1"].
        getService(imns.Ci.nsILoginManager);
    var nsLoginInfo = new Components.
        Constructor("@mozilla.org/login-manager/loginInfo;1",
                    imns.Ci.nsILoginInfo, "init");
    var login = new nsLoginInfo(
        AF_auth_host, "Alertfox Credentials",
        null, usr_deck.selectedPanel.value, pwd_box.value, "", ""
    );
    imns.Pref.setCharPref("af-username", usr_deck.selectedPanel.value);
    var logins = lm.findLogins({}, AF_auth_host, "", null), found = false;
    for (var i = 0; i < logins.length; i++) {
        if (logins[i].username == usr_deck.selectedPanel.value) {
            lm.modifyLogin(logins[i], login);
            found = true;
            break;
        }
    }
    
    if (!found)
        lm.addLogin(login);
}


function checkAfCredentials (silent) {
    var btn = document.getElementById("af-check-credentials-btn");
    const wsdl_url = "https://my.alertfox.com/imu/AlertFoxManagementAPI.asmx";
    var uname = document.getElementById("af-username-deck").selectedPanel.value;
    var pwd = document.getElementById("af-password-box").value;
    var args = {accountName: uname, accountPassword: pwd};

    
    btn.disabled = true;
    btn.image = "chrome://imacros/skin/waiting_16x16.gif";
    SOAPClient.invoke(wsdl_url, "CheckLogin", args, function(rv, err) {
        
        btn.image = "";
        btn.disabled = null;
        
        if (!rv) {
            if (!silent)
                alert("Error occured while checking credentials: "+
                      err.message);
            return;
        }
        if (rv.CheckLoginResult) {
            btn.image = "chrome://imacros/skin/check_ok_16x16.png";
        } else {
            if (!silent)
                alert("Either user name or password is incorrect");
        }
    });
}


window.onload = function () { 
    try {
        if (window.arguments && window.arguments[0].pane) {
            var pane = document.getElementById(window.arguments[0].pane);
            if (pane) {
                var pw = document.getElementById("imacros-options-dialog");
                pw.showPane(pane);
            }
        }

        initGeneralPane();
        initSecurityPane();
        initPathPane();
        initScriptsPane();                
        initAlertfoxPane();
        sizeToContent();
    } catch(e) {
        Components.utils.reportError(e);
    }
};






function do_accept () {       
    try {
        setGeneralPane();
        setSecurityPane();
        if (!setPathPane())
            return;
        setAlertfoxPane();

        window.close();
    } catch(e) {
        Components.utils.reportError(e);
    }
}

