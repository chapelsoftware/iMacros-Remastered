



Components.utils.import("resource://imacros/utils.js");


function do_accept () {
    var usedefault = document.getElementById("use-default");
    var updatepwd = document.getElementById("update-password");
    var pwdfiled = document.getElementById("password-field");
    var confirm = document.getElementById("confirm-field");

    if("arguments" in window && window.arguments.length > 0) {
        if (usedefault.selected) {
            window.arguments[0].usedefault = true;
        } else {
            window.arguments[0].usedefault = false;
            if (pwdfiled.value != confirm.value) {
                alert('Two passwords you enter do not match!');
                return;
            }
            window.arguments[0].password = pwdfiled.value;
        }
    }
    window.close();
}


window.onload = function () {
    var usedefault = document.getElementById("use-default");
    var pwdfiled = document.getElementById("password-field");
    var confirm = document.getElementById("confirm-field");
    var radiogrp = document.getElementById("pwd-group");
    radiogrp.selectedItem = usedefault;
    pwdfiled.disabled = true;
    confirm.disabled = true;
};


function update() {
    var pwdfiled = document.getElementById("password-field");
    var confirm = document.getElementById("confirm-field");
    var usedefault = document.getElementById("use-default");
    if (!usedefault.selected) { 
        pwdfiled.disabled = true;
        confirm.disabled = true;
    } else {
        pwdfiled.disabled = null;
        confirm.disabled = null;
    }
}
