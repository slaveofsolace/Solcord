import React from "react";
import soulCordMark from "@assets/branding/soulcord-mark.svg";
import {lucideToDiscordIcon} from "@utils/icon";
import clsx from "clsx";
import {Icon, type LucideProps} from "lucide-react";

type Props = Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement> & {accent?: boolean; secondaryColor?: React.CSSProperties["color"];};
type PsuedoLucideIcon = React.ForwardRefExoticComponent<Props>;

const IconRenderer: React.FC<React.ComponentProps<typeof Icon>> = typeof (Icon as any).render === "function"
    ? (Icon as unknown as {render: React.FC<React.ComponentProps<typeof Icon>>;}).render
    : Icon;


const SoulCordLogo = ((props: Props) => {
    const element = IconRenderer(
        {
            ...props,
            className: clsx("lucide-soulcord", props.className),
            iconNode: [
                ["image", {href: soulCordMark, x: "0", y: "0", width: "64", height: "64", preserveAspectRatio: "xMidYMid meet"}]
            ]
        },
        // @ts-expect-error Ignore cause react 19
        props.ref
    ) as React.ReactElement<any, any>;

    return React.cloneElement(element, {
        viewBox: "0 0 64 64",
        enableBackground: "new 0 0 64 64",
        stroke: "none"
    });
}) as PsuedoLucideIcon;

export const Logo = Object.assign(SoulCordLogo, {
    Discord: lucideToDiscordIcon(SoulCordLogo),
    DiscordAccented: lucideToDiscordIcon(SoulCordLogo, (m) => ({...m, accent: true}))
});
