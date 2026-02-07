



Components.utils.import("resource://imacros/utils.js");

window.onload = function () {
    if("arguments" in window && window.arguments.length > 0) {
        var list = document.getElementById('message');
        list.value = window.arguments[0].extractData;
    }
};
