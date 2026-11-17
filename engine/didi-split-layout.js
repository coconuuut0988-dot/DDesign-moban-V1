/* Deterministic draft layout. Source assets remain unchanged. */
(function () {
  const registry = window.DIDI_ASSET_REGISTRY;
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const config = window.DIDI_LAYOUT_CONFIG;
  const families = {headline:config.typography.headlineFamily,subtitle:config.typography.subtitleFamily,body:config.typography.bodyFamily};
  const refs = {logo:'didi.chuxing.logo.horizontal.reverse',slogan:'didi.chuxing.slogan.single-line.reverse'};
  let context = null, fontsReady = false, serial = 0;
  try { context = document.createElement('canvas').getContext('2d'); } catch {}
  function asset(id, version) { return registry.assets.find(a => a.asset_id === id && (!version || a.version === version)); }
  function path(a) { return a.file; }
  function measure(text, size, family) {
    if (context && fontsReady) {
      context.font = `400 ${size}px "${family}"`;
      const m = context.measureText(text || '国');
      return {width:text ? m.width : 0,ascent:m.actualBoundingBoxAscent || size*.86,descent:m.actualBoundingBoxDescent || size*.1};
    }
    return {width:[...text].reduce((s,c)=>s+(/[\x00-\x7f]/.test(c)?0.56:1)*size,0),ascent:size*.86,descent:size*.1};
  }
  function wrap(text, width, fontSize, family) {
    const result = [];
    for (const paragraph of String(text || '').split('\n')) {
      let line = '';
      for (const ch of paragraph) {
        if (line && measure(line+ch,fontSize,family).width > width) {
          const space=line.lastIndexOf(' ');
          if(space>0){result.push(line.slice(0,space+1));line=line.slice(space+1);}
          else {result.push(line);line='';}
        }
        line += ch;
      }
      if (line || !paragraph) result.push(line);
    }
    return result;
  }
  function fixedText(text, box, family, fontSize, maxLines, leading) {
    const lines=wrap(text,Math.max(1,box.w),fontSize,family),ms=lines.map(l=>measure(l,fontSize,family));
    const ascent=Math.max(...ms.map(m=>m.ascent)),descent=Math.max(...ms.map(m=>m.descent)),lineHeight=fontSize*leading;
    const w=Math.max(0,...ms.map(m=>m.width)),h=ascent+descent+Math.max(0,lines.length-1)*lineHeight;
    const charsPerLine=Math.max(0,Math.floor(box.w/measure('国',fontSize,family).width));
    return {lines,fontSize,lineHeight,ascent,descent,w,h,maxLines,charsPerLine,capacity:charsPerLine*maxLines,fits:lines.length<=maxLines&&h<=box.h+.01&&w<=box.w+.01};
  }
  function inside(a,W,H){return a.x>=-0.01&&a.y>=-0.01&&a.x+a.w<=W+.01&&a.y+a.h<=H+.01;}
  function overlaps(a,b){return a.x<b.x+b.w-.01&&a.x+a.w>b.x+.01&&a.y<b.y+b.h-.01&&a.y+a.h>b.y+.01;}
  function balancedHeadline(text) {
    const value=String(text||'');
    if(!value.includes('\n')&&/^[\u3400-\u9fff]{7,12}$/.test(value)){
      const chars=[...value],middle=Math.ceil(chars.length/2);
      return chars.slice(0,middle).join('')+'\n'+chars.slice(middle).join('');
    }
    return value;
  }
  function expanded(box,gap){return {x:box.x-gap,y:box.y-gap,w:box.w+gap*2,h:box.h+gap*2};}
  function inRegion(box,region){return box.x>=region.x-.01&&box.y>=region.y-.01&&box.x+box.w<=region.x+region.w+.01&&box.y+box.h<=region.y+region.h+.01;}
  function plan(d,s) {
    if(!d||typeof d!=='object'||Array.isArray(d)||!s||typeof s!=='object'||Array.isArray(s))return {valid:false,issues:[{severity:'error',code:'INPUT_REQUIRED',message:'请提供任务数据和目标尺寸对象。'}]};
    const W=Number(s.w),H=Number(s.h),ratio=W/H,portrait=H>W,short=Math.min(W,H),p=config.policy;
    if(!Number.isFinite(W)||!Number.isFinite(H)||W<=0||H<=0)return {valid:false,issues:[{severity:'error',code:'SIZE_INVALID',message:'请输入有效的正数尺寸。'}]};
    const unit=s.unit===undefined?config.coordinateUnit:s.unit;
    if(!['mm','px'].includes(unit)||(unit==='px'&&(!Number.isInteger(W)||!Number.isInteger(H))))return {valid:false,issues:[{severity:'error',code:'UNIT_INVALID',message:'尺寸单位仅支持 mm 或整数 px。'}]};
    const preset=config.splitPresets.find(v=>v.id===(d.splitPreset===undefined?config.defaultSplit:d.splitPreset));
    if(!preset)return {valid:false,issues:[{severity:'error',code:'PRESET_INVALID',message:'基础版式仅支持 S、M、L、XL。'}]};
    const pillar=d.brandPillar===undefined?config.defaultBrandPillar:d.brandPillar;
    if(!['horizontal','vertical'].includes(pillar))return {valid:false,issues:[{severity:'error',code:'BRAND_PILLAR_INVALID',message:'品牌排列仅支持 horizontal 或 vertical。'}]};
    if(d.url!==undefined&&d.url!==null&&typeof d.url!=='string')return {valid:false,issues:[{severity:'error',code:'QR_VALUE_INVALID',component:'qrcode',message:'二维码内容必须为字符串。'}]};
    const fraction=preset.informationFraction,overlay=preset.mode==='overlay';
    const regions=overlay?{information:{x:0,y:0,w:W,h:H},image:{x:0,y:0,w:W,h:H}}:portrait?{information:{x:0,y:H*(1-fraction),w:W,h:H*fraction},image:{x:0,y:0,w:W,h:H*(1-fraction)}}:{information:{x:0,y:0,w:W*fraction,h:H},image:{x:W*fraction,y:0,w:W*(1-fraction),h:H}};
    const profile=config.logoProfiles.find(x=>ratio>=x.ratio[0]&&ratio<=x.ratio[1]);
    const logoH=short/(profile?.denominator||(portrait?19:18));
    const margin=logoH,logoAsset=asset(refs.logo),sloganAsset=asset(refs.slogan);
    const logo={id:'brand_logo',x:margin,y:portrait?H-margin-logoH:margin,w:logoH*logoAsset.metadata.visible_aspect_ratio,h:logoH};
    const sloganH=logoH*p.identificationSloganHeightFactor;
    const sloganW=sloganH*sloganAsset.metadata.visible_aspect_ratio;
    const slogan={id:'brand_slogan',x:pillar==='horizontal'?W-margin-sloganW:margin,y:pillar==='horizontal'?logo.y:(portrait?margin:H-margin-sloganH),w:sloganW,h:sloganH};
    const gap=short*p.textGapShortRatio;
    const contentTop=overlay?H*(portrait?.62:.40):portrait?regions.information.y+margin*1.1:Math.max(margin*4,H*p.landscapeTextTopRatio);
    const contentBottom=portrait?logo.y-margin:(pillar==='vertical'?slogan.y-margin:H-margin);
    const content={x:margin,y:contentTop,w:(overlay&&!portrait?W*.75:regions.information.w)-margin*2,h:contentBottom-contentTop};
    const type=config.typography,t=type.templates[preset.id],scale=short/type.referenceShortEdgeMm;
    const subtitle=fixedText(d.subtitle||'',content,families.subtitle,t.subtitleSizeMm*scale,t.subtitleMaxLines,type.subtitleLineHeight);
    subtitle.id='activity_subtitle';subtitle.x=content.x;
    const detailText=[d.date,d.location].filter(v=>String(v||'').trim()).join(' · ');
    let details=null;
    if(detailText){details=fixedText(detailText,content,families.body,t.bodySizeMm*scale,2,1.4);details.id='activity_details';details.x=content.x;}
    const qrSide=d.url?Math.max(short*p.qrShortRatio,Number(d.brand?.qrMin)||20):0;
    const footerReserved=(details?details.h+gap:0)+(qrSide?qrSide+gap:0);
    const headlineArea={x:content.x,y:content.y,w:content.w,h:content.h-subtitle.h-gap-footerReserved};
    const title=fixedText(balancedHeadline(d.title),headlineArea,families.headline,t.headlineSizeMm*scale,t.headlineMaxLines,type.headlineLineHeight);
    title.id='activity_headline';title.x=content.x;title.y=content.y;
    subtitle.y=title.y+title.h+gap;
    let cursor=subtitle.y+subtitle.h;
    if(details){details.y=cursor+gap;cursor=details.y+details.h;}
    const qr=d.url?{id:'qrcode',x:content.x,y:cursor+gap,w:qrSide,h:qrSide}:null;
    const brandProtectedZones=[expanded(logo,logoH),expanded(slogan,logoH)];
    const body=[title,subtitle,...(details?[details]:[]),...(qr?[qr]:[])];
    const boxes=[logo,slogan,...body],errors=[];
    if(typeof d.title!=='string'||!d.title.trim())errors.push({severity:'error',code:'TITLE_REQUIRED',component:'activity_headline',message:'主标题必填，不能仅包含空格。'});
    const visual=visualSource(d);
    if(visual.error)errors.push({severity:'error',component:'main_visual',message:visual.error});
    for(const b of boxes){
      if(!inside(b,W,H))errors.push({severity:'error',component:b.id,message:'组件超出画布范围。'});
      if(b.fits===false)errors.push({severity:'error',component:b.id,message:`${b.id==='activity_headline'?'主标题':b.id==='activity_subtitle'?'副标题':'详情'}超出模板容量（最多 ${b.maxLines} 行），请精简内容或更换版式；字号保持固定。`});
    }
    for(const b of body){
      if(!inRegion(b,regions.information)||b.y+b.h>contentBottom+.01)errors.push({severity:'error',component:b.id,message:'活动内容超出模板文字区域，请精简内容或更换版式。'});
      if(brandProtectedZones.some(zone=>overlaps(b,zone)))errors.push({severity:'error',component:b.id,message:'活动内容进入品牌识别保护区域。'});
    }
    if(!inRegion(logo,regions.information))errors.push({severity:'error',component:'brand_logo',message:'当前橙色信息区无法完整容纳标识，请调整分割比例。'});
    const expectedSloganRegion=pillar==='horizontal'?(portrait?regions.information:regions.image):(portrait?regions.image:regions.information);
    if(!inRegion(slogan,expectedSloganRegion))errors.push({severity:'error',component:'brand_slogan',message:'识别口号无法完整放入对应分区，请调整分割比例。'});
    if(overlaps(logo,slogan))errors.push({severity:'error',component:'brand_slogan',message:'Logo 与识别口号发生重叠。'});
    if(slogan.h+0.001<logo.h)errors.push({severity:'error',component:'brand_slogan',message:'识别口号小于一个标识高度。'});
    if(pillar==='horizontal'&&Math.abs(logo.y-slogan.y)>.001)errors.push({severity:'error',component:'brand_slogan',message:'品牌识别行未水平对齐。'});
    if(pillar==='vertical'&&Math.abs(logo.x-slogan.x)>.001)errors.push({severity:'error',component:'brand_slogan',message:'品牌识别列未竖向对齐。'});
    const warnings=[{severity:'info',message:'固定字号模板试排；主／次信息口号与通栏横线版式已暂缓。'}];
    if(!profile)warnings.push({severity:'warning',message:'当前尺寸比例采用草稿回退的标识尺寸，仍需设计确认。'});
    return {valid:errors.length===0,W,H,portrait,margin,regions,splitPreset:preset.id,mode:preset.mode,content,informationFraction:fraction,informationColor:config.informationColor,brandPillar:pillar,logo,slogan,brandProtectedZones,headline:title,subtitle,details,qr,typography:{...t,scale,fixed:true},profile:profile?.id||'draft-fallback',measurementMode:fontsReady&&context?'actual-font':'estimated',template:{id:config.id,version:config.version,status:'draft',sloganRole:'identification',kind:preset.mode},issues:[...errors,...warnings],assets:registry.assets.map(a=>({id:a.asset_id,version:a.version,sha256:a.sha256}))};
  }
  function visualSource(d) {
    if(typeof d.customImage==='string'&&d.customImage.trim())return {url:d.customImage.trim()};
    if(d.mainVisualRef?.asset_id){
      const a=asset(d.mainVisualRef.asset_id,d.mainVisualRef.version);
      if(!a||!['image','main_visual','key_visual'].includes(a.type))return {url:'',error:'指定的主视觉资产或版本不存在，或该资产不是主视觉图片。'};
      return {url:a.file};
    }
    return {url:'',error:'请提供本次主视觉图片；精简包不绑定默认活动图片。'};
  }
  function sourceUrl(d){return visualSource(d).url;}
  function fixedImage(a,box,resources={}) {
    const b=a.metadata.visible_bounds_px,c=a.metadata.canvas_px;
    const href=resources[path(a)] || path(a);
    return `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="${b.left} ${b.top} ${b.right-b.left} ${b.bottom-b.top}" preserveAspectRatio="xMidYMid meet"><image href="${E(href)}" width="${c.width}" height="${c.height}"/></svg>`;
  }
  function textMarkup(r,family) {
    if(!r)return '';
    return `<g font-family="${family}" font-size="${r.fontSize}" font-weight="400" fill="white" style="font-synthesis:none">${r.lines.map((line,i)=>`<text x="${r.x}" y="${r.y+r.ascent+i*r.lineHeight}" xml:space="preserve">${E(line)}</text>`).join('')}</g>`;
  }
  function render(d,s,options={}) {
    const r=plan(d,s);
    if(!r.W)return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300"><rect width="600" height="300" fill="#eceef1"/><text x="300" y="150" text-anchor="middle" font-size="18" fill="#9a7d68">${E(r.issues[0].message)}</text></svg>`;
    const resources=options.resources||{},photo=resources[sourceUrl(d)]||sourceUrl(d),fontCss=options.fontCss||'',image=r.regions.image,info=r.regions.information;
    const id='layout-content-'+(++serial);
    const unit=s.unit==='px'?'px':'mm';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${r.W}${unit}" height="${r.H}${unit}" viewBox="0 0 ${r.W} ${r.H}" role="img" aria-label="${E(s.label+'：仅识别信息分割版式，'+d.title)}"><style>${fontCss}</style>${r.mode==='overlay'?'':`<rect data-region="information" x="${info.x}" y="${info.y}" width="${info.w}" height="${info.h}" fill="${r.informationColor}"/>`}<svg x="${image.x}" y="${image.y}" width="${image.w}" height="${image.h}" viewBox="0 0 ${image.w} ${image.h}" overflow="hidden">${photo?`<image href="${E(photo)}" width="${image.w}" height="${image.h}" preserveAspectRatio="xMidYMid slice"/>`:`<rect width="${image.w}" height="${image.h}" fill="#efefeb"/>`}</svg><defs><clipPath id="${id}-content"><rect x="${r.content.x}" y="${r.content.y}" width="${Math.max(0,r.content.w)}" height="${Math.max(0,r.content.h)}"/></clipPath></defs><g clip-path="url(#${id}-content)">${textMarkup(r.headline,families.headline)}${textMarkup(r.subtitle,families.subtitle)}${textMarkup(r.details,families.body)}</g>${fixedImage(asset(refs.logo),r.logo,resources)}${fixedImage(asset(refs.slogan),r.slogan,resources)}${r.qr&&options.qrMarkup?options.qrMarkup(d.url,r.qr.x,r.qr.y,r.qr.w):''}</svg>`;
  }
  const resourceCache=new Map();
  async function dataUrl(url) {
    if(url.startsWith('data:'))return url;
    if(!resourceCache.has(url))resourceCache.set(url,(async()=>{const response=await fetch(new URL(url,document.baseURI||location.href));if(!response.ok)throw new Error('素材读取失败：'+url);const blob=await response.blob();return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(blob);});})());
    return resourceCache.get(url);
  }
  function decimalRatio(value) {
    const match=String(value).trim().match(/^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i);
    if(!match)throw new Error('毫米尺寸和 PPI 必须为有效十进制数。');
    const fraction=match[2]??match[3]??'',coefficient=BigInt((match[1]||'0')+fraction);
    const exponent=Number(match[4]||0)-fraction.length;
    return exponent>=0?[coefficient*10n**BigInt(exponent),1n]:[coefficient,10n**BigInt(-exponent)];
  }
  function millimetresToPixels(value) {
    // Exact decimal arithmetic: mm * PPI / 25.4, with positive halves rounded up.
    const [mm,mmScale]=decimalRatio(value),[ppi,ppiScale]=decimalRatio(config.export.dpi);
    const numerator=mm*ppi*10n,denominator=mmScale*ppiScale*254n;
    const rounded=(2n*numerator+denominator)/(2n*denominator);
    if(rounded>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('换算后的 PNG 尺寸超出可精确表示的整数范围。');
    return Number(rounded);
  }
  function pngSize(s) {
    if(!s||typeof s!=='object'||Array.isArray(s))throw new Error('PNG 导出需要目标尺寸对象。');
    const W=Number(s.w),H=Number(s.h),unit=s.unit===undefined?config.coordinateUnit:s.unit;
    if(!Number.isFinite(W)||!Number.isFinite(H)||W<=0||H<=0)throw new Error('PNG 导出需要有效的正数尺寸。');
    if(!['px','mm'].includes(unit))throw new Error('PNG 导出仅支持 px 或 mm 尺寸。');
    if(unit==='px'&&(!Number.isInteger(W)||!Number.isInteger(H)))throw new Error('px 尺寸必须为整数。');
    const width=unit==='mm'?millimetresToPixels(s.w):W,height=unit==='mm'?millimetresToPixels(s.h):H;
    if(width<1||height<1)throw new Error('换算后的 PNG 宽高至少为 1 像素。');
    return {width,height,dpi:config.export.dpi};
  }
  function pngWithDensity(bytes,dpi) {
    // PNG stores density as integer pixels/metre: 100 PPI rounds to 3937 ppm.
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(view.byteLength<33||view.getUint32(0)!==0x89504e47||view.getUint32(4)!==0x0d0a1a0a)throw new Error('无效的 PNG 数据。');
    const chunk=new Uint8Array(21),cv=new DataView(chunk.buffer),ppm=Math.round(dpi/0.0254);
    cv.setUint32(0,9);chunk.set([112,72,89,115],4);cv.setUint32(8,ppm);cv.setUint32(12,ppm);chunk[16]=1;
    let crc=0xffffffff;
    for(const b of chunk.subarray(4,17)){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    cv.setUint32(17,(crc^0xffffffff)>>>0);
    const parts=[bytes.subarray(0,8)];let inserted=false;
    for(let offset=8;offset<bytes.length;){
      if(offset+12>bytes.length)throw new Error('PNG 数据不完整。');
      const length=view.getUint32(offset),end=offset+length+12,type=view.getUint32(offset+4);
      if(end>bytes.length)throw new Error('PNG 数据不完整。');
      if(type!==0x70485973)parts.push(bytes.subarray(offset,end)); // Replace any existing pHYs.
      if(type===0x49484452){parts.push(chunk);inserted=true;}
      offset=end;
    }
    if(!inserted)throw new Error('PNG 缺少 IHDR。');
    const result=new Uint8Array(parts.reduce((sum,p)=>sum+p.length,0));let offset=0;
    for(const part of parts){result.set(part,offset);offset+=part.length;}
    return result;
  }
  async function exportPng(d,s,qrMarkup) {
    const {width,height,dpi}=pngSize(s);
    const layout=plan(d,s);
    if(!layout.valid)throw new Error(layout.issues.filter(x=>x.severity==='error').map(x=>x.message).join('\n'));
    if(layout.qr&&typeof qrMarkup!=='function')throw new Error('二维码绘制函数缺失，无法导出；请加载 engine/qr.js 并传入 window.qrMarkup。');
    // Strict mode prevents diagnostic placeholders from entering exported artwork.
    const exportQr=layout.qr?(...args)=>qrMarkup(...args,{strict:true}):qrMarkup;
    if(layout.qr)exportQr(d.url,layout.qr.x,layout.qr.y,layout.qr.w);
    if(!await ready||!context)throw new Error('指定字体或 Canvas 未加载完成，无法导出；请使用本地 HTTP 服务检查字体文件。');
    const resources={};for(const url of [sourceUrl(d),path(asset(refs.logo)),path(asset(refs.slogan))])resources[url]=await dataUrl(url);
    let fontCss='';for(const a of registry.assets.filter(a=>a.type==='font'&&Object.values(families).includes(a.metadata.css_family)))fontCss+=`@font-face{font-family:'${a.metadata.css_family}';src:url('${await dataUrl(path(a))}') format('opentype');font-weight:400;font-style:normal;}`;
    const unit=s.unit==='px'?'px':'mm';
    const svg=render(d,s,{resources,fontCss,qrMarkup:exportQr}).replace(`width="${Number(s.w)}${unit}" height="${Number(s.h)}${unit}"`,`width="${width}" height="${height}"`);
    const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
    try{
      const raster=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{try{const c=document.createElement('canvas');c.width=width;c.height=height;c.getContext('2d').drawImage(img,0,0,width,height);c.toBlob(b=>b?resolve(b):reject(new Error('样稿图片导出失败')),'image/png');}catch(e){reject(e);}};img.onerror=()=>reject(new Error('样稿渲染失败'));img.src=url;});
      return pngWithDensity(new Uint8Array(await raster.arrayBuffer()),dpi);
    }finally{URL.revokeObjectURL(url);}
  }
  const ready=document.fonts?.load?Promise.all(Object.values(families).map(f=>document.fonts.load(`32px "${f}"`))).then(results=>{fontsReady=results.every(a=>a.length>0);return fontsReady;}).catch(()=>false):Promise.resolve(false);
  window.DidiLayout={config,registry,asset,plan,render,ready,pngSize,exportPng,get fontsReady(){return fontsReady;},families};
})();
