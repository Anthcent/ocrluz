---
name: Ocryon
description: Calm mobile-first workspace for scanning, organizing, and finding documents.
colors:
  ink: "#18191d"
  canvas: "#eceef0"
  surface: "#ffffff"
  violet: "#a38ef9"
  violet-deep: "#5f49c8"
  violet-soft: "#eeeafe"
  mint: "#a4f5a6"
  mint-deep: "#267a46"
  mint-soft: "#e8fbe8"
  amber: "#ffd89d"
  amber-deep: "#855616"
  amber-soft: "#fff2da"
  muted: "#666b74"
  line: "#dde0e4"
  danger: "#d85252"
  danger-soft: "#ffe7e5"
typography:
  headline:
    fontFamily: "Fustat, ui-rounded, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Fustat, ui-rounded, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Fustat, ui-rounded, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Fustat, ui-rounded, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 650
    lineHeight: 1.2
rounded:
  control: "12px"
  card: "16px"
  panel: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "{colors.violet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
---

# Design System: Ocryon

## 1. Overview

**Creative North Star: "The Organized Document Desk"**

Ocryon feels like a clear records desk prepared for scanning and filing: soft neutral canvas, crisp white sheets, labeled folders, dark controls, and a few pastel markers that communicate state. Composition is mobile-first and information-rich, but never crowded or game-like.

Desktop layouts expand into editorial columns and floating work areas. Motion is short and functional, limited to state changes, overlays, and tactile press feedback.

**Key Characteristics:**
- Soft cool-gray canvas with white document surfaces.
- Near-black floating navigation and primary actions.
- Violet, mint, and amber reserved for selection, success, and attention.
- Rounded geometric typography with sentence-case labels.
- Compact summaries that expose progress and recent information.

## 2. Colors

Pastel markers sit on a neutral work surface; ink carries hierarchy and contrast.

### Primary
- **Violet Marker:** selection, active filters, focus, and secondary actions.
- **Ink Dock:** primary actions, navigation, and strongest text hierarchy.

### Secondary
- **Mint Progress:** completed OCR, successful states, and positive progress.
- **Amber Note:** queued work, warnings, and information requiring attention.

### Neutral
- **Cool Canvas:** application background and recessed controls.
- **White Sheet:** cards, dialogs, and document viewing surfaces.
- **Graphite Muted:** secondary copy and metadata.
- **Soft Line:** separators where spacing alone cannot communicate grouping.

**The Marker Rule.** Pastels communicate meaning. Never scatter them as unrelated decoration.

## 3. Typography

**Display Font:** Fustat (with ui-rounded and system-ui fallback)
**Body Font:** Fustat (with ui-rounded and system-ui fallback)

**Character:** Rounded geometric forms keep dense workflows approachable. Weight and scale create hierarchy; uppercase does not.

### Hierarchy
- **Headline** (700, 2rem, 1.1): page title and major totals.
- **Title** (700, 1.125rem, 1.25): cards, panels, and important rows.
- **Body** (500, 1rem, 1.5): instructions and document information, capped near 70ch.
- **Label** (650, 0.8125rem, 1.2): metadata, chips, tabs, and controls in sentence case.

**The Sentence Case Rule.** Buttons, tabs, navigation, and labels use sentence case. Uppercase is prohibited except acronyms.

## 4. Elevation

Surfaces are flat by default and separated through tonal contrast. Low ambient shadows appear only on floating navigation, dialogs, and interactive cards that lift on hover.

### Shadow Vocabulary
- **Surface:** `0 1px 2px rgba(41, 36, 68, 0.06)`: white cards on canvas.
- **Floating:** `0 12px 32px rgba(30, 27, 48, 0.16)`: docks, dialogs, and overlays.

**The Quiet Depth Rule.** Never pair a heavy border with a broad shadow. Choose tonal separation or restrained elevation.

## 5. Components

### Buttons
- **Shape:** full pill for text actions; circular or 12px controls for icon-only actions.
- **Primary:** ink background with white text.
- **Hover / Focus:** subtle tonal shift, visible violet focus ring, and 0.98 press scale.
- **Secondary / Ghost:** violet fill or neutral surface without 3D bottom borders.

### Chips
- **Style:** borderless pale surface with compact sentence-case text.
- **State:** selected chips use ink or violet; inactive chips remain neutral.

### Cards / Containers
- **Corner Style:** softly curved cards (16px) and larger structural panels (24px).
- **Background:** white on cool canvas, or one semantic pastel tint.
- **Shadow Strategy:** surface shadow only when a card is interactive.
- **Border:** 1px maximum, used for controls and dividers rather than decoration.
- **Internal Padding:** 16px mobile, 20-24px desktop.

### Inputs / Fields
- **Style:** cool-gray fill, 12px radius, no thick border.
- **Focus:** white surface with violet outline.
- **Error / Disabled:** red contextual copy; disabled controls retain readable contrast.

### Navigation
- Floating ink dock with white active item. Mobile dock stays above safe area; desktop becomes a vertical floating rail while retaining labels and familiar route order.

### Progress
- Mint fill on a quiet neutral track. State text accompanies color and progress changes remain readable with motion disabled.

## 6. Do's and Don'ts

### Do:
- **Do** expose current state, pending work, and next actions without extra navigation.
- **Do** use violet, mint, and amber as semantic markers.
- **Do** preserve standard touch targets, focus rings, and familiar control behavior.
- **Do** adapt layout structurally between mobile and desktop.

### Don't:
- **Don't** resemble Duolingo through thick 3D button edges, mascot-led hierarchy, saturated rainbow sections, or oversized gamification.
- **Don't** use all-caps labels everywhere.
- **Don't** use gradients as default panel backgrounds.
- **Don't** nest multiple bordered cards or turn every content group into a card.
- **Don't** animate high-frequency controls or introduce decorative looping motion.
