



Components.utils.import("resource://imacros/utils.js");




window.onload = function () {
    try {
        var btn = document.getElementById("copy-to-clipboard-btn");
        btn.focus();
        var textbox = document.getElementById('link');
        textbox.value = window.arguments[0].url;

        var urllen = document.getElementById('text2');
        var text = urllen.firstChild.nodeValue;
        text = text.replace(/\(num\)/, window.arguments[0].url.length+"");
        urllen.firstChild.nodeValue = text;
    } catch(e) {
        Components.utils.reportError(e);
    }
};


function link0()
{
    var copytext = window.arguments[0].url;
    var str = imns.Cc["@mozilla.org/supports-string;1"].
        createInstance(imns.Ci.nsISupportsString);
    if (!str)
        return;
    str.data = copytext;
    var trans = imns.Cc["@mozilla.org/widget/transferable;1"].
        createInstance(imns.Ci.nsITransferable);
    if (!trans)
        return;
    trans.addDataFlavor("text/unicode");
    trans.setTransferData("text/unicode", str, copytext.length * 2); 
    var clipid = imns.Ci.nsIClipboard; 
    var clip = imns.Cc["@mozilla.org/widget/clipboard;1"]
        .getService(clipid); 
    if (!clip)
        return; 
    clip.setData(trans, null, clipid.kGlobalClipboard);
    
    var textbox = document.getElementById('link');
    textbox.select();
}


function link2()
{
    const url = "mailto:?subject=You've received an imacro!&body="+
        window.arguments[0].url;
    var uri = imns.Cc["@mozilla.org/network/simple-uri;1"]
        .getService(imns.Ci.nsIURI);

    uri.spec = url;
    imns.Cc["@mozilla.org/uriloader/external-protocol-service;1"]
        .getService(imns.Ci.nsIExternalProtocolService)
        .loadUrl(uri);
    window.close();
}


function link3()
{
    const url = "http://www.addthis.com/bookmark.php?pub=imacrosfx&url="+
        encodeURIComponent(window.arguments[0].url)+
        "&title="+encodeURIComponent(window.arguments[0].name);
    var browser = null;
    if (opener.window.content.document.location == "about:blank")
        opener.window.content.document.location = url;
    else if ( opener.window.getBrowser && (browser = opener.window.getBrowser()) )
        browser.selectedTab = browser.addTab(url);
    window.close();
}


