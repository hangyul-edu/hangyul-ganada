#!/usr/bin/env node
/**
 * The stroke-marker evidence: a contact sheet of every taught character, and a
 * before/after for the characters the defect was reported on.
 *
 *   npm run strokes:markers:evidence
 *
 * ## Why this is a script and not a screenshot somebody took
 *
 * The claim in the report is that numbered badges no longer cover the letters
 * they label. A screenshot is a claim about one moment; this redraws every
 * taught character from the shipping geometry with the shipping placement, so
 * the picture in the report is regenerated from the code rather than archived
 * beside it. If the placement regresses, the evidence regresses with it.
 *
 * ## The before/after reimplements the old rule on purpose
 *
 * `oldLayout` is the previous `layoutMarkers` — one radius back along the
 * stroke's opening direction, own ink allowed, twelve turns, five reaches —
 * kept here and nowhere else. It is the only honest way to draw a "before":
 * reading it out of git history would produce a picture nobody could reproduce
 * from a checkout, and describing the defect in prose is what let it survive
 * five review rounds.
 *
 * `npm run strokes:visual` is the gate; this is the picture. See
 * `apps/web/src/ui/strokeMarkers.ts` for the rule itself.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { ALL_CHARACTERS } from '../apps/web/src/data/characters.ts';
import { hasVectorGlyph, vectorGlyph } from '../apps/web/src/data/strokeVectors.ts';
import { layoutMarkers } from '../apps/web/src/ui/strokeMarkers.ts';
import { isSyllable } from '../apps/web/src/data/jamo.ts';

const OUT = process.argv[2] ?? 'docs/report-assets';
mkdirSync(OUT, { recursive: true });
const CHARS = ['안', '아', '꽃', 'ㅊ', 'ㅏ', '어'];
const SIZE = 220;

/** The old placement, reconstructed exactly: one radius back, own ink allowed. */
function oldLayout(strokes, radius) {
  const TURNS = [0,-30,30,-60,60,-90,90,-120,120,-150,150,180];
  const REACHES = [1.05,1.6,2.2,2.9,3.7];
  const PEN = 9;
  const edge = radius + 1.5;
  const placed = [];
  const clamp=(v,l,h)=>Math.min(h,Math.max(l,v));
  const dist = (stroke, p) => {
    const pts = flatten(stroke.d);
    let n = Infinity;
    for (let i=1;i<pts.length;i+=1){
      const a=pts[i-1],b=pts[i];
      const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
      const t = l2<1e-9?0:Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2));
      n=Math.min(n,Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy)));
    }
    return n - PEN/2;
  };
  for (const stroke of strokes) {
    const anchor={x:stroke.start[0],y:stroke.start[1]};
    const away=Math.atan2(-stroke.heading[1],-stroke.heading[0]);
    let best=null,bestC=-Infinity;
    for (const reach of REACHES) {
      for (const turn of TURNS) {
        const a=away+turn*Math.PI/180;
        const label={x:clamp(anchor.x+Math.cos(a)*radius*reach,edge,100-edge),y:clamp(anchor.y+Math.sin(a)*radius*reach,edge,100-edge)};
        let c=Infinity;
        for(const o of placed) c=Math.min(c,Math.hypot(label.x-o.label.x,label.y-o.label.y)-(radius*2+0.8));
        for(const o of strokes){ if(o.order===stroke.order) continue; c=Math.min(c,dist(o,label)-radius); }
        if(c>=0){best=label;bestC=c;break;}
        if(c>bestC){bestC=c;best=label;}
      }
      if(bestC>=0) break;
    }
    const label=best??anchor;
    placed.push({order:stroke.order,anchor,label,tethered:Math.hypot(label.x-anchor.x,label.y-anchor.y)>radius*1.6});
  }
  return placed;
}
function flatten(d){const out=[];let cur={x:0,y:0},first={x:0,y:0};
 for(const cmd of d.match(/[MLCZ][^MLCZ]*/g)??[]){const n=(cmd.slice(1).match(/-?\d+(?:\.\d+)?/g)??[]).map(Number);
  if(cmd[0]==='M'){cur={x:n[0],y:n[1]};first=cur;out.push(cur);}
  else if(cmd[0]==='L'){cur={x:n[0],y:n[1]};out.push(cur);}
  else if(cmd[0]==='C'){const[c1x,c1y,c2x,c2y,x,y]=n;for(let s=1;s<=12;s+=1){const t=s/12,u=1-t;out.push({x:u*u*u*cur.x+3*u*u*t*c1x+3*u*t*t*c2x+t*t*t*x,y:u*u*u*cur.y+3*u*u*t*c1y+3*u*t*t*c2y+t*t*t*y});}cur={x,y};}
  else{out.push(first);cur=first;}}
 return out;}

