const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto('http://localhost:3000/para-academias', { waitUntil: 'networkidle' });
  await p.locator('button', { hasText: 'Semestral' }).click();
  await p.waitForTimeout(400);
  await p.locator('#pricing-title').locator('xpath=..').locator('..').screenshot({ path: 'C:/Users/salas/AppData/Local/Temp/qa3-academias-semi.png' });
  await p.locator('button', { hasText: 'Anual' }).click();
  await p.waitForTimeout(400);
  await p.locator('#pricing-title').locator('xpath=..').locator('..').screenshot({ path: 'C:/Users/salas/AppData/Local/Temp/qa3-academias-anual.png' });
  await b.close();
  console.log('ok');
})();
