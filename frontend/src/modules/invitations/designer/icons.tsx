// Small stroke icons (24px grid) used across the designer.
import type { ReactNode, SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconUndo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);

export const IconRedo = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V4.5h6V7" />
    <path d="m6 7 1 13h10l1-13" />
    <path d="M10 11v5M14 11v5" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </Svg>
);

export const IconForward = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19V6" />
    <path d="m6 11 6-6 6 6" />
  </Svg>
);

export const IconBackward = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v13" />
    <path d="m18 13-6 6-6-6" />
  </Svg>
);

export const IconAlignLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
  </Svg>
);

export const IconAlignCenter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
  </Svg>
);

export const IconAlignRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />
  </Svg>
);

export const IconText = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 7V5h14v2" />
    <path d="M12 5v14" />
    <path d="M9 19h6" />
  </Svg>
);

export const IconHeading = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 5v14M18 5v14M6 12h12" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="m21 16-5-5-9 9" />
  </Svg>
);

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconRotate = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v5h-5" />
  </Svg>
);

export const IconItalic = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 5h8M6 19h8M14 5l-4 14" />
  </Svg>
);

export const IconUppercase = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7h8M7 7v11" />
    <path d="M13 10h8M17 10v8" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const IconGrip = (p: IconProps) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <circle cx="9" cy="6" r="1.4" />
    <circle cx="15" cy="6" r="1.4" />
    <circle cx="9" cy="12" r="1.4" />
    <circle cx="15" cy="12" r="1.4" />
    <circle cx="9" cy="18" r="1.4" />
    <circle cx="15" cy="18" r="1.4" />
  </Svg>
);

export const IconCenterH = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v18" />
    <rect x="6" y="8" width="12" height="8" rx="1.5" />
  </Svg>
);

export const IconCenterV = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h18" />
    <rect x="8" y="6" width="8" height="12" rx="1.5" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconBraces = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 4H7a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h1" />
    <path d="M16 4h1a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-1" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12 5 5 9-10" />
  </Svg>
);

export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </Svg>
);
