#!/usr/bin/env node
// This script is used to build CSS files based on the source files and their references.
// It uses PostCSS with Tailwind CSS and Autoprefixer to process the CSS files.
import parseArgs from "minimist";
import path from "path";
import chalk from "chalk";
import fg from "fast-glob";
import fs from "fs/promises";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import prettyMilliseconds from 'pretty-ms';
import watch from "node-watch";
import * as fsSync from "fs";

import config from "./config.mjs";
const __workDir = process.cwd();

let parsedArgs = parseArgs(process.argv.slice(2));

let task = parsedArgs._[0];

const regexMap = config('regexMap');
const sourceDir = config('sourceDir');
const views = config('views');
const outDir = config('outDir');
const globalCSSName = path.basename(config('globalCSSName'), '.css');
const criticalCSSName = path.basename(config('criticalCSSName'), '.css');

console.log(chalk.green("Source dir: ", sourceDir));
console.log(chalk.green("View files: ", views));

let filesMap = {};

if (task === "watch") {
    console.log(chalk.green("Starting watch mode..."));

    // Resolve globs in views to actual file paths
    const resolvedViewFiles = await fg(views, { onlyFiles: true });

    // Watch directories and resolved files
    watch([sourceDir, ...resolvedViewFiles], { recursive: true }, async (eventType, filePath) => {
        if (eventType === "update") {
            console.log(`File updated: ${filePath}`);
        } else if (eventType === "remove") {
            console.log(`File removed: ${filePath}`);
        }
        await buildAll(); // Trigger the build process
    });

    console.log(chalk.green(`Watching for changes in: ${sourceDir} and current view files.`));
    console.log(chalk.bgBlue.white(`If you add any files to the views, you need to restart the watch process.`));
} else if (task === "updateVSCodeSettings") {
    console.log(chalk.green("Updating tailwindCSS VSCode intelisense settings..."));
    await updateVSCodeSettings();
} else {
    if (task != "build" && task != undefined) {
        console.warn(chalk.red("Unknown command: " + task));
        process.exit(1);
    }
    console.log(chalk.green("Running build command..."));
    // Run the build process for non-watch tasks
    await buildAll();
}

// Reusable function to perform the entire build process
async function buildAll() {
    const startTime = performance.now();

    filesMap = await getFileMap();

    if (!filesMap[criticalCSSName]) {
        filesMap[criticalCSSName] = [];
    }

    if (!filesMap[globalCSSName]) {
        console.warn(chalk.red(`Global CSS '${globalCSSName}' not found in map.`));
        process.exit(1);
    }

    if (Object.keys(filesMap).length > 0) {

        const generatedCriticalCSS = await generateCSSContents(criticalCSSName);
        const generatedGlobalCSS = await generateCSSContents(globalCSSName);

        const criticalRoot = postcss.parse(generatedCriticalCSS.css);
        const globalRoot = postcss.parse(generatedGlobalCSS.css);

        const criticalPaths = aggregateRulePaths(generatedCriticalCSS.root);
        removeDuplicateRules(globalRoot, criticalPaths);

        const calculatedGlobalRoot = postcss.parse(globalRoot.toString());
        const globalPaths = new Set([...criticalPaths, ...aggregateRulePaths(calculatedGlobalRoot)]);

        await createOutputCSSFile(criticalCSSName, criticalRoot.toString());
        await createOutputCSSFile(globalCSSName, globalRoot.toString());

        for (const key in filesMap) {
            if (key === globalCSSName || key === criticalCSSName) {
                continue;
            }
            const generatedCSS = await generateCSSContents(key);
            const root = postcss.parse(generatedCSS.css);
            removeDuplicateRules(root, globalPaths);

            if (generatedCSS) {
                await createOutputCSSFile(key, root.toString());
            }
        }

    } else {
        console.error(chalk.red("No files to process."));
    }

    const endTime = performance.now();
    console.log(chalk.green("Build time: ", prettyMilliseconds(endTime - startTime))); // TODO: display in minutes or hours if it's a long build
}

