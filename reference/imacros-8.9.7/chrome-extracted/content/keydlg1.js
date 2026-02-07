



Components.utils.import("resource://imacros/utils.js");


function do_accept () {
    var pwdfiled = document.getElementById("password-field");
    if("arguments" in window && window.arguments.length > 0) {
        window.arguments[0].password = pwdfiled.value;
    }
    window.close();
}


window.onload = function () {
    var pwdfiled = document.getElementById("password-field");

    if("arguments" in window && window.arguments.length > 0) {
        pwdfiled.value = window.arguments[0].password;
    }
    pwdfiled.focus();
    pwdfiled.select();
    pwdfiled.clickSelectsAll = true;
}


function onKeypress(evt) {
    if (evt.keyCode == 13) {
	do_accept();
    }
}



