import type { DiffFile } from "../../core/changeset/model";
import { DEFAULT_FILE_GAP } from "../../core/run/reviewGap";

/** Stream geometry for one file section in the main review pane. */
export interface FileSectionLayout {
  fileId: string;
  sectionIndex: number;
  sectionTop: number;
  headerTop: number;
  bodyTop: number;
  bodyHeight: number;
  sectionBottom: number;
}

/**
 * Return the in-stream header height for one review section.
 *
 * The first file's header is only pinned, unless leading rows precede it: then it renders in the
 * stream after them so the leading text is not read as part of that file.
 */
export function getInStreamFileHeaderHeight(sectionIndex: number, hasLeadingRows = false) {
  return sectionIndex === 0 && !hasLeadingRows ? 0 : 1;
}

/** Build the in-stream header heights for the current review stream. */
export function buildInStreamFileHeaderHeights(files: DiffFile[], hasLeadingRows = false) {
  return files.map((_, index) => getInStreamFileHeaderHeight(index, hasLeadingRows));
}

/**
 * Build absolute section offsets from file order, header heights, measured body heights, and file gap.
 *
 * `leadingHeight` reserves rows ahead of the first section for stream content that scrolls with
 * the files, such as a commit message.
 */
export function buildFileSectionLayouts(
  files: DiffFile[],
  bodyHeights: number[],
  headerHeights?: number[],
  fileGap = DEFAULT_FILE_GAP,
  leadingHeight = 0,
) {
  const layouts: FileSectionLayout[] = [];
  let cursor = Math.max(0, leadingHeight);

  files.forEach((file, index) => {
    // Leading rows form a section of their own, so the first file gets the usual separator.
    const separatorHeight = index > 0 || leadingHeight > 0 ? Math.max(0, fileGap) : 0;
    const headerHeight = Math.max(
      0,
      headerHeights?.[index] ?? getInStreamFileHeaderHeight(index, leadingHeight > 0),
    );
    const bodyHeight = Math.max(0, bodyHeights[index] ?? 0);
    const sectionTop = cursor;
    const headerTop = sectionTop + separatorHeight;
    const bodyTop = headerTop + headerHeight;
    const sectionBottom = bodyTop + bodyHeight;

    layouts.push({
      fileId: file.id,
      sectionIndex: index,
      sectionTop,
      headerTop,
      bodyTop,
      bodyHeight,
      sectionBottom,
    });

    cursor = sectionBottom;
  });

  return layouts;
}

/** Find the file section covering one absolute review-stream row. */
export function findFileSectionAtOffset(fileSectionLayouts: FileSectionLayout[], offset: number) {
  if (fileSectionLayouts.length === 0) {
    return null;
  }

  const firstSection = fileSectionLayouts[0]!;
  const lastSection = fileSectionLayouts[fileSectionLayouts.length - 1]!;

  if (offset <= firstSection.sectionTop) {
    return firstSection;
  }

  if (offset >= lastSection.sectionBottom) {
    return lastSection;
  }

  let low = 0;
  let high = fileSectionLayouts.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const layout = fileSectionLayouts[mid]!;

    if (offset < layout.sectionTop) {
      high = mid - 1;
    } else if (offset >= layout.sectionBottom) {
      low = mid + 1;
    } else {
      return layout;
    }
  }

  return lastSection;
}

/** Find the first section whose bottom edge can intersect a range starting at `minY`. */
function findFirstPotentiallyIntersectingSectionIndex(
  fileSectionLayouts: FileSectionLayout[],
  minY: number,
) {
  let low = 0;
  let high = fileSectionLayouts.length - 1;
  let result = fileSectionLayouts.length;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const layout = fileSectionLayouts[mid]!;

    if (layout.sectionBottom >= minY) {
      result = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return result;
}

/** Collect every file section that intersects one absolute review-stream range. */
export function collectIntersectingFileSectionIds(
  fileSectionLayouts: FileSectionLayout[],
  minY: number,
  maxY: number,
) {
  const next = new Set<string>();
  if (fileSectionLayouts.length === 0 || maxY < minY) {
    return next;
  }

  // Layouts are ordered by stream position. Binary-search to the first section that can overlap
  // the range, then only walk the visible/overscan run instead of every file in huge reviews.
  const startIndex = findFirstPotentiallyIntersectingSectionIndex(fileSectionLayouts, minY);
  for (let index = startIndex; index < fileSectionLayouts.length; index += 1) {
    const layout = fileSectionLayouts[index]!;
    if (layout.sectionTop > maxY) {
      break;
    }

    next.add(layout.fileId);
  }

  return next;
}

/** Return the file section that owns the viewport top, switching at each next header row. */
export function findHeaderOwningFileSection(
  fileSectionLayouts: FileSectionLayout[],
  scrollTop: number,
) {
  if (fileSectionLayouts.length === 0) {
    return null;
  }

  // Choose the last header whose top has reached the viewport, so separator rows still belong
  // to the previous section until the next header itself takes over.
  let low = 0;
  let high = fileSectionLayouts.length - 1;
  let winner = 0;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const layout = fileSectionLayouts[mid]!;

    if (layout.headerTop <= scrollTop) {
      winner = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return fileSectionLayouts[winner]!;
}
