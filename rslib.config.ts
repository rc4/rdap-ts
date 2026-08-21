import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'esm',
      syntax: 'es2022',
      dts: { autoExtension: true },
      redirect: { dts: { extension: true } },
    },
    {
      format: 'cjs',
      syntax: 'es2022',
      dts: { autoExtension: true },
      redirect: { dts: { extension: true } },
    },
  ],
  output: {
    target: 'web',
    cleanDistPath: true,
  },
});
