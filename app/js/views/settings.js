var whatsApp = require('electron').remote.getGlobal("whatsApp");
var settings = require('electron').remote.getGlobal('settings');
var config = require('electron').remote.getGlobal('config');
const {dialog} = require('electron').remote;

var SettingsView = {
    bindEvents() {
        $this = this;
        $("#save-button").on("click", (e) => {
            e.preventDefault();
            if ($(".invalid").length > 0 ) {
                return;
            }
            $this.saveSettings();
            settings.window.close();
        });

        $("#close-button").on("click", () => {
            settings.window.close();
        });

        $("#useProxy").on("change", () => {
            $("#httpProxy").prop("disabled", !($("#useProxy").is(":checked")));
            $("#httpsProxy").prop("disabled", !($("#useProxy").is(":checked")));
        });
    },

    init() {
        document.title = _("Settings");

        $("#autostart").attr("checked", config.get("autostart") == true);
        $("#startminimized").attr("checked", config.get("startminimized") == true);
        $("#trayicon").attr("checked", config.get("trayicon") != false);
        $("#avatars").attr("checked", config.get("hideAvatars"));
        $("#previews").attr("checked", config.get("hidePreviews"));
        if (config.get("thumbSize")) {
            $("#thumb-size").val(config.get("thumbSize"));
        }
        $("#useProxy").attr("checked", config.get("useProxy"));
        $("#httpProxy").val(config.get("httpProxy"));
        $("#httpsProxy").val(config.get("httpsProxy"));
        $("#httpProxy").prop("disabled", !($("#useProxy").is(":checked")));
        $("#httpsProxy").prop("disabled", !($("#useProxy").is(":checked")));

        $("#customcss_enable").attr("checked", config.get("customcss") != undefined);
        if ($("#customcss_enable").is(":checked")) {
            $("#customcss_file").val(config.get("customcss"));
        }

        this.bindEvents();
    },

    saveSettings() {

        if ($("#customcss_enable").is(":checked")) {
            config.set("customcss", $("#customcss_file").val());
        } else {
            config.set("customcss", undefined);
        }

        config.set("autostart", $("#autostart").is(":checked"));
        config.set("startminimized", $("#startminimized").is(":checked"));
        config.set("hideAvatars", $("#avatars").is(":checked"));
        config.set("hidePreviews", $("#previews").is(":checked"));
        config.set("thumbSize", parseInt($("#thumb-size").val(), 10));
        config.set("trayicon", $("#trayicon").is(":checked"));
        if ($("#useProxy").is(":checked")) {
            config.set("useProxy", $("#useProxy").is(":checked"));
            config.set("httpProxy", $("#httpProxy").val());
            config.set("httpsProxy", $("#httpsProxy").val());
        } else {
            config.unSet("useProxy");
            config.unSet("httpProxy");
            config.unSet("httpsProxy");
        }
        config.saveConfiguration();
        config.applyConfiguration();
        whatsApp.window.reload();
    }
};

function chooseCustomCSS() {
    if ($("#customcss_enable").is(":checked")) {
        dialog.showOpenDialog(function (fileNames) {
            if (fileNames === undefined || fileNames.length == 0) {
                $("#customcss_enable").removeAttr("checked");
                return;
            }
            $("#customcss_file").val(fileNames[0]);
        });
    } else {
        $("#customcss_file").val("");
    }
}

$(document).ready(() => {
    SettingsView.init();
});
