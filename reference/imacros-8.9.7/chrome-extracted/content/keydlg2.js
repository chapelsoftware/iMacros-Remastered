



Components.utils.import("resource://imacros/utils.js");

function do_accept () {
    try {
        var password = document.getElementById("password-field");
        var confirm = document.getElementById("confirm-field");
        var store = document.getElementById('store');
        if (password.value != confirm.value) {
            alert('Two passwords you enter do not match!');
            return;
        }
        if("arguments" in window && window.arguments.length > 0) {
            window.arguments[0].master = store.checked;
            window.arguments[0].password = password.value;
        }
        window.close();
    } catch(e) {
        Components.utils.reportError(e);
    }
}


window.onload = function () {
    try {
        var password = document.getElementById("password-field");
        var confirm = document.getElementById("confirm-field");
        var store = document.getElementById('store');
        if("arguments" in window && window.arguments.length > 0) {
            store.checked = window.arguments[0].master;
            password.value = confirm.value = window.arguments[0].password;
        }
    } catch(e) {
        Components.utils.reportError(e);
    }
};
