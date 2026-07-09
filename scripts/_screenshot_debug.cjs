const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.leaflet-container', { timeout: 15000 });
  await page.waitForTimeout(4000);

  const sample = async () => {
    return page.evaluate(() => {
      const state = window.__store.getState();
      const trains = Array.isArray(state.trains) ? state.trains : Object.values(state.trains);
      // Grab a few trains with a defined currentLocation, some info to
      // identify them across ticks.
      return trains
        .filter((t) => t.currentLocation && t.currentLocation[0])
        .slice(0, 5)
        .map((t) => ({
          line: t.line,
          dest: t.destinationName,
          currentTime: t.currentTime,
          loc: t.currentLocation,
          nextStop: (t.points.find((p) => p.timeToStation > t.currentTime) || {}).stationName,
        }));
    });
  };

  for (let i = 0; i < 6; i++) {
    const sampleData = await sample();
    console.log(`--- t=${i * 5}s ---`);
    console.log(JSON.stringify(sampleData, null, 2));
    await page.waitForTimeout(5000);
  }

  await browser.close();
})();
