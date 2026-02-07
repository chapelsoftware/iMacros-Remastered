





Components.utils.import("resource://imacros/utils.js");

window.onload = function () {
    var group = document.getElementById("record-mode-group");
    var val = imns.Pref.getCharPref("record-mode");
    if (!/^(:?auto|conventional|events|xy)$/.test(val)) {
        val = "auto";
        imns.Pref.setCharPref("record-mode", "auto");
    }
    var item = document.getElementById(val);
    group.selectedItem = item;

    var expert_mode = imns.Pref.getBoolPref("expert-mode");
    var expert_box = document.getElementById("expert-mode");
    expert_box.checked = expert_mode;

    var favorId = imns.Pref.getBoolPref("id-priority");
    if (favorId == null) {
        favorId = true;
        imns.Pref.setBoolPref("id-priority", true);
    }
    var id_priority = document.getElementById("id-priority");
    id_priority.checked = favorId;

    if (val == "conventional") {
        expert_box.disabled = false;
        id_priority.disabled = expert_box.checked;
    }

    group.addEventListener("command", function(e) {
        if (e.target.id == "conventional") {
            expert_box.disabled = false;
            id_priority.disabled = expert_box.checked;
        } else if (/xy|auto|events/.test(e.target.id)) {
            expert_box.disabled = true;
            id_priority.disabled = false;
        }
    });

    
    

    expert_box.addEventListener("command", function(e) {
        id_priority.disabled = expert_box.checked;
    });
};


function do_accept () {         
    var group = document.getElementById("record-mode-group");
    var id = group.selectedItem.id;
    var id_priority = document.getElementById("id-priority");
    imns.Pref.setCharPref("record-mode", id);
    imns.Pref.setBoolPref("id-priority", id_priority.checked);
    var expert_box = document.getElementById("expert-mode");
    imns.Pref.setBoolPref("expert-mode", expert_box.checked);
    window.close();
}