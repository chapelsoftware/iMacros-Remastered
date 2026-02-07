





Components.utils.import("resource://imacros/utils.js");

var g_tree = null;


function MacrosTree(tree, children_id, cur_wnd) {
    this.tree = tree;
    this.wnd = cur_wnd;
    this.children_id = children_id;

    return this;
}



function compare(a, b) {
    var la = a.toLowerCase(), lb = b.toLowerCase();
    var bound = Math.min(la.length, lb.length);

    for (var i = 0; i < bound; i++) {
        var l = la.charAt(i), r = lb.charAt(i), x;
        if (l == r)
            continue;
        
        if (l == "#")
            return -1;
        else if (r == "#")
            return 1;
        else if (x = l.localeCompare(r))
            return x;
    }

    return la.length - lb.length; 
}


MacrosTree.prototype = {
    tree: null,
    children_id: null,
    wnd: null,
    sep: null,

    get children() {
	return this.doc.getElementById(this.children_id);
    },

    get doc() {
	return this.wnd.document;
    },

    getLabelFromItem: function(item) {
	var child = item.firstChild;
	while(child) {
	    if(child.tagName == "treerow" ) {
		if(child.firstChild.tagName == "treecell") {
		    var label = child.firstChild.getAttribute("label");
		    return label;
		}
	    }
	    child = child.nextSibling;
	}
	return null;
    },

    treechildrenFromItem: function(item) {
	var child = item.firstChild;
	while(child) {
	    if(child.tagName == "treechildren" ) {
		return child;
	    }
	    child = child.nextSibling;
	}
	return null;
    },

    
    
    getContainer: function(name, parent) {
	var items = parent.childNodes;
	for (var i = 0; i < items.length; i++) {
	    if( items.item(i).getAttribute("container") != "true" )
		continue; 	
	    var item = items.item(i);
	    if (this.getLabelFromItem(item) == name )
		return this.treechildrenFromItem(item);
	}
	
	
	var item = this.doc.createElement("treeitem");
	item.setAttribute("container", "true");

	var row = this.doc.createElement("treerow");
	var con = this.doc.createElement("treechildren");
	item.appendChild(row);
	item.appendChild(con);

	var cell = this.doc.createElement("treecell");
	cell.setAttribute("label", name);

	row.appendChild(cell);

	var child = parent.firstChild;
	while(child) {
	    if (child.getAttribute("container") == "true") {
		var li = this.getLabelFromItem(item).toLowerCase();
		var ci = this.getLabelFromItem(child).toLowerCase();
		if (li < ci) {
		    parent.insertBefore(item, child);
		    break;
		}
	    } else {
		parent.insertBefore(item, child);
		break;
	    }
	    child = child.nextSibling;
	}
	if (!child) {
	    parent.appendChild(item);
	}

	return con;
    },


    
    insertLeaf: function(name, parent) {
	var src, match, properties = "";
	if (match = name.match(/\.(js|iim)$/i)) {
	    
	    if (match[1] == "js") {
		properties = "js-file";
	    } else if (match[1] == "iim") {
		properties = "iim-file";
	    }
	} else {
	    
	    return;
	}

	var item = this.doc.createElement("treeitem");
	var row = this.doc.createElement("treerow");
	var cell = this.doc.createElement("treecell");
	cell.setAttribute("properties", properties);
	cell.setAttribute("label", name);
	row.appendChild(cell);
	item.appendChild(row);

	var child = parent.firstChild;
	while(child) {
	    if (child.getAttribute("container") != "true") {
		var li = this.getLabelFromItem(item).toLowerCase();
		var ci = this.getLabelFromItem(child).toLowerCase();
		if (compare(li, ci) < 0) {
		    parent.insertBefore(item, child);
		    break;
		}
	    }
	    child = child.nextSibling;
	}
	if (!child) {
	    parent.appendChild(item);
	}

    },

    
    initializeTree: function(arr, sep) {
	
	while (this.children.hasChildNodes()) {
	    var nodes = this.children.childNodes;
	    for(var i = 0; i < nodes.length; i++) {
		this.children.removeChild(nodes.item(i));
	    }
	}

	this.tree.treeBoxObject.invalidate();
	this.sep = sep;
	for (var i = 0; i < arr.length; i++) {
	    var path = arr[i].split(sep), x = 0, con = this.children;
	    
	    while(x < path.length-1) {
		con = this.getContainer(path[x], con); x++;
	    }
	    this.insertLeaf(path[x], con);
	}
    },

    
    findItem: function(name) {
	if(name == "")
	    return this.children.parentNode; 
	var con = this.children;
	var path = name.split(this.sep);

	for(var i = 0; i < path.length; i++) {
	    var item = con.firstChild;
	    while (item) {
		if (this.getLabelFromItem(item) == path[i]) {
		    var tcon = this.treechildrenFromItem(item);
		    if (i == path.length-1) {
			
			return item;
		    } else if (path[path.length-1] == "" && i == path.length-2) {
			
			return item;
		    } else if (!tcon) { 
			return null;
		    } else {
			con = tcon;
			break;
		    }
		}
		item = item.nextSibling;
	    }
	    if (!item) 		
		return null;
	}

	return null;
    },

    
    getItemAt: function(idx) {
	var ret = {isContainer: false, DOMNode: null, path: null};

	if ( this.tree.view.isContainer(idx) ) {
	    ret.isContainer = true;
	}

	
	var cidx = idx;
	var s = "";
	while(this.tree.view.getLevel(cidx) > 0) {
	    var item = this.tree.contentView.getItemAtIndex(cidx);
	    if ( this.tree.view.isContainer(cidx) ) {
		s = this.getLabelFromItem(item) + this.sep + s;
	    } else {
		s = this.getLabelFromItem(item) + s;
	    }
	    cidx = this.tree.view.getParentIndex(cidx);
	}

	ret.path = s;
	
	ret.DOMNode = this.tree.contentView.getItemAtIndex(idx);

	return ret;
    },

    getIndexOfItem: function(item) {
	return this.tree.contentView.getIndexOfItem(item);
    },

    getItemPath: function(item) {
	var idx = this.getIndexOfItem(item);
	if (idx == -1)
	    return null;
	var node = this.getItemAt(idx);
	if (!node)
	    return null;
	return node.path;
    },

    
    getSelectedItem: function() {
	var idx = this.tree.currentIndex;
	if ( idx == -1 || !this.tree.view.selection.isSelected(idx))
	    return null;
	return this.getItemAt(idx);
    },

    insertItem: function(item, path) {
	var con = this.findItem(path);
	if (!con || con.getAttribute("container") != "true")
	    return null;	
	if ( !(con = this.treechildrenFromItem(con)) )
	    return null;
	var child = con.firstChild;
	while(child) {
	    if (item.getAttribute("container") == "true") {
		if (child.getAttribute("container") == "true") {
		    if (this.getLabelFromItem(item) <
                        this.getLabelFromItem(child)) {
			con.insertBefore(item, child);
			break;
		    }
		} else {
		    con.insertBefore(item, child);
		    break;
		}
	    } else {
		if (child.getAttribute("container") != "true") {
                    var li = this.getLabelFromItem(item).toLowerCase();
                    var ci = this.getLabelFromItem(child).toLowerCase();

		    if (compare(li, ci) < 0) {
			con.insertBefore(item, child);
			break;
		    }
		}
	    }
	    child = child.nextSibling;
	}
	if (!child) {
	    con.appendChild(item);
	}

	return item;
    },

    removeItem: function(path) {
	var item = this.findItem(path);
	if (!item)
	    return null;
	var con = item.parentNode; 
	return con.removeChild(item);
    },

    _treewalker: function (item, arr, cur_path) {
        if (item.getAttribute("container") == "true") {
            cur_path += this.getLabelFromItem(item)+this.sep;
            var tc = this.treechildrenFromItem(item);
            if ( tc.hasChildNodes() ) {
        	var child = tc.firstChild;
        	while(child) {
        	    arr = this._treewalker(child, arr, cur_path);
        	    child = child.nextSibling;
        	}
            } else {
        	arr.push(cur_path);
            }
        } else {
            arr.push(cur_path + this.getLabelFromItem(item));
        }
        return arr;
    },


    getItemNamesArray: function() {
	var arr = new Array();
        if ( this.children.hasChildNodes() ) {
            var item = this.children.firstChild;
            while(item) {
                arr = this._treewalker(item, arr, "");
                item = item.nextSibling;
            }
        }
        return arr;
    },

    sortItems: function(sort_func) {
	var arr = this.getItemNamesArray();
	arr.sort(sort_func);
	this.initializeTree(arr, this.sep);
    },

    queryState: function() {
        var rv = {unfoldedItems:  new Object(), selectedItem: null};
        
        for(var idx = 0; idx < this.tree.view.rowCount; idx++) {
            if (this.tree.view.isContainer(idx) &&
                this.tree.view.isContainerOpen(idx)) {
                var x = this.getItemAt(idx);
                rv.unfoldedItems[x.path] = true;
            }
        }
        
        var x = this.getSelectedItem();
        if (x != null) {
            rv.selectedItem = x.path;
        }
        return rv;
    },

    applyState: function(state) {
        for (var path in state.unfoldedItems) {
            for(var i = 0; i < this.tree.view.rowCount; i++) {
                if (this.tree.view.isContainer(i)) {
                    var x = this.getItemAt(i);
                    var is_open = this.tree.view.isContainerOpen(i);
                    if (path == x.path && !is_open) {
                        x.DOMNode.setAttribute("open", "true");
                    }
                }
            }
        }
        
        if (state.selectedItem) {
            for(var i = 0; i < this.tree.view.rowCount; i++) {
                var x = this.getItemAt(i);
                if (x.path == state.selectedItem) {
                    this.tree.treeBoxObject.ensureRowIsVisible(i);
                    this.tree.view.selection.select(i);
                    this.tree.view.selectionChanged();
                    this.tree.view.selection.currentIndex = i;
                    break;
                }
            }
        }
    }
    
};


