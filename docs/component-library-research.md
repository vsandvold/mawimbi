# Component Library Research for Mobile Music App UI

Research into React component libraries suitable for building mobile-native UI patterns (bottom sheets, playback toolbar, segmented controls, settings pages) for Mawimbi.

## Current Stack: Ant Design 5

**Relevant components:** `Drawer` (bottom placement), `Segmented`, `List`, `Switch`, `Slider`

**Strengths:**
- Already integrated — zero migration cost
- Good `Segmented` control out of the box
- CSS-in-JS theming with design tokens via `ConfigProvider` + `theme.darkAlgorithm`

**Weaknesses:**
- Desktop-first philosophy — components don't feel native on mobile
- Bottom `Drawer` is a basic overlay: no swipe gestures, no snap points
- Heavy bundle size (~200KB+ min+gzip for common components)
- Achieving a music-app aesthetic requires significant custom CSS overrides

---

## Candidates

### 1. shadcn/ui + Vaul

**Bottom sheet:** Built on [Vaul](https://github.com/emilkowalski/vaul) — snap points, swipe-to-dismiss, physics-based animations, iOS-style behavior. Best-in-class.

**Segmented control:** No built-in component; style `Tabs` (Radix-based) with Tailwind, or build custom.

**Theming:** CSS variables-based dark/light mode.

| Pros | Cons |
|---|---|
| Best bottom sheet via Vaul (used by Linear, Vercel) | Requires adding Tailwind CSS to the project |
| Smallest bundle — copy only components you use | No pre-built List or SegmentedControl |
| Full customizability — you own the source code | More assembly required for complex patterns |
| Radix UI primitives provide excellent accessibility | Manual updates when upstream changes |
| Very active community; shadcn/cli v4 (March 2026) | Learning curve for Tailwind |

### 2. MUI 6

**Bottom sheet:** `SwipeableDrawer` with `anchor="bottom"` — has swipe gestures and a "puller" handle pattern.

**Segmented control:** `ToggleButtonGroup` serves as segmented control.

**Theming:** `createTheme` with `palette.mode: 'dark'`.

| Pros | Cons |
|---|---|
| `SwipeableDrawer` is the best built-in bottom sheet among traditional libraries | Largest bundle size (~80KB+ gzip for core) |
| Most comprehensive pre-built component set | Material Design aesthetic may feel too "Google" |
| Excellent `List`, `AppBar`, `Slider`, `ToggleButtonGroup` | No true snap points on SwipeableDrawer (unlike Vaul) |
| Massive community (97K+ GitHub stars) | CSS-in-JS (Emotion) runtime overhead |

### 3. Mantine 7 (+ mantine-vaul)

**Bottom sheet:** Core `Drawer` is basic; [mantine-vaul](https://github.com/AndrejNemec/mantine-vaul) community package adds swipe and snap points with `ResponsiveDialog` (bottom sheet on mobile, modal on desktop).

**Segmented control:** First-class [`SegmentedControl`](https://mantine.dev/core/segmented-control/) with animated indicator. Best built-in segmented control of any library.

**Theming:** `MantineProvider` with `defaultColorScheme="dark"` — CSS variables-based, all components auto-adapt.

| Pros | Cons |
|---|---|
| Best built-in `SegmentedControl` (animated, dark-theme aware) | Core Drawer lacks swipe gestures (need community package) |
| CSS modules — better performance than CSS-in-JS runtime | `mantine-vaul` is community-maintained, not official |
| `Drawer.Stack` for managing multiple drawers | Smaller community (~27K GitHub stars) |
| Excellent `Slider` with `onChangeEnd` | No pre-built List component with rich item layouts |
| `@mantine/hooks` utility library | Self-described as "more desktop-oriented" |

### 4. Chakra UI v3

**Bottom sheet:** `Drawer` with `placement="bottom"` — basic, no swipe gestures.

**Segmented control:** Native `SegmentedControl` component (radio-based).

**Theming:** Semantic tokens auto-adapt to light/dark; uses `next-themes`.

| Pros | Cons |
|---|---|
| Built-in `SegmentedControl` | v3 rewrite — ecosystem still catching up |
| Semantic color tokens that auto-adapt | Drawer has no swipe gestures or snap points |
| Removed framer-motion dependency in v3 | Smaller community than MUI |
| Built on Ark UI headless components | Less enterprise-proven |

### 5. Ant Design Mobile 5

**Bottom sheet:** [`FloatingPanel`](https://mobile.ant.design/components/floating-panel/) with snap points — the closest native bottom sheet in any React component library.

**Segmented control:** Available but less polished than Mantine's.

**Theming:** CSS variables-based.

| Pros | Cons |
|---|---|
| Purpose-built for mobile; FloatingPanel has snap points | Separate library from antd (different API) |
| Same design language as current Ant Design | Dual-library maintenance |
| `ActionSheet`, `Popup`, `Picker` — mobile-native patterns | Primarily Chinese-speaking community |
| Lowest migration cost (same ecosystem) | Smaller ecosystem than core antd |

---

## Comparison Matrix

| Criteria | Ant Design 5 | shadcn/ui + Vaul | MUI 6 | Mantine 7 | Chakra v3 | antd-mobile 5 |
|---|---|---|---|---|---|---|
| **Mobile-first feel** | Poor | Good | Fair | Fair | Fair | Excellent |
| **Bottom sheet quality** | Basic | Excellent | Good | Fair (+vaul) | Basic | Excellent |
| **Segmented control** | Good | Build custom | Good | Excellent | Good | Good |
| **Dark theming** | Good | Good | Good | Good | Good | Good |
| **Bundle size** | Heavy | Minimal | Heaviest | Medium | Medium | Light |
| **Customizability** | Moderate | Full | Moderate | Good | Good | Moderate |
| **React 19** | Yes | Yes | Yes | Yes | Yes | Yes |
| **Migration cost** | None | High (Tailwind) | High | High | High | Medium |
| **List components** | Good | None | Excellent | Basic | Basic | Good |

---

## Recommendations

Ranked by fit for a mobile-native music app:

1. **shadcn/ui + Vaul** — Best bottom sheet (snap points, swipe, physics), smallest bundle, full design control. Main cost: adding Tailwind CSS and building some components from primitives.

2. **Mantine 7 + mantine-vaul** — Best built-in SegmentedControl, good Slider with `onChangeEnd`, responsive bottom sheet via community package. No Tailwind requirement.

3. **Ant Design 5 + antd-mobile 5** — Lowest migration cost by staying in the Ant ecosystem. FloatingPanel provides real snap points. Trade-off: dual-library maintenance.

4. **MUI 6** — Most complete pre-built components with a reasonable SwipeableDrawer. Material Design aesthetic and bundle size are drawbacks for a branded music app.

---

## Standalone Bottom Sheet Libraries

If keeping the current component library and only adding a mobile bottom sheet:

- **[Vaul](https://github.com/emilkowalski/vaul)** — Standalone drawer with snap points, swipe, iOS-style animations. Works with any UI library.
- **[react-modal-sheet](https://www.npmjs.com/package/react-modal-sheet)** — Purpose-built bottom sheet with virtual keyboard avoidance and React Aria integration.
- **[React Aria gesture-driven sheet](https://react-spectrum.adobe.com/react-aria/examples/framer-modal-sheet.html)** — Headless, accessible sheet example using Motion.

---

## Sources

- [shadcn/ui Docs](https://ui.shadcn.com/)
- [Vaul (Emil Kowalski)](https://github.com/emilkowalski/vaul)
- [MUI SwipeableDrawer](https://mui.com/material-ui/react-drawer/)
- [Mantine SegmentedControl](https://mantine.dev/core/segmented-control/)
- [Mantine Drawer](https://mantine.dev/core/drawer/)
- [mantine-vaul](https://github.com/AndrejNemec/mantine-vaul)
- [Ant Design Mobile FloatingPanel](https://mobile.ant.design/components/floating-panel/)
- [Chakra UI v3](https://chakra-ui.com/blog/announcing-v3)
- [react-modal-sheet](https://www.npmjs.com/package/react-modal-sheet)
- [React Aria Sheet Example](https://react-spectrum.adobe.com/react-aria/examples/framer-modal-sheet.html)
