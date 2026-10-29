import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); assert(index >= 0 && args[index + 1], `Missing ${name}`); return args[index + 1]; };
const require = createRequire(resolve(option('--runner-root'), 'package.json'));
const {chromium, webkit} = require('playwright');
const output = option('--output');
assert(/^(?:[A-Za-z]:[\\/]|\/)/.test(output), '--output must be absolute');
await mkdir(output, {recursive: true});
const results = [];
for (const [engine, browserType] of Object.entries({chromium, webkit})) {
    let browser;
    try {
        browser = await browserType.launch({headless: true});
        const page = await browser.newPage();
        await page.route('**/*', route => route.abort());
        await page.setContent('<!doctype html><html><body><canvas id="source" width="128" height="96"></canvas></body></html>');
        const cases = await page.evaluate(() => {
            const source = document.querySelector('#source');
            const gl = source.getContext('webgl', {alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false});
            if (!gl) throw new Error('Real WebGL unavailable; no 2D substitute permitted');
            const shader = (type, text) => {
                const s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
                return s;
            };
            const program = gl.createProgram();
            gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
            gl.attachShader(program, shader(gl.FRAGMENT_SHADER, 'precision mediump float;uniform vec2 size;uniform float blue;void main(){gl_FragColor=vec4(gl_FragCoord.xy/size,blue,.75);}'));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
            gl.useProgram(program);
            const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.75,-.75,.75,-.75,-.75,.75,-.75,.75,.75,-.75,.75,.75]), gl.STATIC_DRAW);
            const position = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
            const cells = Array.from({length: 3}, () => { const c = document.createElement('canvas'); document.body.append(c); return c; });
            let copies = 0;
            const series = [];
            const check = (ok, reason) => { if (!ok) throw new Error(reason); };
            const pass = (width, height, blue) => {
                gl.viewport(0,0,width,height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
                gl.uniform2f(gl.getUniformLocation(program,'size'),width,height); gl.uniform1f(gl.getUniformLocation(program,'blue'),blue);
                const start = performance.now(); gl.drawArrays(gl.TRIANGLES,0,6);
                for (const cell of cells) {
                    cell.width=width; cell.height=height;
                    const ctx=cell.getContext('2d'); ctx.globalCompositeOperation='copy';
                    ctx.drawImage(source,0,source.height-height,width,height,0,0,width,height); copies++;
                    const pixel=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);
                    const center=pixel(width>>1,height>>1), corner=pixel(0,0);
                    check(Math.abs(center[3]-191)<=3 && corner[3]===0,'Missing primitive/alpha');
                    check(Math.abs(center[2]-Math.round(255*blue))<=4,'Corrupt copy or stale frame');
                    check(pixel(width>>1,height>>2)[1] > pixel(width>>1,Math.floor(height*.75))[1]+70,'Crop or vertical origin wrong');
                    series.push({width,height,center,corner});
                }
                const durationMs=performance.now()-start;
                check(!gl.isContextLost() && gl.getError()===gl.NO_ERROR,'Context lost or GL error');
                return durationMs;
            };
            const first = pass(64,48,.25);
            const a={name:'immediate-alpha-three-cells',passed:true,copies:3,durations:[first],pixels:series.slice()};
            source.width=192;source.height=144;
            const resized=pass(96,72,.5);
            const b={name:'resize-crop-dpr',passed:true,copies:3,durations:[resized],pixels:series.slice(-3),dpr:1.5};
            const durations=[];
            for(let i=0;i<30;i++) durations.push(pass(96,72,(i%4)/4));
            const c={name:'thirty-successive-real-webgl-passes',passed:true,copies:90,durations,pixels:series.slice(-3)};
            check(copies===96,'Unexpected copy count');
            check(source.getContext('webgl')===gl,'Additional WebGL context');
            return [a,b,c];
        });
        results.push(...cases.map(result => ({engine, ...result})));
        await page.screenshot({path: resolve(output, `${engine}.png`)});
    } catch (error) {
        results.push({engine, passed: false, error: String(error)});
    } finally { await browser?.close(); }
}
await writeFile(resolve(output, 'results.json'), JSON.stringify({apiProofOnly: true, results}, null, 2));
const passed = results.filter(result => result.passed).length;
console.log(`${passed}/6 API copy cases passed; not an iPhone hardware qualification. Evidence: ${output}`);
if (passed !== 6 || results.length !== 6) process.exitCode = 1;
