import React from "react";
import { useTheme } from "./ThemeProvider";
import { typographyWrapperStyle } from "../typography";

export interface BrandWordmarkProps {
  text?: string;
  style?: React.CSSProperties;
}

/** Logo image with text wordmark fallback from theme.identity. */
export const BrandWordmark: React.FC<BrandWordmarkProps> = ({
  text,
  style = {},
}) => {
  const theme = useTheme();
  const label = text ?? theme.identity.brandName;
  const fontFamily = theme.typography.headingFont;

  if (theme.identity.logoUrl) {
    return (
      <img
        src={theme.identity.logoUrl}
        alt={label}
        style={{
          maxHeight: "100%",
          maxWidth: "100%",
          objectFit: "contain",
          ...style,
        }}
      />
    );
  }

  return (
    <div
      style={typographyWrapperStyle(label, fontFamily, {
        color: theme.colors.onBackground,
        fontWeight: theme.typography.weightScale.heading,
        ...style,
      })}
    >
      {label}
    </div>
  );
};
