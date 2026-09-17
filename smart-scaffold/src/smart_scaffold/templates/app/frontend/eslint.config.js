import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src/components.d.ts', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
    },
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // template 寫在最前面，讀檔案時先看到畫面長什麼樣。
      'vue/block-order': ['error', { order: ['template', 'script', 'style'] }],
      // 底線開頭的變數是「故意不用」的，不要囉嗦。
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // 註解與字串裡的全形空格是正常的中文排版，不是錯誤。
      'no-irregular-whitespace': ['error', { skipStrings: true, skipComments: true }],
    },
  },
  // prettier 必須放最後，它的工作是關掉所有跟排版打架的規則。
  prettier,
]
