import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

function validateAssets() {
  const config = read('rules/layout-rules.json');
  if (config.assetRegistry !== 'assets/asset-registry.json') throw new Error('Invalid asset registry reference.');
  const registry = read(config.assetRegistry);
  const bindings = {components: config.components};
  if (registry.path_base !== 'package-root') throw new Error('Asset file paths must be relative to the package root.');
  const ids = new Set();
  for (const asset of registry.assets) {
    if (ids.has(asset.asset_id)) throw new Error('Duplicate asset id: ' + asset.asset_id);
    ids.add(asset.asset_id);
    const file = path.resolve(root, asset.file);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) throw new Error('Missing/invalid asset path: ' + asset.file);
    const bytes = fs.readFileSync(file);
    if (bytes.length !== asset.byte_size) throw new Error('Asset byte size mismatch: ' + asset.asset_id);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('Asset hash mismatch: ' + asset.asset_id);
  }
  for (const component of bindings.components) {
    const ref = component.asset_ref || component.font_ref;
    if (ref && !registry.assets.some(asset => asset.asset_id === ref.asset_id && asset.version === ref.version)) throw new Error('Unresolved component reference: ' + component.component_id);
  }
  const fixedIds = {brand_logo: 'didi.chuxing.logo.horizontal.reverse', brand_slogan_single_line: 'didi.chuxing.slogan.single-line.reverse'};
  for (const [componentId, assetId] of Object.entries(fixedIds)) {
    if (bindings.components.find(c => c.component_id === componentId)?.asset_ref?.asset_id !== assetId) throw new Error('Engine/brand binding mismatch: ' + componentId);
  }
  const css = fs.readFileSync(path.join(root, 'assets/font-faces.css'), 'utf8');
  for (const [componentId, key] of [['activity_headline', 'headlineFamily'], ['activity_subtitle', 'subtitleFamily'], ['activity_details', 'bodyFamily']]) {
    const ref = bindings.components.find(c => c.component_id === componentId)?.font_ref;
    const font = registry.assets.find(a => a.asset_id === ref?.asset_id && a.version === ref?.version);
    if (font?.type !== 'font' || font.metadata.css_family !== config.typography[key]) throw new Error('Font binding/family mismatch: ' + componentId);
    const face = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].find(m => m[1].includes("font-family: '" + font.metadata.css_family + "'"));
    const url = face?.[1].match(/url\(['"]?([^'"\)]+)['"]?\)/)?.[1];
    if (!url || path.resolve(root, 'assets', url) !== path.resolve(root, font.file)) throw new Error('Font CSS path mismatch: ' + componentId);
  }
  for (const match of css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)) {
    if (!fs.existsSync(path.resolve(root, 'assets', match[1]))) throw new Error('Missing CSS font file: ' + match[1]);
  }
  const visual = bindings.components.find(c => c.component_id === 'main_visual');
  if (visual?.asset_ref || visual?.source !== 'task_input') throw new Error('Main visual must be supplied by the task.');
  if (config.typography.headlineFamily !== 'DiDi-HYQiHei-65S' || config.typography.subtitleFamily !== 'DiDi-HYQiHei-50S') throw new Error('Expected HYQiHei-65S / HYQiHei-50S.');
  if (config.export?.format !== 'png' || config.export.dpi !== 100 || config.export.densityMetadata !== 'pHYs') throw new Error('Expected PNG at 100 PPI with pHYs metadata.');
  const delivery = config.delivery;
  if (JSON.stringify(delivery?.formats) !== JSON.stringify(['png']) || delivery.finalImagesOnly !== true || delivery.dimensionUnit !== 'mm' || delivery.scale !== 1 || delivery.pngPpi !== 100 || delivery.bitmapQuality?.policy !== 'warn-only' || delivery.bitmapQuality.referencePpi !== 100 || delivery.bitmapQuality.blockExport !== false) throw new Error('Expected final PNG images only, mm, 1:1, 100 PPI and nonblocking image-quality warnings.');
  if (delivery.svg !== undefined) throw new Error('SVG is internal preview only and must not be required for delivery.');
  if (!config.input?.requiredFields?.includes('title')) throw new Error('Main title must be required.');
  if (config.export.watermark !== false) throw new Error('Output must not add a watermark.');
  return {registry, config, bindings};
}