function getMTreeObject() {
    return g_tree;
}






function getLastPathNode(path) {
    var arr = path.split(imns.FIO.psep);
    return arr.pop();
}


function _readdir(entry, arr, cur_path) {
    if (entry.isDirectory()) {
	var entries = entry.directoryEntries;
	cur_path += getLastPathNode(entry.path.toString()) + imns.FIO.psep;
	arr.push(cur_path);
	while(entries.hasMoreElements()) {
	    var en = entries.getNext().
		QueryInterface(imns.Ci.nsILocalFile);
	    arr = _readdir(en, arr, cur_path);
	}
    } else if (entry.isFile()) {
	cur_path += getLastPathNode(entry.path.toString());
	arr.push(cur_path);
    }
    return arr;
}


function showPathErrorDialog(path) {
    var treeview = document.getElementById("treeview");
    var errdlg = document.getElementById("path-error-dialog");
    var errtxt = document.getElementById("path-error-text");
    var deck = document.getElementById("tree-box-deck");
    errtxt.textContent =
        errtxt.textContent.replace("$path$", "\""+path+"\"");
    deck.selectedIndex = 2;
}


function correctPathSettings() {
    var treeview = document.getElementById("treeview");
    var errdlg = document.getElementById("path-error-dialog");
    mainwindow.iMacros.showPrefDialog("path-settings");
    var deck = document.getElementById("tree-box-deck");
    deck.selectedIndex = 0;
    initMTree();
}


