import type { ThemeToken } from "../../types/theme-tokens";
import { brandKitToTheme } from "./brandKitToTheme";
import { VIRAEDIT_BRAND_KIT } from "./canonicalBrand";

/** Resolved default theme — derived from canonical Brand Kit at module load. */
export const DEFAULT_THEME: ThemeToken = brandKitToTheme({
  ...VIRAEDIT_BRAND_KIT,
  logoText: "ViraEdit",
});
