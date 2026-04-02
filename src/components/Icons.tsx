

// Common icon properties for consistent look
const iconProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  style: { display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }
};

export const Icons = {
  Graph: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  ),
  Number: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M4 9h16" />
      <path d="M4 15h16" />
      <path d="M10 3 8 21" />
      <path d="M16 3l-2 18" />
    </svg>
  ),
  Calculate: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M18 7V4H6l6 8-6 8h12v-3" />
      <path d="M9 12h5" />
    </svg>
  ),
  Text: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
  Solve: (props?: any) => (
    <svg {...iconProps} {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  Search: (props?: any) => (
    <svg {...iconProps} {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  Slider: (props?: any) => (
    <svg {...iconProps} {...props}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="2" y1="14" x2="6" y2="14" />
      <line x1="10" y1="8" x2="14" y2="8" />
      <line x1="18" y1="16" x2="22" y2="16" />
    </svg>
  ),
  Decimal: (props?: any) => (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  ),
  Result: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M12 2v20" />
      <path d="M2 12h20" />
      <path d="m4.9 4.9 14.2 14.2" />
      <path d="m4.9 19.1 14.2-14.2" />
    </svg>
  ),
  Append: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  ),
  Calculus: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M7 22c5 0 5-2 5-6V8c0-4 0-6 5-6" />
      <path d="M10 12h4" />
    </svg>
  ),
  Trigger: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M13 3 4 14h7l-2 7 9-11h-7z" />
    </svg>
  ),
  Gate: (props?: any) => (
    <svg {...iconProps} {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Range: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="m3 16 4-4 4 4" />
      <path d="m15 16 4-4 4 4" />
      <line x1="3" y1="8" x2="21" y2="8" />
    </svg>
  ),
  ForEach: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M4 12V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-6" />
      <path d="m3 20 3-3 3 3" />
      <path d="M7 14h10" />
      <path d="M7 10h10" />
      <path d="M7 6h10" />
    </svg>
  ),
  Save: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v13a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  ),
  Load: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Clear: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  ),
  Sun: (props?: any) => (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.9 4.9 1.4 1.4" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.3 17.7-1.4 1.4" />
      <path d="m19.1 4.9-1.4 1.4" />
    </svg>
  ),
  Moon: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  ),
  ExternalLink: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  Comment: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Grid: (props?: any) => (
    <svg {...iconProps} {...props}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  Balance: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M12 22V3" />
      <path d="M5 12h14" />
      <path d="M12 3l-7 9" />
      <path d="M12 3l7 9" />
      <circle cx="5" cy="15" r="3" />
      <circle cx="19" cy="15" r="3" />
    </svg>
  ),
  Languages: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  ),
  Sound: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M11 5L6 9H2V15H6L11 19V5Z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  ),
  Collapse: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="m3 19 6-6M15 5l6 6M5 15l-2 4h4" />
      <path d="M19 9l2-4h-4" />
    </svg>
  ),
  Check: (props?: any) => (
    <svg {...iconProps} {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Package: (props?: any) => (
    <svg {...iconProps} {...props}>
      <path d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5Z" />
      <path d="M3 7.5v9L12 21l9-4.5v-9" />
      <path d="M12 12v9" />
    </svg>
  )
};
