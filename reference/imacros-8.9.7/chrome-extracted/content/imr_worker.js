
const MatchData = new ctypes.StructType(
    "MatchData",
    [
        {"x": ctypes.int32_t},
        {"y": ctypes.int32_t},
        {"confLevel": ctypes.int32_t}
    ]
);


const TM_STATUS_MATCH_FOUND_OK  = 0;
const TM_STATUS_MATCH_NOT_FOUND = 1;
const TM_STATUS_FILE_IMAGE_NOT_FOUND = 2;
const TM_STATUS_IMAGE_ILLEGAL_SIZE = 3;
const TM_STATUS_INTERNAL_ERROR = 4;

var GetMatchForPos = null;
var GetImageSize = null;

var imr_lib = null;

function  init_library(path) {
    imr_lib = ctypes.open(path);

    GetMatchForPos = imr_lib.declare(
        "GetMatchForPos",
        ctypes.default_abi,
	ctypes.int32_t,
        ctypes.jschar.ptr,
        ctypes.jschar.ptr,
	ctypes.int32_t,
        ctypes.int32_t,
	MatchData.ptr
    );

    GetImageSize = imr_lib.declare(
        "GetImageSize",
        ctypes.default_abi,
	ctypes.int32_t,
        ctypes.jschar.ptr,
	ctypes.int32_t.ptr,
        ctypes.int32_t.ptr
    );

    var msg_no_free_beer = "This feature requires the iMacros image"+
            " recognition library, which is part of the commercial"+
            " iMacros Standard and Enterprise Editions.";

    if (!imr_lib || !GetMatchForPos || !GetImageSize) {
        postMessage({
            "type": "error",
            "error": msg_no_free_beer
        });
    }
}

function do_search(img, tmpl, cl) {
    var result = new MatchData();
    var rv = GetMatchForPos(img, tmpl, 0, cl, result.address());
    if (rv == TM_STATUS_MATCH_FOUND_OK) {
        
        var width = new ctypes.int32_t();
        var height = new ctypes.int32_t();
        GetImageSize(tmpl, width.address(), height.address());
        var data = {
            x: result.x,
            y: result.y,
            width: width.value,
            height: height.value
        };
        postMessage({
            "rv": rv,
            "result": data,
            "image": img,
            "template": tmpl
        });
    } else {
        postMessage({"rv": rv, "image": img, "template": tmpl});
    }
}


onmessage = function(evt) {
    msg = evt.data;
    switch(msg.command) {
    case "init":
        init_library(msg.libpath);
        return;
    case "search":
        do_search(msg.image, msg.template, msg.confidenceLevel);
        return;
    case "terminate":
        if (imr_lib)
            imr_lib.close();
        close();
        return;
    }
};