const {registry, config} = validateAssets();
const scope = {console, URL, Blob, Map, TextEncoder, document: {createElement: () => ({getContext: () => null}), fonts: {load: async () => []}}};
scope.window = scope;
scope.DIDI_ASSET_REGISTRY = registry;
scope.DIDI_LAYOUT_CONFIG = config;
vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(root, 'engine/didi-split-layout.js'), 'utf8'), scope);
vm.runInContext(fs.readFileSync(path.join(root, 'engine/qr.js'), 'utf8'), scope);
assert.equal(typeof scope.qrMarkup, 'function');
assert.equal(scope.makeQR('TEST').length, 33);
assert.ok(scope.qrMarkup('TEST', 0, 0, 20).includes('<path'));
assert.throws(() => scope.makeQR('x'.repeat(79)), /78/);
assert.throws(() => scope.makeQR('🚕'.repeat(20)), /78/);
assert.throws(() => scope.qrMarkup('x'.repeat(79), 0, 0, 20, {strict: true}), /78/);
await scope.DidiLayout.ready;
const input = {title: '好时光  轻松抵达', subtitle: '滴滴打车福利  助力每次出发', customImage: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="orange"/></svg>'), splitPreset: 'M', brandPillar: 'horizontal'};
const sizes = [{w: 800, h: 1600, unit: 'mm'}, {w: 1200, h: 700, unit: 'mm'}];
for (const [patch, code] of [[{splitPreset: 'INVALID'}, 'PRESET_INVALID'], [{splitPreset: null}, 'PRESET_INVALID'], [{brandPillar: 'INVALID'}, 'BRAND_PILLAR_INVALID'], [{brandPillar: ''}, 'BRAND_PILLAR_INVALID'], [{url: {}}, 'QR_VALUE_INVALID']]) {
  const layout = scope.DidiLayout.plan({...input, ...patch}, sizes[0]);
  assert.equal(layout.valid, false);
  assert.ok(layout.issues.some(issue => issue.code === code));
}
assert.equal(scope.DidiLayout.plan(input, {...sizes[0], unit: 'in'}).valid, false);
assert.equal(scope.DidiLayout.plan(null, sizes[0]).valid, false);
assert.equal(scope.DidiLayout.plan(input, null).valid, false);
for (const target of sizes) {
  const layout = scope.DidiLayout.plan(input, target);
  assert.equal(layout.valid, true, JSON.stringify(layout.issues));
  const svg = scope.DidiLayout.render(input, target);
  assert.ok(svg.includes('assets/logo.png'));
  assert.ok(svg.includes('assets/slogan.png'));
  assert.ok(!svg.includes('ginkgo-architecture'));
  assert.ok(!svg.includes('模板试排 · DEMO'), 'Rendered artwork must not add the former watermark.');
  for (const title of [undefined, null, '', ' \n\t', '\u3000']) {
    const blank = scope.DidiLayout.plan({...input, title}, target);
    assert.equal(blank.valid, false);
    assert.ok(blank.issues.some(issue => issue.code === 'TITLE_REQUIRED'));
  }
  const optionalBlank = scope.DidiLayout.plan({...input, subtitle: '', url: ''}, target);
  assert.equal(optionalBlank.valid, true, 'Subtitle and QR are not globally required.');
  const missing = scope.DidiLayout.plan({...input, customImage: ''}, target);
  assert.equal(missing.valid, false);
  assert.ok(missing.issues.some(issue => issue.component === 'main_visual'));
  const wrongVersion = scope.DidiLayout.plan({...input, customImage: '', mainVisualRef: {asset_id: 'missing-visual', version: '99'}}, target);
  assert.equal(wrongVersion.valid, false);
  for (const preset of config.splitPresets) {
    const base = {...input, splitPreset: preset.id};
    const normal = scope.DidiLayout.plan(base, target);
    const long = scope.DidiLayout.plan({...base, title: '城'.repeat(80)}, target);
    assert.equal(long.headline.fontSize, normal.headline.fontSize);
    assert.equal(long.valid, false);
  }
}
for (const [target, expected] of [[sizes[0], [3150, 6299]], [sizes[1], [4724, 2756]], [{w: 210, h: 297, unit: 'mm'}, [827, 1169]], [{w: 600, h: 1600, unit: 'mm'}, [2362, 6299]], [{w: 800, h: 2000, unit: 'mm'}, [3150, 7874]], [{w: 10.25, h: 20.5, unit: 'mm'}, [40, 81]], [{w: 1080, h: 1440, unit: 'px'}, [1080, 1440]]]) {
  const pixels = scope.DidiLayout.pngSize(target);
  assert.equal(pixels.width, expected[0]);
  assert.equal(pixels.height, expected[1]);
  assert.equal(pixels.dpi, 100);
}
// Decimal mm at and around half-pixel boundaries must match the audit's ROUND_HALF_UP.
for (const [mm, expected] of [[256.667, 1011], [257.429, 1014], [258.191, 1017], [258.953, 1020], [259.715, 1023], [512.699, 2019], [514.223, 2025], [1026.033, 4040], ['256.6669999999999999', 1010], ['256.6670000000000001', 1011], ['2.56667e2', 1011], ['+0256.6670', 1011], ['.635', 3], ['0.127', 1]]) {
  const pixels = scope.DidiLayout.pngSize({w: mm, h: mm, unit: 'mm'});
  assert.equal(pixels.width, expected, String(mm));
  assert.equal(pixels.height, expected, String(mm));
}
assert.throws(() => scope.DidiLayout.pngSize({w: '0.1269999999999999999', h: 1, unit: 'mm'}), /至少为 1 像素/);
for (const target of [null, {w: 0, h: 1, unit: 'px'}, {w: 1.5, h: 2, unit: 'px'}, {w: 1, h: 2, unit: 'in'}, {w: 1, h: 2, unit: ''}]) assert.throws(() => scope.DidiLayout.pngSize(target));
const qrInput = {...input, title: '出发', subtitle: '', url: 'https://example.com'};
await assert.rejects(() => scope.DidiLayout.exportPng(qrInput, sizes[1]), /二维码绘制函数缺失/);
await assert.rejects(() => scope.DidiLayout.exportPng({...qrInput, url: 'x'.repeat(79)}, sizes[1], scope.qrMarkup), /78/);
await assert.rejects(() => scope.DidiLayout.exportPng({...input, splitPreset: 'INVALID'}, sizes[0], scope.qrMarkup), /基础版式/);
await assert.rejects(() => scope.DidiLayout.exportPng(input, sizes[0]), /字体/);
const report = {status: 'passed', rule_version: config.version, asset_count: registry.assets.length, checks: ['Existing asset paths, byte sizes and SHA-256 hashes.', 'Versioned component references and matching font CSS paths.', 'Logo and slogan references in two layout previews.', 'Task-supplied main visual is required; missing assets are reported.', 'Fixed font sizes and overflow errors across four presets.', 'PNG 100 PPI size conversion, invalid dimensions and unloaded-font rejection.', 'Merged QR encoder/markup, UTF-8 byte limit, strict export rejects failed or missing QR rendering.', 'Invalid presets, brand arrangements, units and missing input objects are rejected.', 'Nonblank main title is required; subtitle and QR are not globally required.', 'Artwork SVG does not add the former DEMO watermark.'], measurement_mode: 'estimated-smoke-only', browser_verification: 'not_performed_by_this_script', bitmap_effective_ppi_verification: 'not_performed_by_this_script'};
console.log(JSON.stringify(report, null, 2));
