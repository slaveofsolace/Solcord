/**
 * Discord's updater and bootstrap window already provide the familiar spinning
 * Discord mark. SoulCord deliberately adds no second splash over that surface.
 * Keeping this adapter preserves BetterDiscord's startup contract without
 * duplicating branding, motion, or focus behavior in the renderer.
 */
export default class {
    static show(): void {return;}

    static hide(): void {return;}
}