function getMacroEntries() {
    try {
        var dir = imns.Pref.getFilePref("defsavepath");
        if (dir && dir.exists()) {
            var arr = new Array();
            var entries = dir.directoryEntries;
            while (entries.hasMoreElements()) {
                var entry = entries.getNext().
                    QueryInterface(imns.Ci.nsILocalFile);
                arr = _readdir(entry, arr, "");
            }
            return arr;
        } else {
            var path = imns.Pref.getFilePref("defsavepath");
            if (path)
                path = path.path;
            else
                path = imns.Pref.getCharPref("defsavepath", true);

            showPathErrorDialog(path);

            return null;
        }
    } catch (e) {
        Components.utils.reportError(e);
    }
    return null;
}








function onDragStart(event) {
    try {
	
	var mtree = getMTreeObject();
	var idx = mtree.tree.treeBoxObject.
           getRowAt(event.pageX, event.pageY);
	if (idx == -1 || idx == 0)
	    return;
	var item = mtree.getSelectedItem();
	if(idx != mtree.getIndexOfItem(item.DOMNode))
	    return;
	
	event.dataTransfer.setData('text/plain', item.path)
        event.dataTransfer.effectAllowed = "move";
        
    } catch (e) {
        Components.utils.reportError(e);
    }
}


function onDragOver (event) {
    try {
	var mtree = getMTreeObject();
	var idx = mtree.tree.treeBoxObject.
           getRowAt(event.pageX, event.pageY);
        var canDrop = false;
	if (idx != -1) {
            var dstNode = mtree.getItemAt(idx);
            canDrop = dstNode && dstNode.isContainer &&
                event.dataTransfer.types.contains("text/plain");
        }
        
        if (canDrop) {
            event.dropEffect = "move";
            event.preventDefault();
        }
    } catch (e) {
        Components.utils.reportError(e);
    }
}



