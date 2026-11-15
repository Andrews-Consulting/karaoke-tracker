// Steps for Tonight's set rows (Design B, R49): the swipe that reveals a
// row's Park and Remove.
import { expect } from '@playwright/test';

// Swipes a row of tonight's set (a locator for its <li>) to the left until its
// actions show. The pointer starts on the row's title, clear of the drag
// handle at the left edge and of the actions at the right.
export async function swipeOpen(page, row) {
  const box = await row.locator('.after-main').boundingBox();
  const y = box.y + box.height / 2;
  const x = box.x + box.width * 0.45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 40, y, { steps: 4 });
  await page.mouse.move(x - 180, y, { steps: 6 });
  await page.mouse.up();
  await expect(row).toHaveClass(/\bopen\b/);
}

// Swipes an open row back to the right, hiding its actions. The start point
// is just right of the handle, clear of the actions at the row's end.
export async function swipeClosed(page, row) {
  const box = await row.boundingBox();
  const y = box.y + box.height / 2;
  const x = box.x + 70;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 4 });
  await page.mouse.move(x + 180, y, { steps: 6 });
  await page.mouse.up();
  await expect(row).not.toHaveClass(/\bopen\b/);
}
