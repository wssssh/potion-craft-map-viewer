import React,{forwardRef,useEffect,useImperativeHandle,useRef} from 'react';
import {label} from './names.js';
const MAX_ZOOM=200;

export default forwardRef(function MapCanvas({data,options,selected,onSelect,onView},ref){
  const canvasRef=useRef(null),view=useRef({x:0,y:0,scale:4}),state=useRef({}),request=useRef(()=>{});
  state.current={...state.current,data,options,selected,onSelect,onView};
  useImperativeHandle(ref,()=>({
    fit:()=>state.current.fit?.(), zoom:factor=>state.current.zoom?.(factor),
    focus:effect=>{const r=canvasRef.current.getBoundingClientRect(),scale=Math.max(view.current.scale,28);view.current={scale,x:r.width/2-effect.x*scale,y:r.height/2-effect.y*scale};request.current();},
    origin:()=>{const r=canvasRef.current.getBoundingClientRect();view.current={scale:24,x:r.width/2,y:r.height/2};request.current();}
  }),[]);
  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas.getContext('2d',{alpha:false}),map=data.map,bounds=map.bounds;
    const levels=map.tiles.levels.map(l=>({...l,available:new Set(l.available)}));
    const portalPaths=(map.portalPaths||[]).map(item=>{
      const path=new Path2D();item.points.forEach(([x,y],i)=>i?path.lineTo(x,y):path.moveTo(x,y));
      const xs=item.points.map(p=>p[0]),ys=item.points.map(p=>p[1]);
      return {path,width:item.width,bounds:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]};
    });
    const tiles=new Map(),pending=new Set(),failures=new Set();let frame=0,disposed=false,paper=null,labelHits=[];
    // The original button's distressed alpha supplies the label edges; tint it like parchment.
    const labelBackground=document.createElement('canvas'),button=data.images.get('name-label-background.webp');
    labelBackground.width=button.width;labelBackground.height=button.height;
    const labelContext=labelBackground.getContext('2d');labelContext.drawImage(button,0,0);
    labelContext.globalCompositeOperation='source-in';labelContext.fillStyle='#c49a55';labelContext.fillRect(0,0,button.width,button.height);
    const overlayBounds=map.overlays.map(item=>{const s=map.overlaySprites[item.sprite],[a,b,c,d,x,y]=item.matrix,[left,top,w,h]=s.local;const points=[[left,top],[left+w,top],[left,top+h],[left+w,top+h]].map(([u,v])=>[a*u+c*v+x,b*u+d*v+y]);return {...item,local:s.local,image:data.images.get(s.url),bounds:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]};});
    function schedule(){if(!frame&&!disposed)frame=requestAnimationFrame(paint);}
    function loadTile(level,x,y){
      const key=`${level}/${x}_${y}`;
      if(tiles.has(key)){const image=tiles.get(key);tiles.delete(key);tiles.set(key,image);return image;}
      if(!pending.has(key)&&!failures.has(key)){pending.add(key);const img=new Image();img.onload=()=>{pending.delete(key);if(disposed)return;tiles.set(key,img);if(tiles.size>180){const oldest=tiles.keys().next().value;tiles.delete(oldest);}schedule();};img.onerror=()=>{pending.delete(key);failures.add(key);if(!disposed)state.current.onView({...view.current,error:'部分地图分块未能加载，请刷新重试。'});};img.src=`/data/tiles/${map.id}/${key}.webp`;}
      return null;
    }
    function paintLevel(level,visible,scale,tx,ty,dpr){
      const l=levels[level],unit=map.tiles.size/l.ppu;
      const minx=Math.max(0,Math.floor((visible[0]-bounds[0])/unit)),maxx=Math.min(l.columns-1,Math.floor((visible[2]-bounds[0])/unit));
      const miny=Math.max(0,Math.floor((visible[1]-bounds[1])/unit)),maxy=Math.min(l.rows-1,Math.floor((visible[3]-bounds[1])/unit));
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;
      for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){
        if(!l.available.has(`${x}_${y}`))continue;
        let img=loadTile(level,x,y),crop=[0,0,map.tiles.size,map.tiles.size];
        if(!img){const last=levels.length-1,factor=2**(last-level),px=Math.floor(x/factor),py=Math.floor(y/factor);img=loadTile(last,px,py);crop=[(x%factor)*map.tiles.size/factor,(y%factor)*map.tiles.size/factor,map.tiles.size/factor,map.tiles.size/factor];}
        if(img)ctx.drawImage(img,...crop,(bounds[0]+x*unit)*scale+tx,(bounds[1]+y*unit)*scale+ty,unit*scale,unit*scale);
      }
    }
    function fit(){const r=canvas.getBoundingClientRect(),scale=Math.max(.3,Math.min((r.width-64)/(bounds[2]-bounds[0]),(r.height-88)/(bounds[3]-bounds[1])));view.current={scale,x:r.width/2-(bounds[0]+bounds[2])/2*scale,y:r.height/2-(bounds[1]+bounds[3])/2*scale};schedule();}
    function zoom(factor,px,py){const r=canvas.getBoundingClientRect();px??=r.width/2;py??=r.height/2;const v=view.current,scale=Math.min(MAX_ZOOM,Math.max(.3,v.scale*factor));view.current={scale,x:px-(px-v.x)*scale/v.scale,y:py-(py-v.y)*scale/v.scale};schedule();}
    function paint(){
      frame=0;if(disposed)return;
      const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),v=view.current,{options,selected,onView}=state.current;
      const width=Math.round(r.width*dpr),height=Math.round(r.height*dpr);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;ctx.fillStyle='#e6d6b5';ctx.fillRect(0,0,r.width,r.height);
      if(paper){const size=32*v.scale,ox=((v.x%size)+size)%size-size,oy=((v.y%size)+size)%size-size;for(let x=ox;x<r.width;x+=size)for(let y=oy;y<r.height;y+=size)ctx.drawImage(paper,x,y,size,size);}
      const visible=[-v.x/v.scale,-v.y/v.scale,(r.width-v.x)/v.scale,(r.height-v.y)/v.scale];
      const level=Math.max(0,Math.min(levels.length-1,Math.floor(Math.log2(100/(v.scale*dpr)))));
      // A tiny overview remains underneath while sharper tiles load; no large map bitmap is allocated.
      paintLevel(level,visible,v.scale,v.x,v.y,dpr);
      // Preserve the game's authored curves, including their loops, in map coordinates.
      let shownPaths=0;
      if(options.vortex){
        ctx.save();ctx.setTransform(v.scale*dpr,0,0,v.scale*dpr,v.x*dpr,v.y*dpr);
        ctx.strokeStyle='#946733';ctx.globalAlpha=.72;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([.22,.18]);
        for(const item of portalPaths){const b=item.bounds;if(b[2]<visible[0]||b[0]>visible[2]||b[3]<visible[1]||b[1]>visible[3])continue;ctx.lineWidth=item.width*.55;ctx.stroke(item.path);shownPaths++;}
        ctx.restore();
      }
      canvas.dataset.portalPaths=shownPaths;
      for(const item of overlayBounds){const b=item.bounds;if((item.group==='experience'&&!options.experience)||(item.group==='vortex'&&!options.vortex)||b[2]<visible[0]||b[0]>visible[2]||b[3]<visible[1]||b[1]>visible[3])continue;const [a,bm,c,d,x,y]=item.matrix;ctx.setTransform(a*v.scale*dpr,bm*v.scale*dpr,c*v.scale*dpr,d*v.scale*dpr,(x*v.scale+v.x)*dpr,(y*v.scale+v.y)*dpr);ctx.globalAlpha=item.alpha;ctx.drawImage(item.image,...item.local);}
      ctx.globalAlpha=1;
      const labelBoxes=[];labelHits=[];
      const effects=selected?[...map.effects].sort((a,b)=>(b.id===selected.id)-(a.id===selected.id)):map.effects;
      for(const effect of effects){
        const x=effect.x*v.scale+v.x,y=effect.y*v.scale+v.y,margin=5*v.scale;if(x<-margin||x>r.width+margin||y<-margin||y>r.height+margin)continue;
        ctx.setTransform(v.scale*dpr,0,0,v.scale*dpr,x*dpr,y*dpr);ctx.transform(...effect.layout.rootMatrix);
        const layout=effect.layout,iconInfo=data.catalog.icons[effect.id];
        ctx.save();ctx.transform(...layout.slotMatrix);ctx.globalAlpha=.75;ctx.drawImage(data.images.get('effect-slot.webp'),...layout.slotLocal);ctx.restore();
        ctx.save();ctx.transform(...layout.iconMatrix);ctx.drawImage(data.images.get(iconInfo.url),...iconInfo.local);ctx.restore();
        ctx.setTransform(v.scale*dpr,0,0,v.scale*dpr,x*dpr,y*dpr);
        const active=selected?.id===effect.id;
        // Text, padding and bottle sizes share the map's world units, including at high zoom.
        if(options.labels&&v.scale*.48>=5.5){const text=label(effect.id);ctx.font='700 .48px PotionCraftLabel, serif';const width=ctx.measureText(text).width+.32,top=.95,height=.72,box=[x-width*v.scale/2,y+top*v.scale,x+width*v.scale/2,y+(top+height)*v.scale];const overlaps=labelBoxes.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]);if(!overlaps||active){labelBoxes.push(box);labelHits.push({effect,box});ctx.globalAlpha=active ? .48 : .28;ctx.drawImage(labelBackground,-width/2,top,width,height);ctx.globalAlpha=1;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=active?'#795023':'#966c36';ctx.fillText(text,0,top+height/2+.025);}}
      }
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.strokeStyle='#856c51';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(v.x-7,v.y);ctx.lineTo(v.x+7,v.y);ctx.moveTo(v.x,v.y-7);ctx.lineTo(v.x,v.y+7);ctx.stroke();
      onView({scale:v.scale,x:v.x,y:v.y,width:r.width,height:r.height});
      canvas.dataset.scale=v.scale.toFixed(4);canvas.dataset.panX=v.x.toFixed(2);canvas.dataset.panY=v.y.toFixed(2);canvas.dataset.tiles=tiles.size;
    }
    request.current=schedule;state.current.fit=fit;state.current.zoom=zoom;
    const paperImage=new Image();paperImage.onload=()=>{if(!disposed){paper=paperImage;schedule();}};paperImage.src='/data/paper-preview.webp';
    let previousSize='';const resize=new ResizeObserver(()=>{const r=canvas.getBoundingClientRect(),size=`${r.width}x${r.height}`;if(size!==previousSize){previousSize=size;fit();}else schedule();});resize.observe(canvas);
    function wheel(e){e.preventDefault();const r=canvas.getBoundingClientRect();zoom(Math.exp(-Math.max(-250,Math.min(250,e.deltaY))*.002),e.clientX-r.left,e.clientY-r.top);}
    const points=new Map();let start=null,moved=false;
    function down(e){if(e.button!==0)return;canvas.focus();canvas.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});start={x:e.clientX,y:e.clientY};moved=false;canvas.classList.add('dragging');}
    function move(e){
      if(!points.has(e.pointerId))return;const previous=points.get(e.pointerId),others=[...points.entries()].filter(([id])=>id!==e.pointerId);
      if(others.length){const other=others[0][1],oldDistance=Math.hypot(previous.x-other.x,previous.y-other.y),newDistance=Math.hypot(e.clientX-other.x,e.clientY-other.y),r=canvas.getBoundingClientRect();if(oldDistance>0)zoom(newDistance/oldDistance,(e.clientX+other.x)/2-r.left,(e.clientY+other.y)/2-r.top);moved=true;}
      else{view.current.x+=e.clientX-previous.x;view.current.y+=e.clientY-previous.y;schedule();}
      if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>4)moved=true;points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    }
    function up(e){points.delete(e.pointerId);if(!points.size)canvas.classList.remove('dragging');if(!moved&&e.type!=='pointercancel'){const r=canvas.getBoundingClientRect(),v=view.current,px=e.clientX-r.left,py=e.clientY-r.top;const hit=labelHits.find(({box:b})=>px>=b[0]&&px<=b[2]&&py>=b[1]&&py<=b[3]);if(hit)state.current.onSelect(hit.effect);else{const matches=map.effects.map(effect=>({effect,d:Math.hypot(effect.x*v.scale+v.x-px,effect.y*v.scale+v.y-py)})).sort((a,b)=>a.d-b.d);if(matches[0]?.d<Math.max(14,1.6*v.scale))state.current.onSelect(matches[0].effect);}}start=null;}
    function dbl(e){const r=canvas.getBoundingClientRect();zoom(1.75,e.clientX-r.left,e.clientY-r.top);}
    function key(e){if(['+','=','-','0','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(e.key==='0')fit();else if(e.key==='+'||e.key==='=')zoom(1.4);else if(e.key==='-')zoom(1/1.4);else{view.current.x+=e.key==='ArrowLeft'?60:e.key==='ArrowRight'?-60:0;view.current.y+=e.key==='ArrowUp'?60:e.key==='ArrowDown'?-60:0;schedule();}}}
    const events=[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['dblclick',dbl],['keydown',key]];
    canvas.addEventListener('wheel',wheel,{passive:false});for(const [event,fn] of events)canvas.addEventListener(event,fn);fit();
    return()=>{disposed=true;cancelAnimationFrame(frame);resize.disconnect();canvas.removeEventListener('wheel',wheel);for(const [event,fn] of events)canvas.removeEventListener(event,fn);tiles.clear();};
  },[data]);
  useEffect(()=>request.current(),[options,selected]);
  return <canvas ref={canvasRef} tabIndex={0} aria-label={`${data.map.title}完整药剂地图，可拖拽、滚轮缩放，也可用方向键和加减键操作`} />;
});

