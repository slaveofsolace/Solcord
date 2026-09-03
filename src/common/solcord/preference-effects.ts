import type {SolcordProductPreferences} from "./product";

/** Settings with no runtime consumer here are read directly by their workspace. */
export function planSolcordPreferenceEffects(previous: SolcordProductPreferences, next: SolcordProductPreferences) {
    const changed = (left: unknown, right: unknown) => JSON.stringify(left) !== JSON.stringify(right);
    const {motion: previousMotion, ...previousNative} = previous.nativeSuite;
    const {motion: nextMotion, ...nextNative} = next.nativeSuite;
    const profileChanged = previous.performanceProfile !== next.performanceProfile;
    const features: Array<"performance-hud" | "friend-watch" | "link-lens"> = [];
    if (profileChanged) features.push("performance-hud");
    if (changed(previous.friendWatch, next.friendWatch)) features.push("friend-watch");
    if (previous.safety.linkLens !== next.safety.linkLens) features.push("link-lens");
    return {
        changed: changed(previous, next),
        presentation: profileChanged || changed(previous.appearance, next.appearance),
        baseline: changed(previous.baseline, next.baseline),
        nativeSuite: changed(previousNative, nextNative),
        motion: profileChanged || previous.appearance.motion !== next.appearance.motion || changed(previousMotion, nextMotion),
        privacy: changed(previous.privacy, next.privacy),
        features
    };
}
