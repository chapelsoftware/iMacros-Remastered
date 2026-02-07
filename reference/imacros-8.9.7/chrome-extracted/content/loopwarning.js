



Components.utils.import("resource://imacros/utils.js");

function do_accept () {
    try {
        var wind1= document.getElementById('noloopwarning');
        if (!wind1.checked) {
            imns.Pref.setBoolPref('noloopwarning', true);
        }
        window.close();
    } catch(e){}
}


