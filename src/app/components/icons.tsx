/**
 * Central icon set.
 *
 * Every icon in the app is an SF Symbol rendered through `SFIcon`. Wrapping each
 * symbol here — rather than re-declaring a local `makeIcon` helper in every
 * component — gives the app one typed surface for icons, one place to swap the
 * underlying icon library, and consistent accessibility defaults.
 *
 * Icons are decorative by default: callers that use an icon as the only content
 * of a control must pass an explicit `aria-label`.
 */
import type { AriaAttributes, ComponentType } from "react";
import { SFIcon } from "@bradleyhodges/sfsymbols-react";
import type { IconDefinition } from "@bradleyhodges/sfsymbols-types";
import {
  sfArchiveboxFill,
  sfBook,
  sfBrain,
  sfChevronUp,
  sfEar,
  sfHandRaised,
  sfPaintpalette,
  sfPauseFill,
  sfArrowCounterclockwise,
  sfArrowClockwise,
  sfArrowLeftAndRight,
  sfArrowRight,
  sfCalendar,
  sfChartBarFill,
  sfCheckmark,
  sfCheckmarkCircle,
  sfChevronDown,
  sfChevronLeft,
  sfChevronRight,
  sfCircle,
  sfCircleDashed,
  sfClock,
  sfClockFill,
  sfCommand,
  sfDisplay,
  sfDocumentFill,
  sfDocumentOnDocument,
  sfExclamationmarkCircle,
  sfExclamationmarkTriangle,
  sfEyeFill,
  sfFigureStand,
  sfFilmFill,
  sfFolder,
  sfFolderFill,
  sfGearshape,
  sfInfoCircle,
  sfLine3Horizontal,
  sfMagnifyingglass,
  sfMoon,
  sfMusicNote,
  sfMusicNoteList,
  sfPencil,
  sfPhoto,
  sfPhotoFill,
  sfPlayFill,
  sfScroll,
  sfSparkles,
  sfSquareAndArrowUp,
  sfSunMax,
  sfTextDocument,
  sfXmark,
} from "@bradleyhodges/sfsymbols";

/** Props accepted by every icon in this module. */
export interface IconProps {
  /** Tailwind sizing/colour classes. Icons inherit `currentColor`. */
  className?: string;
  /** Set to `true` when the icon is decorative and sits next to a text label. */
  "aria-hidden"?: AriaAttributes["aria-hidden"];
  /** Required when the icon is the only content of an interactive control. */
  "aria-label"?: string;
}

/** A component rendering a single SF Symbol. */
export type Icon = ComponentType<IconProps>;

function createIcon(symbol: IconDefinition, displayName: string): Icon {
  function IconComponent({
    className,
    "aria-hidden": ariaHidden,
    "aria-label": ariaLabel,
  }: IconProps) {
    return (
      <SFIcon
        icon={symbol}
        className={className}
        aria-hidden={ariaHidden ?? !ariaLabel}
        aria-label={ariaLabel}
      />
    );
  }
  IconComponent.displayName = `Icon(${displayName})`;
  return IconComponent;
}

export const Archive = createIcon(sfArchiveboxFill, "Archive");
export const ArrowLeftRight = createIcon(sfArrowLeftAndRight, "ArrowLeftRight");
export const ArrowRight = createIcon(sfArrowRight, "ArrowRight");
export const BarChart = createIcon(sfChartBarFill, "BarChart");
export const Calendar = createIcon(sfCalendar, "Calendar");
export const Check = createIcon(sfCheckmark, "Check");
export const CheckCircle = createIcon(sfCheckmarkCircle, "CheckCircle");
export const ChevronDown = createIcon(sfChevronDown, "ChevronDown");
export const ChevronLeft = createIcon(sfChevronLeft, "ChevronLeft");
export const ChevronRight = createIcon(sfChevronRight, "ChevronRight");
export const Circle = createIcon(sfCircle, "Circle");
export const CircleDashed = createIcon(sfCircleDashed, "CircleDashed");
export const Clock = createIcon(sfClock, "Clock");
export const ClockFill = createIcon(sfClockFill, "ClockFill");
export const Command = createIcon(sfCommand, "Command");
export const Copy = createIcon(sfDocumentOnDocument, "Copy");
export const Display = createIcon(sfDisplay, "Display");
export const Document = createIcon(sfDocumentFill, "Document");
export const DocumentText = createIcon(sfTextDocument, "DocumentText");
export const Eye = createIcon(sfEyeFill, "Eye");
export const Figure = createIcon(sfFigureStand, "Figure");
export const Film = createIcon(sfFilmFill, "Film");
export const Filter = createIcon(sfLine3Horizontal, "Filter");
export const Folder = createIcon(sfFolder, "Folder");
export const FolderFill = createIcon(sfFolderFill, "FolderFill");
export const Info = createIcon(sfInfoCircle, "Info");
export const Moon = createIcon(sfMoon, "Moon");
export const Music = createIcon(sfMusicNote, "Music");
export const MusicList = createIcon(sfMusicNoteList, "MusicList");
export const Pencil = createIcon(sfPencil, "Pencil");
export const Photo = createIcon(sfPhoto, "Photo");
export const PhotoFill = createIcon(sfPhotoFill, "PhotoFill");
export const Play = createIcon(sfPlayFill, "Play");
export const Rotate = createIcon(sfArrowCounterclockwise, "Rotate");
export const Scroll = createIcon(sfScroll, "Scroll");
export const Search = createIcon(sfMagnifyingglass, "Search");
export const Settings = createIcon(sfGearshape, "Settings");
export const Sparkles = createIcon(sfSparkles, "Sparkles");
export const Sun = createIcon(sfSunMax, "Sun");
export const Upload = createIcon(sfSquareAndArrowUp, "Upload");
export const Warning = createIcon(sfExclamationmarkTriangle, "Warning");
export const WarningCircle = createIcon(sfExclamationmarkCircle, "WarningCircle");
export const X = createIcon(sfXmark, "X");
export const BookOpen = createIcon(sfBook, "BookOpen");
export const Brain = createIcon(sfBrain, "Brain");
export const ChevronUp = createIcon(sfChevronUp, "ChevronUp");
export const Ear = createIcon(sfEar, "Ear");
export const Hand = createIcon(sfHandRaised, "Hand");
export const Palette = createIcon(sfPaintpalette, "Palette");
export const Pause = createIcon(sfPauseFill, "Pause");
export const Refresh = createIcon(sfArrowClockwise, "Refresh");
