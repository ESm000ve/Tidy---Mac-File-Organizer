# Tidy for macOS · Design system

[Open the Figma portfolio board](https://www.figma.com/design/F4cJIG7cCiURqp30nqszk9/Tidy-Product-Design-System?node-id=47-217) · [Read the product design case study](case-study.md)

The macOS system follows the Windows library’s progression from foundations and reusable controls to workflow patterns, accessibility, and handoff. The editable file contains SF Pro text styles, Light and Dark semantic color variables, and component families for actions, fields, folder and rule cards, preview rows, dialogs, and feedback.

The Figma file is in Ariana’s Team and may require access. The portfolio board separates the reusable design proposal from the implemented palette. The app’s CSS and components are the source for current behavior.

## Implemented appearance

| Role | CSS token | Light | Dark |
| --- | --- | --- | --- |
| Window | `--background` | `#F5F5F7` | `#202024` |
| Card | `--card` | `#FFFFFF` | `#2C2C31` |
| Control fill | `--control-fill` | `#FFFFFF` | `#3B3B42` |
| Primary text | `--foreground` | `#202024` | `#F5F5F7` |
| Secondary text | `--muted-foreground` | `#5C5C5C` | `#BDBDBD` |
| Accent | `--system-blue` | `#0064CF` | `#83BBFF` |
| Text on accent | `--accent-text` | `#FFFFFF` | `#000000` |
| Focus ring | `--tidy-focus-ring` | `#0064CF` | `#83BBFF` |

## Components and behavior

| Figma area | Implementation | What to check |
| --- | --- | --- |
| Foundations, buttons and fields | [Desktop styles](../src/styles/desktop.css) and [accessibility styles](../src/styles/accessibility.css) | Light and Dark, keyboard focus, disabled states, and reduced motion |
| Folder card and scope | [Locations](../src/app/components/sections/LocationsSection.tsx) and [source choices](../src/app/components/sections/SourceChoices.tsx) | Choose source and destination, then narrow the subfolder and file-type scope |
| AI command and dialog | [AI command bar](../src/app/components/sections/AiCommandBar.tsx) and [AI rule review](../src/app/components/AiRuleReviewDialog.tsx) | Clarify ambiguous instructions and inspect the draft settings before applying them |
| Preview row and feedback | [File preview](../src/app/components/PreviewSheet.tsx) and [run status](../src/app/components/StatusBar.tsx) | Check the destination and match reason, confirm the manual run, and find Undo |

![Tidy’s dark-mode preview showing sample file destinations and match reasons](screenshots/preview.png)

The preview uses synthetic files and redacted paths. The [case study](case-study.md) includes additional app screenshots.
