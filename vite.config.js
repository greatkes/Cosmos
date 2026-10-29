import { defineConfig } from 'vite';

export default defineConfig({
  // 어느 폴더에 올려도 열리도록 상대 경로로 빌드한다
  base: './',
  build: { target: 'es2022' },
});
