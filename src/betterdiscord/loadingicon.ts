import soulCordMark from "@assets/branding/soulcord-mark.svg";

const css = `/* BEGIN V2 LOADER */
/* =============== */

#bd-loading-icon {
  background-image: url("${soulCordMark}");
  position: fixed;
  bottom: 5px;
  right: 5px;
  z-index: 2147483647;
  display: block;
  width: 20px;
  height: 20px;
  background-size: 100% 100%;
  animation: soulcord-loading-animation 1.5s ease-in-out infinite;
}

@keyframes soulcord-loading-animation {
  0% { opacity: 0.05; }
  50% { opacity: 0.8; }
  100% { opacity: 0.05; }
}
/* =============== */
/*  END V2 LOADER  */`;

const iconStyle = document.createElement("style");
iconStyle.textContent = css;

const loadingIcon = document.createElement("div");
loadingIcon.id = "bd-loading-icon";
loadingIcon.className = "bd-loaderv2";
loadingIcon.title = "SoulCord is loading...";

export default class {
    static show() {
        document.body.appendChild(iconStyle);
        document.body.appendChild(loadingIcon);
    }

    static hide() {
        if (iconStyle) iconStyle.remove();
        if (loadingIcon) loadingIcon.remove();
    }
}
