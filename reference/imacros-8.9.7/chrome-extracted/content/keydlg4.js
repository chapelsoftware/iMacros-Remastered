



Components.utils.import("resource://imacros/utils.js");


function do_accept () {
    if("arguments" in window && window.arguments.length > 0) {
        var chkbox = document.getElementById("store");
        if (chkbox.checked) {
            window.arguments[0].master = true;
        }
        var pwdfield = document.getElementById("password-field");
        window.arguments[0].password = pwdfield.value;
    }
    window.close();
}


window.onload = function () {
    var checkbox = document.getElementById("store");
    var pwdfield = document.getElementById("password-field");
    var label_enter = document.getElementById("label-enter");
    var label_reenter = document.getElementById("label-reenter");
    if("arguments" in window && window.arguments.length > 0) {
        if (window.arguments[0].reenter) {
            label_enter.hidden = true;
            label_reenter.hidden = null;
        }
        checkbox.checked = window.arguments[0].master;
        pwdfield = window.arguments[0].password;
    }
    pwdfield.focus();
    pwdfield.select();
    pwdfield.clickSelectsAll = true;
};

function onKeypress(evt) {
    if (evt.keyCode == 13) {
	do_accept();
    }
}
