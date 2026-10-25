import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs'
import path from 'path'
import { build, defineConfig, type Plugin } from 'vite'
import { customElementsManifestCheckPlugin } from './scripts/check_custom_elements_manifest.ts'

const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf-8'))
const manifestPath = path.resolve(import.meta.dirname, 'extension/manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

if (manifest.version !== pkg.version) {
    manifest.version = pkg.version
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 4) + '\n')
    console.log(`Updated manifest.json version to ${pkg.version}`)
}

const envName = process.env.ENV_NAME === 'production' ? 'production' : 'develop'
console.log(`${envName} build`)

const sentryDSN = process.env.SENTRY_DSN
if (!sentryDSN) {
    console.warn('WARNING: SENTRY_DSN environment variable is not set. Sentry error reporting will be disabled.')
}

function appendModelLicensesPlugin(): Plugin {
    return {
        name: 'append-model-licenses',
        closeBundle() {
            const licenseFile = path.resolve(import.meta.dirname, 'extension/dist/dependencies-licenses.md')
            const modelLicensesFile = path.resolve(import.meta.dirname, 'licenses/models-licenses.md')
            if (existsSync(licenseFile) && existsSync(modelLicensesFile)) {
                const modelLicenses = readFileSync(modelLicensesFile, 'utf-8')
                appendFileSync(licenseFile, '\n' + modelLicenses)
                console.log('Appended model licenses to dependencies-licenses.md')
            }
        },
    }
}

/**
 * Content scripts cannot import ES module chunks and run as classic scripts, where top-level
 * declarations would leak into the page (the MAIN-world hook shares Meet's global scope). Build each
 * one separately as a self-contained IIFE after the main bundle.
 */
const contentScripts = {
    meet_track_hook: 'src/meet/entry_track_hook.ts',
    meet_content: 'src/meet/entry_content.ts',
}
function contentScriptsPlugin(mode: string): Plugin {
    let isWatch = false
    return {
        name: 'content-scripts',
        apply: 'build',
        configResolved(config) {
            isWatch = config.build.watch != null
        },
        buildStart() {
            for (const entry of Object.values(contentScripts))
                this.addWatchFile(path.resolve(import.meta.dirname, entry))
        },
        async closeBundle() {
            for (const [name, entry] of Object.entries(contentScripts)) {
                await build({
                    configFile: false,
                    logLevel: isWatch ? 'warn' : 'info',
                    build: {
                        outDir: 'extension/dist',
                        emptyOutDir: false,
                        lib: {
                            entry: path.resolve(import.meta.dirname, entry),
                            formats: ['iife'],
                            name: `__instantTabRecorder_${name}`,
                            fileName: () => `${name}.js`,
                        },
                        sourcemap: !!process.env.SOURCEMAP,
                        minify: mode === 'production',
                        target: 'chrome140',
                    },
                })
            }
        },
    }
}

export default defineConfig(({ mode }) => ({
    base: '/dist/',
    plugins: [customElementsManifestCheckPlugin(), appendModelLicensesPlugin(), contentScriptsPlugin(mode)],
    build: {
        outDir: 'extension/dist',
        emptyOutDir: true,
        rolldownOptions: {
            input: {
                offscreen: path.resolve(import.meta.dirname, 'src/offscreen.ts'),
                option: path.resolve(import.meta.dirname, 'src/option.ts'),
                service_worker: path.resolve(import.meta.dirname, 'src/service_worker.ts'),
                transcription_worker: path.resolve(import.meta.dirname, 'src/transcription/worker.ts'),
                summary_worker: path.resolve(import.meta.dirname, 'src/summary/worker.ts'),
                player: path.resolve(import.meta.dirname, 'src/player.ts'),
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: '[name]-[hash].js',
                codeSplitting: {
                    minSize: 20000,
                    groups: [
                        {
                            name: 'vendor-mediabunny',
                            test: /node_modules[\\/]mediabunny/,
                            priority: 20,
                        },
                        {
                            name: 'vendor-mediabunny-flac-encoder',
                            test: /node_modules[\\/]@mediabunny[\\/]flac-encoder/,
                            priority: 10,
                        },
                    ],
                },
            },
        },
        sourcemap: !!process.env.SOURCEMAP,
        minify: mode === 'production',
        target: 'chrome140',
        license: { fileName: 'dependencies-licenses.md' },
    },
    define: {
        'process.env.PKG_NAME': JSON.stringify(pkg.name),
        'process.env.VERSION': JSON.stringify(pkg.version),
        'process.env.ENV_NAME': JSON.stringify(envName),
        'process.env.SENTRY_DSN': JSON.stringify(sentryDSN),
    },
}))
