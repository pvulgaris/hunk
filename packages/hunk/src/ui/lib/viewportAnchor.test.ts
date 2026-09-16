import { describe, expect, test } from "bun:test";
import { resolveTheme } from "../themes";
import { buildFileSectionLayouts, buildInStreamFileHeaderHeights } from "./fileSectionLayout";
import { measureDiffSectionGeometry } from "../diff/diffSectionGeometry";
import { findViewportRowAnchor, resolveViewportRowAnchorTop } from "./viewportAnchor";
import { createTestDiffFile, lines } from "../../../../../test/helpers/diff-helpers";

describe("viewport row anchors", () => {
  const theme = resolveTheme("github-dark-default", null);

  function createChangedFile() {
    return createTestDiffFile({
      after: lines("const alpha = 2;"),
      before: lines("const alpha = 1;"),
      id: "viewport-anchor",
      path: "viewport-anchor.ts",
    });
  }

  test("honors a preferred stable key when a split change row can map to multiple unified rows", () => {
    const file = createChangedFile();
    const headerHeights = buildInStreamFileHeaderHeights([file]);
    const splitGeometry = measureDiffSectionGeometry(
      file,
      "split",
      false,
      theme,
      [],
      120,
      true,
      false,
    );
    const unifiedGeometry = measureDiffSectionGeometry(
      file,
      "unified",
      false,
      theme,
      [],
      120,
      true,
      false,
    );
    const splitChangeTop = splitGeometry.rowBounds.find((row) => row.key.includes(":change:"))?.top;
    const unifiedDeletionTop = unifiedGeometry.rowBounds.find((row) =>
      row.key.includes(":deletion:"),
    )?.top;
    const unifiedAdditionTop = unifiedGeometry.rowBounds.find((row) =>
      row.key.includes(":addition:"),
    )?.top;

    expect(splitChangeTop).toBeDefined();
    expect(unifiedDeletionTop).toBeDefined();
    expect(unifiedAdditionTop).toBeDefined();

    const deletionAnchor = findViewportRowAnchor(
      [file],
      [unifiedGeometry],
      unifiedDeletionTop!,
      headerHeights,
    );
    const additionAnchor = findViewportRowAnchor(
      [file],
      [unifiedGeometry],
      unifiedAdditionTop!,
      headerHeights,
    );

    const splitAsDeletion = findViewportRowAnchor(
      [file],
      [splitGeometry],
      splitChangeTop!,
      headerHeights,
      deletionAnchor?.stableKey,
    );
    const splitAsAddition = findViewportRowAnchor(
      [file],
      [splitGeometry],
      splitChangeTop!,
      headerHeights,
      additionAnchor?.stableKey,
    );

    expect(splitAsDeletion?.stableKey).toBe(deletionAnchor?.stableKey);
    expect(splitAsAddition?.stableKey).toBe(additionAnchor?.stableKey);
  });

  test("round-trips a unified deletion row through split view without changing the viewport anchor", () => {
    const file = createChangedFile();
    const headerHeights = buildInStreamFileHeaderHeights([file]);
    const splitGeometry = measureDiffSectionGeometry(
      file,
      "split",
      false,
      theme,
      [],
      120,
      true,
      false,
    );
    const unifiedGeometry = measureDiffSectionGeometry(
      file,
      "unified",
      false,
      theme,
      [],
      120,
      true,
      false,
    );
    const unifiedDeletionTop = unifiedGeometry.rowBounds.find((row) =>
      row.key.includes(":deletion:"),
    )?.top;

    expect(unifiedDeletionTop).toBeDefined();

    const unifiedDeletionAnchor = findViewportRowAnchor(
      [file],
      [unifiedGeometry],
      unifiedDeletionTop!,
      headerHeights,
    );

    expect(unifiedDeletionAnchor).not.toBeNull();

    const splitTop = resolveViewportRowAnchorTop(
      [file],
      [splitGeometry],
      unifiedDeletionAnchor!,
      headerHeights,
    );
    const splitAnchor = findViewportRowAnchor(
      [file],
      [splitGeometry],
      splitTop,
      headerHeights,
      unifiedDeletionAnchor?.stableKey,
    );
    const roundTripTop = resolveViewportRowAnchorTop(
      [file],
      [unifiedGeometry],
      splitAnchor!,
      headerHeights,
    );

    expect(roundTripTop).toBe(unifiedDeletionTop!);
  });

  test("offsets anchors by the leading rows ahead of the first section", () => {
    const file = createChangedFile();
    const leadingHeight = 10;
    const headerHeights = buildInStreamFileHeaderHeights([file], true);
    const geometry = measureDiffSectionGeometry(
      file,
      "unified",
      false,
      theme,
      [],
      120,
      true,
      false,
    );
    const deletionTop = geometry.rowBounds.find((row) => row.key.includes(":deletion:"))!.top;
    // Leading rows push the first section down by their height plus its separator and header.
    const bodyTop = buildFileSectionLayouts(
      [file],
      [geometry.bodyHeight],
      headerHeights,
      undefined,
      leadingHeight,
    )[0]!.bodyTop;
    expect(bodyTop).toBe(leadingHeight + 2);

    const anchor = findViewportRowAnchor(
      [file],
      [geometry],
      bodyTop + deletionTop,
      headerHeights,
      undefined,
      undefined,
      leadingHeight,
    );
    expect(anchor).toMatchObject({ fileId: file.id, rowOffsetWithin: 0 });
    expect(anchor?.stableKey).toBe(
      findViewportRowAnchor([file], [geometry], deletionTop, buildInStreamFileHeaderHeights([file]))
        ?.stableKey,
    );
    expect(
      resolveViewportRowAnchorTop(
        [file],
        [geometry],
        anchor!,
        headerHeights,
        undefined,
        leadingHeight,
      ),
    ).toBe(bodyTop + deletionTop);
  });
});