function onDragDrop (event) {
    try {
        if (!event.dataTransfer.types.contains("text/plain"))
            return;
        var src_path = event.dataTransfer.getData("text/plain");

	
	var mtree = getMTreeObject();
	var idx = mtree.tree.treeBoxObject.
	   getRowAt(event.pageX, event.pageY);
	if (idx == -1)
	    return;
	var dstNode = mtree.getItemAt(idx);
	if (!dstNode)
	    return;

        var dst_path, sep = imns.FIO.psep;
	if (dstNode.isContainer) {
	    dst_path = dstNode.path;
	} else {
	    if (dstNode.path.indexOf(sep) != -1)
		dst_path = dstNode.path.split(sep).slice(0, -1).join(sep);
	    else
		dst_path = "";
	}

	
        try {
            var src = imns.FIO.openMacroFile(src_path);
        } catch (e) {
            Components.utils.reportError(e);
            return;
        }

        if (!src || !src.exists())
            return;
	
	var dst = imns.FIO.openMacroFile(dst_path);
        
        
	src.moveTo(dst, "");
        
        
	var srcNode = mtree.removeItem(src_path);
	if (!srcNode)
	    return;
	mtree.insertItem(srcNode, dst_path);
        
        event.preventDefault();
    } catch (e) {
        Components.utils.reportError(e);
    }
}


function setDragHandlers() {
    var tree = document.getElementById("treeview");
    tree.addEventListener("dragstart", onDragStart, false);
    tree.addEventListener("dragenter", onDragOver, false);
    tree.addEventListener("dragover", onDragOver, false);
    tree.addEventListener("drop", onDragDrop, false);
};






function initMTree() {
    
    var predicate = function(a, b) {
        var a_is_dir = a.indexOf(imns.FIO.psep) != -1;
        var b_is_dir = b.indexOf(imns.FIO.psep) != -1;

        if(!a_is_dir && !b_is_dir) {
            return compare(a, b);
        } else if (a_is_dir && !b_is_dir) {
	    return -1; 		
        } else if (!a_is_dir && b_is_dir) {
	    return 1;
        } else {
	    return compare(a, b);
        }
    };

    var arr = getMacroEntries();
    if (!arr) {
        return;
    }
    arr.sort(predicate);
    var tree = document.getElementById("treeview");
    if (!tree)
	throw "no treeview was found";

    if (!g_tree)
	g_tree = new MacrosTree(tree, "favtree", window);
    g_tree.initializeTree(arr, imns.FIO.psep);
}




