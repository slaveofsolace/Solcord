import {SOULCORD_LAUNCH_TIMING, soulCordLaunchTimeout} from "@common/soulcord/launch-identity";


const STYLE_ID = "soulcord-launch-identity-style";
const LAYER_ID = "soulcord-launch-identity";
const css = `
#${LAYER_ID} {
  --soulcord-launch-ink: #f2eadf;
  --soulcord-launch-accent: #79d7d0;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: grid;
  place-items: center;
  pointer-events: none;
  color: var(--soulcord-launch-ink);
  opacity: 1;
  transition: opacity ${SOULCORD_LAUNCH_TIMING.handoffMs}ms ease-out;
}
#${LAYER_ID}.soulcord-launch-handoff { opacity: 0; }
#${LAYER_ID} .soulcord-launch-lockup {
  display: inline-flex;
  align-items: baseline;
  min-width: 9.2ch;
  padding: 10px 13px;
  background: rgb(16 19 21 / 72%);
  border: 1px solid rgb(121 215 208 / 48%);
  border-radius: 6px;
  box-shadow: 0 8px 30px rgb(0 0 0 / 24%);
  font: 650 clamp(22px, 3.2vw, 38px)/1.05 var(--font-primary, system-ui, sans-serif);
  letter-spacing: -0.045em;
  animation: soulcord-launch-settle ${SOULCORD_LAUNCH_TIMING.settleMs}ms ease-out both;
}
#${LAYER_ID} .soulcord-launch-u {
  display: inline-block;
  width: 0;
  overflow: hidden;
  color: var(--soulcord-launch-accent);
  opacity: 0;
  transform: translateY(-0.55em);
  animation: soulcord-launch-insert ${SOULCORD_LAUNCH_TIMING.insertMs}ms cubic-bezier(.2,.8,.2,1) ${SOULCORD_LAUNCH_TIMING.settleMs}ms forwards;
}
#${LAYER_ID} .soulcord-launch-suffix { display: inline-block; }
@keyframes soulcord-launch-settle {
  from { opacity: 0; transform: translateY(7px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes soulcord-launch-insert {
  0% { width: 0; opacity: 0; transform: translateY(-0.55em); }
  46% { width: .64em; opacity: 1; }
  100% { width: .64em; opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  #${LAYER_ID} { transition-duration: 1ms; }
  #${LAYER_ID} .soulcord-launch-lockup { animation: none; }
  #${LAYER_ID} .soulcord-launch-u { width: .64em; opacity: 1; transform: none; animation: none; }
}
@media (forced-colors: active) {
  #${LAYER_ID} { --soulcord-launch-ink: CanvasText; --soulcord-launch-accent: Highlight; }
  #${LAYER_ID} .soulcord-launch-lockup { background: Canvas; border-color: CanvasText; box-shadow: none; forced-color-adjust: none; }
}
`;

let timeout: ReturnType<typeof setTimeout> | undefined;
let handoff: ReturnType<typeof setTimeout> | undefined;

function removeLayer(): void {
    if (timeout) clearTimeout(timeout);
    if (handoff) clearTimeout(handoff);
    timeout = undefined;
    handoff = undefined;
    document.getElementById(LAYER_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
}

function launchLayer(): HTMLElement {
    const layer = document.createElement("div");
    layer.id = LAYER_ID;
    layer.className = "bd-loaderv2 soulcord-launch-layer";
    layer.setAttribute("role", "status");
    layer.setAttribute("aria-label", "SoulCord is starting");
    layer.innerHTML = `<span class="soulcord-launch-lockup" aria-hidden="true"><span>SO</span><span class="soulcord-launch-u">U</span><span class="soulcord-launch-suffix">Lcord</span></span>`;
    return layer;
}

export default class {
    static show(rawTimeout?: number): void {
        try {
            if (!document.body || document.getElementById(LAYER_ID)) return;
            const style = document.createElement("style");
            style.id = STYLE_ID;
            style.textContent = css;
            document.head?.appendChild(style);
            document.body.appendChild(launchLayer());
            timeout = setTimeout(removeLayer, soulCordLaunchTimeout(rawTimeout));
        }
        catch {
            // The Discord startup surface is deliberately left untouched as the fallback.
            removeLayer();
            document.dispatchEvent(new CustomEvent("soulcord:launch-recovery", {detail: {reason: "mount-failed"}}));
        }
    }

    static hide(): void {
        try {
            const layer = document.getElementById(LAYER_ID);
            if (!layer) return removeLayer();
            if (timeout) clearTimeout(timeout);
            timeout = undefined;
            layer.classList.add("soulcord-launch-handoff");
            handoff = setTimeout(removeLayer, SOULCORD_LAUNCH_TIMING.handoffMs);
        }
        catch {removeLayer();}
    }
}
