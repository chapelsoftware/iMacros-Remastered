





try {


function __loginf(text) {
    try {
        if (XPCOM) {
            var cs = XPCOM.getService("@mozilla.org/consoleservice;1");
            cs.logStringMessage(text);
        } else if (console) {
            console.log(text);
        }
    } catch(e) {}
    dump(text+"\n");
}



const ErrorDescription = new ctypes.StructType(
    "ErrorDescription",
    [{"str": ctypes.char.ptr}]
);



const Command = new ctypes.StructType(
    "Command",
    [
        {"clientId": ctypes.int32_t},
        {"command": ctypes.char.ptr}
    ]
);


var getErrorDescription = null;
var freeErrorDescription = null;
var getErrorCode = null;
var getCommand = null;
var freeCommand = null;

var lib = null;


function postError(e) {
    if (!e) {
        e = new ErrorDescription();
        getErrorDescription(e.address());
        postMessage({
            "command": "throw_error",
            "message": e.str.readString(),
            "error_code": getErrorCode()
        });
        freeErrorDescription(e.address());
    } else {
        postMessage({
            "command": "throw_error",
            "message": e.message,
            "error_code": e.error_code || -1,
        });
    }
}


onmessage = function(evt) {
    var msg = evt.data;

    if (msg.command != "init") {
        postError({
            "command": "throw_error",
            "message": "Listener: unknown command "+msg.command
        });

        return;
    }

    __loginf("SI listener started");
    lib = ctypes.open(msg.libpath);
    
    getErrorDescription = this.lib.declare(
        "getErrorDescription",
        ctypes.default_abi,
        ctypes.int32_t,
        ErrorDescription.ptr
    );

    freeErrorDescription = this.lib.declare(
        "freeErrorDescription",
        ctypes.default_abi,
        ctypes.void_t,
        ErrorDescription.ptr
    );

    getErrorCode = this.lib.declare(
        "getErrorCode",
        ctypes.default_abi,
        ctypes.int32_t
    );


    getCommand = lib.declare(
        "getCommand",
        ctypes.default_abi,
        ctypes.int32_t,
        Command.ptr
    );
    
    freeCommand = lib.declare(
        "freeCommand",
        ctypes.default_abi,
        ctypes.void_t,
        Command.ptr
    );
    
    setTimeout(function() {
	postMessage({"command": "do_onlistenerrun"});
        var cmd = new Command();
        while(true) {
            var rv = getCommand(cmd.address());
            if (rv != 0) {
                postError({
                    "message": "getCommand() error",
                    "error_code": rv
                });
                postMessage({"command": "do_onlistenerclose"});
                break;
            } 
            if (cmd.command.isNull()) {
                postMessage({"command": "do_onlistenerclose"}); 
                __loginf("SI listener got termination command");
                close();
                break;
            } else {
                postMessage({
                    "command": "send_request",
                    "request": cmd.command.readString(),
                    "clientId": cmd.clientId
                });
                freeCommand(cmd.address());
            }
        }
    }, 0);
};
    
} catch(e) {
    postMessage({"command": "do_onlistenererror", "error": e.toSource()});
    __loginf("si_listener.js exception "+e.toSource());
}
