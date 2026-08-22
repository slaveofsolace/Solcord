import type {Command} from "@modules/commandmanager";
import SettingsRenderer from "@ui/settings";


export default {
    id: "support",
    name: "support",
    description: "Open SoulCord health, recovery, and support information",
    options: [],
    execute: async () => {
        SettingsRenderer.openSettingsPage("soulcord");
    }
} satisfies Command;
