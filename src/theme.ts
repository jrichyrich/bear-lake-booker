import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Generates a temporary Chrome extension that applies a theme to the browser window.
 * Returns the Playwright launch arguments required to load the extension.
 */
export function getThemeArgs(identifier: string | undefined): string[] {
    if (!identifier) return [];

    let colorInfo: { frame: number[], toolbar: number[], text: number[] } | undefined;

    const acc = identifier.toLowerCase();
    if (acc.includes('jason') || acc.includes('jrichards')) {
        colorInfo = {
            frame: [33, 150, 243], // Blue #2196F3
            toolbar: [144, 202, 249], // Lighter Blue
            text: [0, 0, 0]
        };
    } else if (acc.includes('lisa') || acc.includes('lrichards')) {
        colorInfo = {
            frame: [233, 30, 99], // Pink #E91E63
            toolbar: [248, 187, 208], // Lighter Pink
            text: [0, 0, 0]
        };
    }

    if (!colorInfo) return [];

    const tmpdir = os.tmpdir();
    const themeName = (acc.includes('jason') || acc.includes('jrichards')) ? 'blue' : 'pink';
    const themeFolder = path.join(tmpdir, `bear-lake-theme-${themeName}`);

    fs.mkdirSync(themeFolder, { recursive: true });

    const manifest = {
        manifest_version: 3,
        version: "1.0",
        name: `Theme ${themeName}`,
        theme: {
            colors: {
                frame: colorInfo.frame,
                toolbar: colorInfo.toolbar,
                tab_text: colorInfo.text,
                tab_background_text: [255, 255, 255],
                bookmark_text: [255, 255, 255]
            }
        }
    };

    fs.writeFileSync(path.join(themeFolder, 'manifest.json'), JSON.stringify(manifest, null, 2));

    return [
        `--disable-extensions-except=${themeFolder}`,
        `--load-extension=${themeFolder}`
    ];
}
