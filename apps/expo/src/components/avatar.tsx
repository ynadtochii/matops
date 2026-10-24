import type { ReactNode } from "react";
import { Image, View } from "react-native";

import { Txt, useTheme } from "~/components/ui";

function initials(name: string, email = ""): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const second = words[1];
  if (first && second) {
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  }
  if (first) return first.slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase() || "?";
}

function Frame({
  size,
  radius,
  label,
  children,
}: {
  size: number;
  radius: number;
  label?: string;
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      accessible={!!label}
      accessibilityRole={label ? "image" : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? "yes" : "no-hide-descendants"}
      accessibilityElementsHidden={!label}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: t.active,
      }}
    >
      {children}
    </View>
  );
}

function Picture({ src, size }: { src: string; size: number }) {
  return (
    <Image
      source={{ uri: src }}
      style={{ width: size, height: size }}
      resizeMode="cover"
    />
  );
}

export function Avatar({
  src,
  name,
  email,
  size = 28,
  label,
}: {
  src?: string | null;
  name: string;
  email?: string;
  size?: number;
  label?: string;
}) {
  return (
    <Frame size={size} radius={size / 2} label={label}>
      {src ? (
        <Picture src={src} size={size} />
      ) : (
        <Txt size={Math.round(size * 0.38)} weight={600} tone="secondary">
          {initials(name, email)}
        </Txt>
      )}
    </Frame>
  );
}

export function AcademyIcon({
  src,
  name,
  size = 28,
  label,
}: {
  src?: string | null;
  name: string;
  size?: number;
  label?: string;
}) {
  return (
    <Frame size={size} radius={Math.round(size / 5)} label={label}>
      {src ? (
        <Picture src={src} size={size} />
      ) : (
        <Txt size={Math.round(size * 0.42)} weight={600} tone="secondary">
          {name.trim().charAt(0).toUpperCase()}
        </Txt>
      )}
    </Frame>
  );
}
