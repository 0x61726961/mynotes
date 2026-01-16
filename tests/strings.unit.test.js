/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

describe('App strings', () => {
  test('login hint uses a relative asset path', () => {
    const stringsScript = fs.readFileSync(
      path.join(__dirname, '../public/js/strings.js'),
      'utf8'
    );

    const appStrings = new Function('window', `${stringsScript}; return window.AppStrings;`)(window);

    expect(appStrings?.login?.hintHtml).toContain('assets/beandog.png');
    expect(appStrings?.login?.hintHtml).not.toContain('src="/assets/');
  });
});