function checkSIActive() {
    if (!imns.is_windows())
        return;
    
    
    
	  
    
    
    
    
    try {
        
        var wrk = imns.Cc["@mozilla.org/windows-registry-key;1"]
                    .createInstance(imns.Ci.nsIWindowsRegKey);
        wrk.open(wrk.ROOT_KEY_LOCAL_MACHINE, "SOFTWARE", wrk.ACCESS_READ);
        if (wrk.hasChild("iMacros")) {
            var subkey = wrk.openChild("iMacros", wrk.ACCESS_READ);
            if (subkey.hasValue("PathBasic")) { 
                
                
                if (subkey.hasValue("InterfaceType") &&
                    /^fx/.test(subkey.readStringValue("InterfaceType"))) {
                    
                    
                }
            }
            subkey.close();
        }

        wrk.close();

        
        try {
            wrk.create(wrk.ROOT_KEY_CURRENT_USER,
                       "Software\\iMacros",
                       wrk.ACCESS_WRITE);
            wrk.writeStringValue("fx", imacros_version);
            wrk.close();
        } catch (ee) {
            Components.utils.reportError(ee);
            
        }
    } catch (e) {
        Components.utils.reportError(e);
    }
}

function setAdDetails() {
	let ad_text = document.getElementById("imacros-ad-text");
	let ad_text_container = document.getElementById("imacros-ad-text-container");
	let ad_image = document.getElementById("imacros-ad-image");
	
	var xmlhttp = new XMLHttpRequest();
	var url = "chrome://imacros/skin/ads.json";

	xmlhttp.onreadystatechange = function() {
		if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
			var ads = JSON.parse(xmlhttp.responseText);
			var ad_index = Math.floor(Math.random() * ads.length);
			
			ad_text.value = ads[ad_index].ad_text;
			
			ad_text.href = ads[ad_index].ad_link;

			

			ad_image.onclick = function(){
									mainwindow.iMacros.addTab(ad_text.href);
							   };
			ad_image.src = "chrome://imacros/skin/ads/" + ads[ad_index].ad_img;
			
			ad_text_container.collapsed = false;
		}
	};
	xmlhttp.open("GET", url, true);
	xmlhttp.send();
}

window.addEventListener("load", function() {
    
    initMTree();
    
    setDragHandlers();
    
    checkSIActive();
	setAdDetails();
    
    imns.osvc.notifyObservers(window, "imacros-sidebar-loaded", null);
}, false);



window.addEventListener("unload", function() {
    
    var state = JSON.stringify(g_tree.queryState());
    imns.osvc.notifyObservers(mainwindow, "imacros-sidebar-closed", state);
}, false);


function MTree_onSelect(event) {
    if (mainwindow) {
	mainwindow.iMacros.panel.updateSidebarState();
    }
}


function MTree_onDblClick(event) {
    var idx = g_tree.tree.boxObject.getRowAt(event.clientX, event.clientY);
    var item = g_tree.getItemAt(idx);
    if (item.isContainer)
        return;
    if (mainwindow) {
	mainwindow.iMacros.play();
    }
}








function MPopup_onShowing(event) 
{
    try {
	
	var mtree = getMTreeObject();
	var item = mtree.getSelectedItem();
	if (!item)
	    return;

	var bookmark = document.getElementById('addbookmark');
	var editmacro = document.getElementById('editmacro');
	if (item.isContainer) {
	    bookmark.hidden = true;
            editmacro.hidden = true;
	} else {
	    bookmark.hidden = false;
            editmacro.hidden = false;
	}

    } catch(e) {
	Components.utils.reportError(e);
    }
}



function MPopup_removeItem() {
    try {
	var mtree = getMTreeObject();
	var item = mtree.getSelectedItem();
	if (!item)
	    return;
	var file = imns.Pref.getFilePref("defsavepath");
	var path_nodes = item.path.split(imns.FIO.psep);
	for (var i = 0; i < path_nodes.length; i++)
	    file.append(path_nodes[i]);

	var strings = imns.Cc["@mozilla.org/intl/stringbundle;1"].
	    getService(imns.Ci.nsIStringBundleService).
	    createBundle("chrome://imacros/locale/rec.properties");

	if (!confirm(item.isContainer ?
		     strings.GetStringFromName("imacrosareyousurewant37"):
		     strings.GetStringFromName("imacrosareyousurewant38")))
	    return;
	file.remove(true);
	mtree.removeItem(item.path);
    } catch(e) {
	Components.utils.reportError(e);
    }
}


