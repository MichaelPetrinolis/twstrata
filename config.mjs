import path from "path";
import chalk from "chalk";
import { pathToFileURL } from "url";
import process from "node:process";

/**
 * @typedef {Object} UserProvidedConfig
 * @property {string} [outDir]            - Destination directory of the created CSS files.
 * @property {string} [tailwindOverrides] - Tailwind imports for creating CSS files.
 * @property {string} [sourceDir]         - Directory of source CSS files.
 * @property {string} [views]             - glob that defines the views.
 * @property {string} [globalCSSName]     - The name of the file that contains global css rules.
 * @property {string} [criticalCSSName]   - The name of the file that contains critical css rules.
 * @property {object} [regexMapOverrides] - An object map to override the default regex per extension.
 */

const isWin = process.platform === "win32";
let pathToFile = path.join(process.cwd(), "twstrata.config.mjs");

/** @type {UserProvidedConfig} */
let userProvidedConfig;

try {
    userProvidedConfig = await import(pathToFileURL(pathToFile).href);

    if (isWin) {
        console.log(chalk.blue("Loading twstrata.config.mjs..."), pathToFileURL(pathToFile).href);
        userProvidedConfig = await import(pathToFileURL(path.join(process.cwd(), "twstrata.config.mjs")).href);
    }
    else {
        console.log(chalk.blue("Loading twstrata.config.mjs..."), pathToFile);
        userProvidedConfig = await import(pathToFile);
    }
} catch (e) {
    console.log(chalk.red("No twstrata.config.mjs file found. Using defaults."));
}


const defaultSourceDir = "tw";
const defaultGlobalCSSName = "theme";
const defaultCriticalCSSName = "critical";
const defaultViewFiles = ["views/**/*.html", "views/**/*.liquid", "views/**/*.cshtml"];
const defaultOutDir = "dist";
const defaultRegexMap = {
    html: /<!--\s*@useCSS:\s*([\w\-./\\]+(?:\.css)?)?\s*-->/i,
    cshtml: /@\*\s*@useCSS:\s*([\w\-./\\]+(?:\.css)?)?\s*\*@/i,
    liquid: /{%\s*comment\s*%}\s*@useCSS:\s*([\w\-.\/\\]+(?:\.css)?)?\s*{%\s*endcomment\s*%}/i,
};

let regexMap = null;

export default function getConfig(key) {
    switch (key) {
        case "regexMap":
            if (!regexMap) {
                regexMap = defaultRegexMap;
                if (typeof userProvidedConfig?.regexMapOverrides !== "object") {
                    console.log(chalk.yellow("build.config.mjs did not provide the regexMapOverrides object. Using defaults."));
                } else {
                    console.log(chalk.green("build.config.mjs provided a valid regexMapOverrides object. Merging with defaults."));
                    regexMap = { ...defaultRegexMap, ...userProvidedConfig.regexMapOverrides };
                }
            }
            return regexMap;
        case "sourceDir":
            if (!userProvidedConfig?.sourceDir) {
                console.log(chalk.yellow(`build.config.mjs did not provide sources. Using default of '${defaultSourceDir}'`));
                return defaultSourceDir
            }
            return userProvidedConfig.sourceDir;
        case "views":
            if (!userProvidedConfig?.views) {
                console.log(chalk.yellow(`build.config.mjs did not provide views. Using default of '${defaultViewFiles}'`));
                return defaultViewFiles
            }
            if (typeof userProvidedConfig.views === "string") {
                return [userProvidedConfig.views];
            }
            return userProvidedConfig.views;
        case "outDir":
            if (!userProvidedConfig?.outDir) {
                console.log(chalk.yellow(`build.config.mjs did not provide outDir. Using default of '${defaultOutDir}'`));
                return defaultOutDir
            }
            return userProvidedConfig.outDir;
        case "globalCSSName":
            if (!userProvidedConfig?.globalCSSName) {
                console.log(chalk.yellow(`build.config.mjs did not provide a globalCSSName. Using default of '${defaultGlobalCSSName}'`));
                return defaultGlobalCSSName;
            }
            return userProvidedConfig.globalCSSName;
        case "criticalCSSName":
            if (!userProvidedConfig?.criticalCSSName) {
                console.log(chalk.yellow(`build.config.mjs did not provide a criticalCSSName. Using default of '${defaultCriticalCSSName}'`));
                return defaultCriticalCSSName;
            }
            return userProvidedConfig.criticalCSSName;
    }
    console.log(chalk.yellow("Key not found in build.config.mjs"), key);
    return;
}
