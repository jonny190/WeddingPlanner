import { CardSurface } from "./CardSurface";
import { useWebFonts } from "./fonts";
import type { CardRendererProps } from "./index";

/** Read-only, responsive rendering of a card. */
export function CardRenderer({ design, fonts, assetUrl, values, className, style }: CardRendererProps) {
  useWebFonts(fonts);
  return (
    <CardSurface
      design={design}
      fonts={fonts}
      assetUrl={assetUrl}
      values={values}
      className={className}
      style={style}
    />
  );
}
