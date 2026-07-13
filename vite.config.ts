import { viteStaticCopy } from 'vite-plugin-static-copy';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
	build: {
		rollupOptions: {
			input: {
				main: resolve(__dirname, 'index.html'),
				nested: resolve(__dirname, 'options.html')
			}
		},
		sourcemap: true
	},
	plugins: [
		preact(),
		viteStaticCopy({
			targets: [
				{
					src: 'src/scripts',
					dest: '.',
				},
				{
					// Диагностика: подозрение, что Chrome дедуплицирует инъекцию скрипта
					// по имени файла в кадре независимо от "world". Даём ISOLATED-записи
					// в манифесте отдельное имя файла с тем же содержимым.
					src: 'src/scripts/ttBridgeChannel.js',
					dest: 'scripts',
					rename: 'ttBridgeChannelIsolated.js',
				},
			],
		}),
	],
});