async function getFileMap() {
    console.log(chalk.blue("Loading fileMap..."));
    console.log(chalk.blue("Views: ", views));

    const filesMap = {
        [globalCSSName]: [],
        [criticalCSSName]: [],
    };

    const sources = path.normalize(path.join(process.cwd(), sourceDir));

    try {
        if ((await fs.stat(sources)).isDirectory) {
            try {
                var files = await fs.readdir(sources);
                files.forEach((file) => {
                    if (path.extname(file) === ".css") {
                        if (file === globalCSSName || file === criticalCSSName) return;
                        const fileName = path.basename(file, '.css');
                        if (fileName !== globalCSSName && fileName !== criticalCSSName) {
                            filesMap[fileName] = [];
                        }
                    }
                });
            }
            catch (err) {
                console.error(chalk.red(`Error reading source directory: ${sources}`), err);
                process.exit(1);
            }
        }
    } catch (err) {
    }

    const viewFiles = await fg(views, { onlyFiles: true });

    // Process each file to find custom CSS references
    await Promise.all(
        viewFiles.map(async (file) => {
            const fileExt = path.extname(file).slice(1);

            const regex = regexMap[fileExt];
            if (!regex) {
                console.error(`Unsupported file type: ${fileExt}`);
                return;
            }

            try {
                const fileContent = await fs.readFile(file, "utf-8");
                let sourceFile = null;

                const match = fileContent.match(regex);
                if (match) {
                    sourceFile = match[1];
                }

                if (!sourceFile) {
                    sourceFile = globalCSSName;
                }

                sourceFile = path.basename(sourceFile, '.css');
                const currentViews = filesMap[sourceFile] || [];
                currentViews.push(path.normalize(path.join(process.cwd(), file)));
                filesMap[sourceFile] = currentViews;
            } catch (err) {
                console.error(`Error reading file ${file}:`, err);
            }
        })
    );

    if (Object.keys(filesMap).length === 0) {
        console.log(chalk.red("No fileMap in the configuration"));
    }


    await Promise.all(Object.keys(filesMap).map(async (key) => {
        const sourceCSSPath = path.normalize(path.join(sourceDir, key + ".css"));
        await createSourceCSSFileIfNotExist(sourceCSSPath);
    }));

    return filesMap;
}

async function createSourceCSSFileIfNotExist(filePath) {
    try {
        if (!await fs.stat(filePath).then(() => true).catch(() => false)) {
            console.log(chalk.yellow(`File ${filePath} does not exist. Creating a new one.`));
            await fs.mkdir(path.dirname(filePath), { recursive: true });

            let fileContent = '@import "tailwindcss" source(none);\r\n';
            let cssName = path.basename(filePath, '.css');

            if (cssName === globalCSSName) {
                fileContent += `@reference "./${criticalCSSName}.css";\r\n`;
            } else if (path.basename(filePath, '.css') != criticalCSSName) {
                fileContent += `@reference "./${globalCSSName}.css";\r\n`;
            }

            await fs.writeFile(filePath, fileContent, "utf-8");
        }
    } catch (err) {
        console.error(chalk.red(`Error creating source file: ${filePath}`), err);
        throw err;
    }
}

async function generateCSSContents(cssFile) {
    const sourceFiles = filesMap[cssFile];

    if (!sourceFiles) {
        console.warn(chalk.yellow(`No source files found for ${cssFile}.`));
        return null;
    }

    console.log(chalk.blue(`Processing ${cssFile} CSS, with ${sourceFiles?.length === 0 ? 'no sources' : 'sources: ' + sourceFiles.join(' , ')}`));

    const sourceCSSPath = path.normalize(path.join(sourceDir, cssFile + ".css"));

    const inputCSS = await fs.readFile(sourceCSSPath, "utf-8");

    const inputCSSWithSources = `
${sourceFiles.map((file) => `@source "${file}";`).join("\r\n")}    
${inputCSS}
`;

    try {
        const result = await postcss([tailwindcss, autoprefixer]).process(inputCSSWithSources, { from: sourceCSSPath });

        if (result.warnings().length > 0) {
            console.warn(`Warnings in ${cssFile}:`);
            result.warnings().forEach((warning) => console.warn(warning.toString()));
        }

        console.log(chalk.blue(`${cssFile} CSS generated successfully.`));
        pruneSources(result.root);

        return result;
    } catch (err) {
        console.error(chalk.red(`Error generating ${cssFile} CSS`), err);
        return "";
    }

    function pruneSources(node) {
        if (!node.nodes) return;

        // Recursively prune children first
        node.nodes.slice().forEach(child => {
            pruneSources(child);
        });

        // Now filter out children that are empty or have no declarations
        node.nodes = node.nodes.filter(child => {
            // If it's a rule or at-rule and has no nodes, remove it
            if (child.type === 'atrule' && (child.name == "source")) {
                return false;
            }
            return true; // keep everything else (e.g., comment, decl, etc.)
        });

        // After filtering, if this node (rule or atrule) is empty too, remove it from its parent
        if ((node.type === 'atrule') && (node.name == "source")) {
            if (node.parent) {
                node.remove(); // remove from its parent
            }
        }
    }

}

