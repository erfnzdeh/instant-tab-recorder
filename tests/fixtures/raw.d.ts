// Vite `?raw` imports used to load HTML fixtures in browser tests
declare module '*.html?raw' {
    const content: string
    export default content
}