const draw = (character, markers, radius) => {
  const glyph = vectorGlyph(character);
  const pen = `fill="none" stroke="#111" stroke-width="${glyph.pen}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="3"`;
  const ink = glyph.strokes.map((s) => `<path d="${s.d}" ${pen}/>`).join('');
  const badges = markers.map((m) =>
    `${m.tethered ? `<line x1="${m.anchor.x}" y1="${m.anchor.y}" x2="${m.label.x}" y2="${m.label.y}" stroke="#e08a1e" stroke-width="0.7"/>`:''}` +
    `<circle cx="${m.label.x}" cy="${m.label.y}" r="${radius}" fill="#fff" stroke="#e08a1e" stroke-width="1"/>` +
    `<text x="${m.label.x}" y="${m.label.y+radius*0.36}" font-size="${radius*1.05}" text-anchor="middle" font-weight="700" fill="#b06a10">${m.order}</text>`).join('');
  return `<svg viewBox="0 0 100 100" width="${SIZE}" height="${SIZE}">${ink}${badges}</svg>`;
};

const rows = CHARS.map((c) => {
  const glyph = vectorGlyph(c);
  const radius = isSyllable(c) ? 4 : 5.6;
  return `<div class="row"><div class="k">${c}</div>
    <div class="cell"><div class="cap">before</div>${draw(c, oldLayout(glyph.strokes, radius), radius)}</div>
    <div class="cell"><div class="cap">after</div>${draw(c, layoutMarkers(glyph.strokes, radius), radius)}</div></div>`;
}).join('');

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#fff;font:13px system-ui;padding:10px}
.row{display:flex;align-items:center;gap:10px;border-bottom:1px solid #eee;padding:6px}
.k{width:34px;font-size:20px;color:#3366cc;text-align:center}
.cell{background:#fdfcf9;border:1px solid #eee}
.cap{font-size:11px;color:#666;text-align:center;padding:2px}
</style><div>${rows}</div>`;
writeFileSync(`${OUT}/stroke-markers-before-after.html`, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 900 }, deviceScaleFactor: 2 });
await page.setContent(html);
await page.screenshot({ path: `${OUT}/stroke-markers-before-after.png`, fullPage: true });
await browser.close();

// --- and the contact sheet: every taught character, for a person to look at ---
const SHEET_SIZE = 132;
const sheetChars = ALL_CHARACTERS.map((c) => c.character).filter(hasVectorGlyph);

const sheetCell = (character) => {
  const glyph = vectorGlyph(character);
  const radius = isSyllable(character) ? 4 : 5.6;
  const markers = layoutMarkers(glyph.strokes, radius);
  const pen = `fill="none" stroke="#111" stroke-width="${glyph.pen}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="3"`;
  const ink = glyph.strokes.map((s) => `<path d="${s.d}" ${pen}/>`).join('');
  const badges = markers.map((m) =>
    `${m.tethered ? `<line x1="${m.anchor.x}" y1="${m.anchor.y}" x2="${m.label.x}" y2="${m.label.y}" stroke="#e08a1e" stroke-width="0.7"/>` : ''}` +
    `<circle cx="${m.label.x}" cy="${m.label.y}" r="${radius}" fill="#fff" stroke="#e08a1e" stroke-width="1"/>` +
    `<text x="${m.label.x}" y="${m.label.y + radius * 0.36}" font-size="${radius * 1.05}" text-anchor="middle" font-weight="700" fill="#b06a10">${m.order}</text>`).join('');
  return `<div class="c"><svg viewBox="0 0 100 100" width="${SHEET_SIZE}" height="${SHEET_SIZE}">${ink}${badges}</svg><b>${character}</b></div>`;
};

const sheetHtml = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#fff;font:11px system-ui;padding:6px}
.grid{display:flex;flex-wrap:wrap;gap:2px}
.c{width:${SHEET_SIZE}px;background:#fdfcf9;border:1px solid #eee;position:relative}
.c b{position:absolute;left:3px;top:2px;font-size:13px;color:#3366cc}
</style><div class="grid">${sheetChars.map(sheetCell).join('')}</div>`;
writeFileSync(`${OUT}/stroke-markers-contact-sheet.html`, sheetHtml);

const sheetBrowser = await chromium.launch();
const sheetPage = await sheetBrowser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
await sheetPage.setContent(sheetHtml);
await sheetPage.screenshot({ path: `${OUT}/stroke-markers-contact-sheet.png`, fullPage: true });
await sheetBrowser.close();
console.log('wrote the contact sheet for', sheetChars.length, 'characters');

console.log('wrote', OUT);