async function createOutputCSSFile(cssFile, css) {
    const outputPath = path.join(outDir, path.normalize(cssFile + ".css"));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, css, "utf-8");
    console.log(chalk.green(`Generated CSS file: ${outputPath}`));
    return outputPath;
}

/**
 * Recursively build a full path string for a given declaration node
 * Includes nested selectors and at-rules (e.g., @media)
 */
function buildFullPath(decl) {
    const parts = [`${decl.prop}:${decl.value}`];
    let current = decl.parent;

    while (current) {
        if (current.type === 'rule') {
            parts.unshift(current.selector);
        } else if (current.type === 'atrule') {
            parts.unshift(`@${current.name} ${current.params}`);
        }
        current = current.parent;
    }

    return parts.join(' > ');
}

/**
 * Collect all leaf declaration full paths from a CSS root
 */
function aggregateRulePaths(root) {
    const paths = new Set();
    root.walkDecls(decl => {
        const fullPath = buildFullPath(decl);
        paths.add(fullPath);
    });
    return paths;
}

/**
 * Remove declarations in targetRoot that match any path in layoutPaths
 * Clean up empty rules and at-rules recursively
 */
function removeDuplicateRules(targetRoot, layoutPaths) {
    targetRoot.walkDecls(decl => {
        const path = buildFullPath(decl);
        if (layoutPaths.has(path)) {
            decl.remove();
        }
    });

    // Recursively clean up empty rules/at-rules
    function pruneEmpty(node) {
        if (!node.nodes) return;

        // Recursively prune children first
        node.nodes.slice().forEach(child => {
            pruneEmpty(child);
        });

        // Now filter out children that are empty or have no declarations
        node.nodes = node.nodes.filter(child => {
            // If it's a rule or at-rule and has no nodes, remove it
            if ((child.type === 'rule' || child.type === 'atrule') && (!child.nodes || child.nodes.length === 0)) {
                return false;
            }
            return true; // keep everything else (e.g., comment, decl, etc.)
        });

        // After filtering, if this node (rule or atrule) is empty too, remove it from its parent
        if ((node.type === 'rule' || node.type === 'atrule') && (!node.nodes || node.nodes.length === 0)) {
            if (node.parent) {
                node.remove(); // remove from its parent
            }
        }
    }

    // Start pruning from the root
    pruneEmpty(targetRoot);
}

// Persist a JSON object into .vscode/.settings in the nearest parent directory
async function updateVSCodeSettings() {
    let dir = process.cwd();
    const root = path.parse(dir).root;
    let found = false;
    let settingsPath = null;
    let settings = null;
    const sourceDir = config('sourceDir');

    while (true) {
        const vscodeDir = path.join(dir, ".vscode");
        settingsPath = path.join(vscodeDir, "settings.json");
        if (fsSync.existsSync(vscodeDir)) {
            found = true;
        }
        if (dir === root || found) break;
        dir = path.dirname(dir);
    }
    if (!found) {
        settings = {};
        const vscodeDir = path.join(process.cwd(), ".vscode");
        await fs.mkdir(vscodeDir, { recursive: true });
        settingsPath = path.join(vscodeDir, "settings.json");
    } else {
        try {
            settings = JSON.parse(await fs.readFile(settingsPath, "utf-8"));
        } catch (err) {
            console.error(chalk.red(`Error reading settings file: ${settingsPath}`), err);
            process.exit(1);
        }
    }

    // If not found, create in current working directory
    filesMap = await getFileMap();

    const configFile = {};
    Object.keys(filesMap).forEach(key => {
        const relativePath = path.dirname(path.dirname(settingsPath));
        const absoluteCssPath = path.normalize((path.join(__workDir, sourceDir, path.basename(key) + ".css")));
        const cssFile = `${path.relative(relativePath, absoluteCssPath)}`.replaceAll(path.win32.sep, path.posix.sep);
        let views = filesMap[key];

        if (Array.isArray(views) && views.length > 0) {
            views = filesMap[key].map(file => {
                let filePath = file.replaceAll(path.win32.sep, path.posix.sep);
                filePath = path.normalize(path.join(path.relative(relativePath, file)));
                return filePath.replaceAll(path.win32.sep, path.posix.sep);
            });
        } else {
            views = [];
        }

        configFile[cssFile] = [cssFile, ...views];
    });

    const configuration = {
        ["tailwindCSS.experimental.configFile"]: configFile
    };

    Object.assign(settings, configuration);
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 4), "utf-8");
    console.log(chalk.green(`Updated settings file: ${settingsPath}`));
}