function MPopup_renameItem() 
{
    try {
	var mtree = getMTreeObject();
	var item = mtree.getSelectedItem();
	if (!item)
	    return;
	var editbox = document.getElementById('editname');
	var renamebtn = document.getElementById('im-rename-button');
	editbox.collapsed = null;
	editbox.value = mtree.getLabelFromItem(item.DOMNode);
	renamebtn.collapsed = null;
	editbox.focus();
	editbox.select();
    } catch(e) {
	Components.utils.reportError(e);
    }
}



function MPopup_CreateFolder()  
{

    try {
	var mtree = getMTreeObject();
        var item = mtree.getSelectedItem();
	if (!item)
	    return;
	var con, idx;
	if (item.isContainer) {
	    con = mtree.treechildrenFromItem(item.DOMNode);
            idx = mtree.getIndexOfItem(item.DOMNode);
            if (!mtree.tree.view.isContainerOpen(idx))
                mtree.tree.view.toggleOpenState(idx);
	} else {
	    con = item.DOMNode.parentNode;
	}

	
	var basename = "New Folder";
	var name = basename;
	if (con.hasChildNodes()) {
	    var nodes = con.childNodes, found = true, count = 1;
	    while (found) {
		found = false;
		for (var i = 0; i < nodes.length; i++) {
		    if (mtree.getLabelFromItem(nodes.item(i)) == name) {
			found = true;
			name = basename+" ("+count+")";
			count++;
			break;
		    }
		}
	    }
	}

	var newcon = mtree.getContainer(name, con), t = null;
	if (!newcon) {
	    return;
	}
	t = newcon.parentNode;
	idx = mtree.tree.contentView.getIndexOfItem(t);
	t = mtree.getItemAt(idx);
	var path = imns.Pref.getFilePref("defsavepath").path +
            imns.FIO.psep + t.path;
	var dir = imns.Cc['@mozilla.org/file/local;1']
	    .createInstance(imns.Ci.nsILocalFile);
	dir.initWithPath(path);
	if (!dir.exists())
	    dir.create(0x01, 0777);
    } catch(e) {
	Components.utils.reportError(e);
    }
}


function MPopup_AddBookmark(type)
{
    mainwindow.iMacros.addBookmark(type);
}



function MPopup_EditMacro()
{
    try {
	var mtree = getMTreeObject();
	var item = mtree.getSelectedItem();
        if (!item || item.isContainer)
            return;
        var macro = {name: mtree.getLabelFromItem(item),
                     path: item.path};
        mainwindow.iMacros.edit(macro);
    } catch(e) {
	Components.utils.reportError(e);
    }
}




function onEditKeypress(evt) {
    const VK_ENTER = imns.Ci.nsIDOMKeyEvent.DOM_VK_ENTER;
    const VK_RETURN = imns.Ci.nsIDOMKeyEvent.DOM_VK_RETURN;

    if (evt.keyCode == VK_RETURN || evt.keyCode == VK_ENTER) {
        MTree_renameItem();
        evt.preventDefault();
    }
}



function MTree_renameItem() 
{
    try {
	var mtree = getMTreeObject();
	var item = mtree.getSelectedItem();
	if (!item)
	    return;
	var editbox = document.getElementById('editname');
	var button = document.getElementById('im-rename-button');
	var ext = item.path.match(/\.(js|iim)$/);
	if (ext) 
	    ext = ext[1];
	var newname = editbox.value;
	if (!newname) {
	    editbox.collapsed = true;
	    button.collapsed = true;
	    return;
	}
	if (!/\.(js|iim)/i.test(newname) && ext)
	    newname += "."+ext;
	var file = imns.Pref.getFilePref("defsavepath");
	var path_nodes = item.path.split(imns.FIO.psep);
	for (var i = 0; i < path_nodes.length; i++)
	    file.append(path_nodes[i]);
	file.moveTo(null, newname);
	mtree.tree.view.setCellText(mtree.tree.currentIndex,
				    mtree.tree.columns.getFirstColumn(),
				    newname);
	editbox.collapsed = true;
	button.collapsed = true;
    } catch(e) {
	Components.utils.reportError(e);
    }
}
