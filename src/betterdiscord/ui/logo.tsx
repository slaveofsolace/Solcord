import React from "react";
import {lucideToDiscordIcon} from "@utils/icon";
import clsx from "clsx";
import {Icon, type LucideProps} from "lucide-react";

type Props = Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement> & {accent?: boolean; secondaryColor?: React.CSSProperties["color"];};
type PsuedoLucideIcon = React.ForwardRefExoticComponent<Props>;

const IconRenderer: React.FC<React.ComponentProps<typeof Icon>> = typeof (Icon as any).render === "function"
    ? (Icon as unknown as {render: React.FC<React.ComponentProps<typeof Icon>>;}).render
    : Icon;


const makeNode = (d: string, color: React.CSSProperties["color"] | undefined | null): [elementName: "circle" | "ellipse" | "g" | "line" | "path" | "polygon" | "polyline" | "rect", attrs: Record<string, string>] => {
    const nProps: Record<string, string> = {d};

    if (typeof color === "string") nProps.fill = color;

    return [
        "path",
        nProps
    ];
};

const SoulCordLogo = ((props: Props) => {
    const element = IconRenderer(
        {
            ...props,
            className: clsx("lucide-soulcord", props.className),
            iconNode: [
                makeNode(
                    "M49 13C42 7 29 6 20 11C10 16 11 28 21 32L39 39C44 41 43 47 37 50C30 53 20 50 14 45L8 52C17 61 33 64 45 58C57 52 58 39 48 34L28 26C23 24 24 19 29 17C34 15 41 17 45 21Z",
                    props.accent ? "var(--bd-brand)" : props.color || "currentcolor"
                ),
                makeNode(
                    "M7 20H18L21 24H7ZM43 25H58V29H47ZM5 37H18L22 41H5Z",
                    props.secondaryColor || props.color || "currentcolor"
                )
            ]
        },
        // @ts-expect-error Ignore cause react 19
        props.ref
    ) as React.ReactElement<any, any>;

    return React.cloneElement(element, {
        viewBox: "0 0 64 64",
        enableBackground: "new 0 0 64 64",
        stoke: undefined
    });
}) as PsuedoLucideIcon;

export const Logo = Object.assign(SoulCordLogo, {
    Discord: lucideToDiscordIcon(SoulCordLogo),
    DiscordAccented: lucideToDiscordIcon(SoulCordLogo, (m) => ({...m, accent: true}))
});
