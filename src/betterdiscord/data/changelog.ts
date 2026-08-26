import config from "@stores/config";
import type {ChangelogProps} from "@ui/modals/changelog";

// fixed, improved, added, progress
export default {
    title: "SoulCord",
    subtitle: `v${config.get("version")}`,
    // https://youtu.be/BZq1eb9d0HI?si=67V2eArlF4atnGnz
    // video: "https://www.youtube.com/embed/BZq1eb9d0HI?si=67V2eArlF4atnGnz&vq=hd720p&hd=1&rel=0&showinfo=0&mute=0&loop=1&autohide=1",
    // banner: "https://i.imgur.com/wuh5yMK.png",
    blurb: "V2 brings private stream safeguards, a native daily-use suite, and six new full-shell themes.",
    changes: [
        {
            type: "added",
            title: "Audience Guard",
            items: [
                "Prevents or stops Go Live when a denied user is detected in the current call",
                "Requires per-call arming and fails closed when Discord's stream adapters drift",
                "Keeps denied IDs out of portable settings, logs, profiles, and diagnostics"
            ]
        },
        {
            type: "added",
            title: "Native suite",
            items: [
                "Consolidates privacy, composer, call, audio, translation, people, and channel tools",
                "Adds explicit previews before sending, recording, translating, or marking notifications read",
                "Archives reviewed community addons only after replacement health checks pass"
            ]
        },
        {
            type: "improved",
            title: "Appearance and recovery",
            items: [
                "Adds six distinct full-shell themes with reduced-motion and readable-focus treatment",
                "Extends Plugin Doctor, migration rollback, and hash-bound provider verification",
                "Retains SoulCord's restricted Activity preload policy and bounded compatibility ledger"
            ]
        }
    ]
} as ChangelogProps;
