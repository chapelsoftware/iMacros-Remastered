





Components.utils.import("resource://imacros/utils.js");

window.onload = function () { 
    try{
        if ("arguments" in window && window.arguments.length > 0) {
            var url= document.getElementById('url');
            url.value = window.arguments[0].url;

            var title = document.getElementById('title');
            title.value = window.arguments[0].title;

            var local = document.getElementById('local');
            var url_type = document.getElementById('url-type');
            url_type.selectedItem = local;

            var type_firefox = document.getElementById('type-firefox');
            var bookmark_type = document.getElementById('bookmark-type');
            bookmark_type.selectedItem = type_firefox;

            
            if (/\.js$/.test(window.arguments[0].title)) {
                
                var bookmarklet = document.getElementById("bookmarklet");
                bookmarklet.disabled = true;
            }
        }

        
        var bmsvc = imns.Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
            .getService(imns.Ci.nsINavBookmarksService);
        var menu = document.getElementById("bookmark-location-menu");
        menu.label = bmsvc.getItemTitle(bmsvc.bookmarksMenuFolder);
        menu.folderId = bmsvc.bookmarksMenuFolder;
        var toolbar = document.getElementById("bookmark-location-toolbar");
        toolbar.label = bmsvc.getItemTitle(bmsvc.toolbarFolder);
        toolbar.folderId = bmsvc.toolbarFolder;

        
        var mlist = document.getElementById("bookmark-location-menulist");
        mlist.selectedIndex = imns.s2i(mlist.getAttribute("selectedIndex"));
    } catch(e) {
        Components.utils.reportError(e);
    }
};


function do_accept () {       
    try {
        var title= document.getElementById('title');
        var url= document.getElementById('url');
        var bookmark_type = document.getElementById('bookmark-type');
        var mlist = document.getElementById("bookmark-location-menulist");
        var tags = document.getElementById("tags");
        
        window.arguments[0].res = true;
        window.arguments[0].title = title.value;
        window.arguments[0].url = url.value;
        window.arguments[0].type = bookmark_type.selectedIndex+1;
        window.arguments[0].tags = tags.value;
        window.arguments[0].folderId = mlist.selectedItem.folderId;
        
        
        window.close();
    } catch(e) {
        Components.utils.reportError(e);
    }
}

function update() {
    try {
        var url_type = document.getElementById("url-type");
        var url = document.getElementById('url');
        var type_firefox= document.getElementById('type-firefox');
        var type_buffer= document.getElementById('type-buffer');
        var bookmark_type = document.getElementById('bookmark-type');
        var mlist = document.getElementById("bookmark-location-menulist");
        var tags = document.getElementById("tags");

        if ( url_type.selectedIndex == 0 ) {
            url.value = window.arguments[0].url;
            type_buffer.disabled = true;
            bookmark_type.selectedItem = type_firefox;
        } else if (url_type.selectedIndex == 1) {
            url.value = window.arguments[0].bookmarklet;
            type_buffer.disabled = null;
        }

        if (bookmark_type.selectedIndex == 0) {
            tags.disabled = null;
            mlist.disabled = null;
        } else if (bookmark_type.selectedIndex == 1) {
            tags.disabled = true;
            mlist.disabled = true;
        }
    } catch(e) {
        Components.utils.reportError(e);
    }
}


function toggleBookmarkOptions() {
    var box = document.getElementById("bookmark-options-box");
    box.hidden = box.hidden ? null : true;
    document.getElementById("bookmark-options").
        setAttribute("open", !box.hidden);
    sizeToContent();
}

function onBookmarkLocationChanged(event) {
    var mlist = document.getElementById("bookmark-location-menulist");
    mlist.setAttribute("selectedIndex", mlist.selectedIndex);
}

