/* eslint-disable no-multi-spaces */


export const MINIMIZE                   = "bd-window-minimize";
export const MAXIMIZE                   = "bd-window-maximize";
export const RELAUNCH                   = "bd-relaunch-app";
export const GET_PATH                   = "bd-get-path";
export const RUN_SCRIPT                 = "bd-run-script";
export const NAVIGATE                   = "bd-did-navigate-in-page";
export const OPEN_DEVTOOLS              = "bd-open-devtools";
export const CLOSE_DEVTOOLS             = "bd-close-devtools";
export const TOGGLE_DEVTOOLS            = "bd-toggle-devtools";
export const OPEN_WINDOW                = "bd-open-window";
export const INSPECT_ELEMENT            = "bd-inspect-element";
export const MINIMUM_SIZE               = "bd-minimum-size";
export const WINDOW_SIZE                = "bd-window-size";
export const DEVTOOLS_WARNING           = "bd-remove-devtools-message";
export const OPEN_DIALOG                = "bd-open-dialog";
export const REGISTER_PRELOAD           = "bd-register-preload";
export const OPEN_PATH                  = "bd-open-path";
export const HANDLE_PROTOCOL            = "bd-handle-protocol";
export const EDITOR_OPEN                = "bd-editor-open";
export const EDITOR_SHOULD_SHOW_WARNING = "bd-editor-show-warning";
export const EDITOR_SETTINGS_GET        = "bd-editor-settings-get";
export const EDITOR_SETTINGS_UPDATE     = "bd-editor-settings-update";
export const SET_ALLOW_PRELOAD_OVERRIDE = "bd-set-allow-preload-override";
export const GET_ALLOW_PRELOAD_OVERRIDE = "bd-get-allow-preload-override";
export const RUN_RENDERER               = "bd-run-renderer";

// SoulCord-internal compatibility bridge. Existing BetterDiscord IPC names stay unchanged.
export const GET_ACTIVITY_COMPATIBILITY = "sc-get-activity-compatibility";
export const TIMELINE_BOOTSTRAP          = "sc-timeline-bootstrap";
export const TIMELINE_BIND               = "sc-timeline-bind";
export const TIMELINE_RELEASE            = "sc-timeline-release";
export const TIMELINE_STATUS             = "sc-timeline-status";
export const TIMELINE_APPEND             = "sc-timeline-append";
export const TIMELINE_READ               = "sc-timeline-read";
export const TIMELINE_CLEAR              = "sc-timeline-clear";
export const SETUP_APPLY                 = "sc-setup-apply";
export const SETUP_ACKNOWLEDGE           = "sc-setup-acknowledge";
export const SETUP_RECONCILE             = "sc-setup-reconcile";
export const SETUP_ROLLBACK              = "sc-setup-rollback";
export const SETUP_AUDIT                 = "sc-setup-audit";
