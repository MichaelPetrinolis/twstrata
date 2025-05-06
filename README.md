# twstrata - Tailwind 4 Strata CSS

This tool helps developing layered css layered in critical, global and multiple component files.

## Getting started

1. create a new folder
2. open with vscode
3. open a terminal window and run `npm i github:MichaelPetrinolis/twstrata`
4. Add a `twstrata.config.mjs` file returning a [`UserProvidedConfig`](#userprovidedconfig-reference) object

```js
export const regexMapOverrides = {
    html: /<!--\s*@useCSS\s*:\s*([\w\-.\/\\]+(?:\.css)?)\s*-->/
}
export const views = ["./views/**/*.html", "./views/**/*.liquid", "./views/**/*.cshtml"];
```

## Usage

1. `npx twstrata build or npx twstrata` builds the css files.
2. `npx twstrata watch` watch the current files for changes.
3. `npx twstrata updateVSCodeSettings` searches for workspace `.vscode/settings.json` file and updates `tailwind.experimental.configFile` setting.

recommended settings for vscode

```json
{
    "[tailwindcss]": {
        "editor.defaultFormatter": "vscode.css-language-features"
    },
    "[liquid]": {
        "editor.defaultFormatter": "vscode.html-language-features"
    },
    "editor.quickSuggestions": {
        "strings": "on"
    },
    "files.associations": {
        "*.css": "tailwindcss"
    },
    "tailwindCSS.experimental.configFile": {
        "example/tw/customcss.css": ["example/tw/customcss.css"],
        "example/tw/componenta.css": ["example/tw/componenta.css","example/views/componentA.cshtml"],
        "example/tw/componentb.css": ["example/tw/componentb.css","example/views/componentB.liquid"],
        "example/tw/critical.css": ["example/tw/critical.css","example/views/header.html"],
        "example/tw/theme.css": ["example/tw/theme.css","example/views/footer.html"]
    }
}
```

## `UserProvidedConfig` Reference

The `UserProvidedConfig` object allows you to customize the generation and handling of CSS files in your project. Each property is optional, providing flexibility depending on your setup.

### Properties

#### `outDir` (optional)

- **Type:** `string`  
- **Description:** Specifies the destination directory where the generated CSS files will be saved.

#### `sourceDir` (optional)

- **Type:** `string`  
- **Description:** Defines the directory where the source CSS files are located. This is the input directory from which CSS will be processed.

#### `views` (optional)

- **Type:** `string`  
- **Description:** A glob pattern that defines the paths to the view templates (e.g., `.html`, `.twig`, `.hbs`, etc.) that reference the CSS classes.

#### `globalCSSName` (optional)

- **Type:** `string`  
- **Description:** The filename for the global CSS rules file. This file typically contains reusable styles that apply across the entire site or application.

#### `criticalCSSName` (optional)

- **Type:** `string`  
- **Description:** The filename for the critical CSS rules file. This file should contain essential styles required for above-the-fold content to optimize page load speed.

#### `criticalCSSOutput` (optional)

- **Type:** `string`  
- **Description:** If defined, the critical css will be saved to the specified file. So for example, you can import the contents of that file inline in your layout.

#### `regexMapOverrides` (optional)

- **Type:** `object`  
- **Description:** An object mapping file extensions to custom regular expressions. This overrides the default regex patterns used to extract class names or other tokens from various file types.
