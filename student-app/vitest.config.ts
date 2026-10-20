// The app's plain-logic tests (src/lib/*.test.ts), with the CRM's vitest:
// from the CRM folder, npx vitest run --root student-app
// Vite's own TypeScript step cannot follow the app's tsconfig ("extends":
// "expo/tsconfig.base"), so TypeScript itself strips the types here.
import ts from 'typescript'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  oxc: false,
  plugins: [
    {
      name: 'strip-types',
      transform(code, id) {
        if (!/\.tsx?$/.test(id)) return null
        const out = ts.transpileModule(code, {
          fileName: id,
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, sourceMap: true },
        })
        return { code: out.outputText, map: out.sourceMapText }
      },
    },
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
