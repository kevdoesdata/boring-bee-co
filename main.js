(function(){
  var STRIPE_LINK=/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/;
  var root=document.documentElement;

  // product blocks: comb toggle + add to bag
  var reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  // little green hexagons that drift up slowly, like bubbles in honey
  function spark(host,x,y,o){
    if(reduce)return;o=o||{};
    var i=document.createElement('i'),sz=o.size||(4+Math.random()*5);
    i.style.cssText='left:'+x+'px;top:'+y+'px;width:'+sz+'px;height:'+sz+'px';
    host.appendChild(i);
    var dx=(Math.random()-.5)*14,rise=o.rise||(14+Math.random()*16),dur=o.dur||(2600+Math.random()*1600);
    var an=i.animate([
      {transform:'translate(0,0) rotate(0deg) scale(.4)',opacity:0},
      {transform:'translate('+dx*.4+'px,'+(-rise*.3)+'px) rotate(40deg) scale(1)',opacity:o.op||.85,offset:.25},
      {transform:'translate('+dx+'px,'+(-rise)+'px) rotate(110deg) scale(.7)',opacity:0}
    ],{duration:dur,easing:'cubic-bezier(.3,.6,.4,1)'});
    an.onfinish=function(){i.remove()};
  }
  // sliding toggle. The pill behaves like a drop of honey: it never snaps free,
  // it keeps a thinning tail back to where it was until the tail finally lets go.
  // the tail is a band drawn between where the pill was and where it is now.
  // It thins as the pill pulls away, the way a thread of honey does, then lets go.
  function tail(seg,anchor,t){
    var th=seg.querySelector('.thumb'),tl=seg.querySelector('.tail');
    if(!anchor){tl.style.opacity=0;return}
    var l=parseFloat(getComputedStyle(th).left),w=parseFloat(getComputedStyle(th).width);
    var lo=Math.min(anchor.l,l),hi=Math.max(anchor.l+anchor.w,l+w);
    var span=Math.max(1,anchor.span||1);
    var k=Math.min(1,Math.abs((l+w/2)-(anchor.l+anchor.w/2))/span);
    var k2=Math.max(0,(k-.3)/.7),sy=Math.max(.045,Math.pow(1-k2,1.25));
    tl.style.left=lo+'px';tl.style.width=(hi-lo)+'px';
    tl.style.transform='scaleY('+sy.toFixed(3)+')';
    tl.style.opacity=k>.97?0:1;
  }
  function place(seg,btn,animate){
    var th=seg.querySelector('.thumb'),tl=seg.querySelector('.tail'),gl=seg.querySelector('.gl');
    var l=btn.offsetLeft,w=btn.offsetWidth,from={l:th._l,w:th._w};
    th._l=l;th._w=w;th.style.left=l+'px';th.style.width=w+'px';
    gl.style.left=l+'px';gl.style.width=w+'px';
    if(!animate||reduce||from.l==null){seg.classList.add('ready');tl.style.opacity=0;return}
    var D=760,E='cubic-bezier(.42,0,.2,1)',k=[{left:from.l+'px',width:from.w+'px'},{left:l+'px',width:w+'px'}];
    th.animate(k,{duration:D,easing:E});gl.animate(k,{duration:D,easing:E});
    var anc={l:from.l,w:from.w,span:Math.abs((l+w/2)-(from.l+from.w/2))};
    var t0=performance.now();
    (function loop(now){
      tail(seg,anc);
      if(performance.now()-t0<D+40)requestAnimationFrame(loop);else tl.style.opacity=0;
    })();
  }
  function choose(seg,blk,btn){
    seg.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x===btn)});
    var on=btn.dataset.c==='3';
    place(seg,btn,true);
    if(on!==blk.classList.contains('comb'))blk.classList.toggle('comb',on);
    var a=blk.querySelector('.add');
    if(a){
      a.querySelector('.lbl').textContent=on?'Buy with comb':'Buy a jar';
      var url=on?blk.dataset.buyComb:blk.dataset.buyLiquid;
      // only ever send shoppers to a Stripe-hosted Payment Link
      if(url&&STRIPE_LINK.test(url))a.href=url;
    }
  }
  document.querySelectorAll('.seg').forEach(function(seg){
    var th=seg.querySelector('.thumb'),tl=seg.querySelector('.tail'),gl=seg.querySelector('.gl');
    var btns=seg.querySelectorAll('button');
    var cur=function(){return seg.querySelector('[aria-pressed=true]')};
    var init=function(){place(seg,cur(),false)};
    init();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(init);
    addEventListener('resize',init);
    // drag the pill: it trails the pointer, with the tail stretching from where it started
    var drag=null;
    seg.addEventListener('pointerdown',function(e){
      var r=th.getBoundingClientRect();
      if(e.clientX<r.left-6||e.clientX>r.right+6)return;
      drag={x0:e.clientX,l0:th._l,w0:th._w,cur:th._l,tgt:th._l,moved:false,id:e.pointerId};
    });
    seg.addEventListener('pointermove',function(e){
      if(!drag||e.pointerId!==drag.id)return;
      var dx=e.clientX-drag.x0;
      if(!drag.moved&&Math.abs(dx)>4){
        drag.moved=true;seg.classList.add('drag');try{seg.setPointerCapture(e.pointerId)}catch(_){}
        var span=Math.abs(btns[1].offsetLeft-btns[0].offsetLeft)||1;
        (function loop(){
          if(!drag)return;
          drag.cur+=(drag.tgt-drag.cur)*.1;
          var A=btns[0],B=btns[1],t=(drag.cur-A.offsetLeft)/(B.offsetLeft-A.offsetLeft);t=Math.max(0,Math.min(1,t));
          var w=A.offsetWidth+(B.offsetWidth-A.offsetWidth)*t;
          th.style.left=drag.cur+'px';th.style.width=w+'px';gl.style.left=drag.cur+'px';gl.style.width=w+'px';
          tail(seg,{l:drag.l0,w:drag.w0,span:span*1.02});
          var near=t>.5?B:A;btns.forEach(function(x){x.setAttribute('aria-pressed',x===near)});
          requestAnimationFrame(loop);
        })();
      }
      if(drag.moved)drag.tgt=Math.max(btns[0].offsetLeft,Math.min(btns[1].offsetLeft,drag.l0+dx));
    });
    function end(e){
      if(!drag||e.pointerId!==drag.id)return;
      var d=drag;drag=null;
      if(!d.moved)return;
      seg.classList.remove('drag');tl.style.opacity=0;
      var A=btns[0],B=btns[1],t=(d.cur-A.offsetLeft)/(B.offsetLeft-A.offsetLeft);
      th._l=d.cur;th._w=parseFloat(th.style.width)||th._w;
      choose(seg,seg.closest('.blk'),t>.5?B:A);
      seg._swallow=true;setTimeout(function(){seg._swallow=false},0);
    }
    seg.addEventListener('pointerup',end);seg.addEventListener('pointercancel',end);
  });
  document.querySelectorAll('.blk').forEach(function(blk){
    var segs=blk.querySelectorAll('.seg button'),seg=blk.querySelector('.seg'),add=blk.querySelector('.add');
    segs.forEach(function(b){b.addEventListener('click',function(){if(seg._swallow)return;choose(seg,blk,b)})});
    // add to bag: a green fill grows from wherever the pointer enters
    var ask=add.querySelector('.sk'),ht=null;
    add.addEventListener('pointerenter',function(e){
      var r=add.getBoundingClientRect();
      add.style.setProperty('--d',(Math.hypot(r.width,r.height)*2.1)+'px');
      add.style.setProperty('--mx',(e.clientX-r.left)+'px');add.style.setProperty('--my',(e.clientY-r.top)+'px');
      if(reduce||ht)return;
      ht=setInterval(function(){spark(ask,r.width*(.15+Math.random()*.7),r.height*(.5+Math.random()*.4),{size:3+Math.random()*3,rise:8+Math.random()*8,op:.7,dur:1800+Math.random()*900})},330);
    });
    add.addEventListener('pointerleave',function(e){
      var r=add.getBoundingClientRect();
      add.style.setProperty('--mx',Math.max(0,Math.min(r.width,e.clientX-r.left))+'px');add.style.setProperty('--my',Math.max(0,Math.min(r.height,e.clientY-r.top))+'px');
      clearInterval(ht);ht=null;
    });
    add.addEventListener('click',function(){
      var r=add.getBoundingClientRect();for(var k=0;k<8;k++)spark(ask,r.width*(.1+Math.random()*.8),r.height*(.4+Math.random()*.5),{size:4+Math.random()*4,rise:14+Math.random()*16,op:.9,dur:1400+Math.random()*700});
    });
  });


  // honey year wheel: the green hexagon is a handle you can drag around the year
  (function(){
    var NS='http://www.w3.org/2000/svg',C=200,R=158,LR=200,RI=112;
    var M=['January','February','March','April','May','June','July','August','September','October','November','December'];
    var G=['rest','rest','sp','sp','sp','sp','fa','fa','fa','fa','rest','rest'];
    var info=[
      ['Between flows','Bees rebuild. Both flows on the shelf while they last.'],
      ['Between flows','Hives get checked and readied for spring.'],
      ['Spring flow starts','Orange blossom opens and the hives come alive.'],
      ['Spring flow','Citrus and saw palmetto. Light, sweet honey.'],
      ['Spring flow','Peak season. Supers fill fast.'],
      ['Spring harvest','We pull and jar the light spring honey.'],
      ['Fall flow starts','Sea grape and summer blooms take over.'],
      ['Fall flow','Darker nectar. The honey turns malty.'],
      ['Fall flow','Brazilian pepper peaks. Bold and peppery.'],
      ['Fall harvest','We pull and jar the dark fall honey.'],
      ['Between flows','Bees rebuild. Both flows on the shelf while they last.'],
      ['Between flows','Hives rest. A good month for a gift jar.']
    ];
    var segs=document.getElementById('segs'),labs=document.getElementById('labs'),whl=document.getElementById('whl'),svg=whl.querySelector('svg');
    var mid=document.getElementById('mid'),mm=document.getElementById('mm'),st=document.getElementById('st'),bl=document.getElementById('bl'),rs=document.getElementById('rs');
    var mk=document.getElementById('mk'),hex=document.getElementById('hex'),prog=document.getElementById('prog'),str=document.getElementById('str'),anc=document.getElementById('anc'),spk=document.getElementById('spk');
    function pt(r,a){a=(a-90)*Math.PI/180;return [C+r*Math.cos(a),C+r*Math.sin(a)]}
    function arc(r,a0,a1){var p=pt(r,a0),q=pt(r,a1);return 'M'+p[0].toFixed(2)+' '+p[1].toFixed(2)+'A'+r+' '+r+' 0 0 1 '+q[0].toFixed(2)+' '+q[1].toFixed(2)}
    var now=new Date(),cm=now.getMonth(),tl=[];
    M.forEach(function(name,i){
      var p=document.createElementNS(NS,'path');
      p.setAttribute('d',arc(R,i*30+1.2,i*30+28.8));p.setAttribute('pathLength','1');
      p.setAttribute('class','wseg '+G[i]);p.style.transitionDelay=(i*55)+'ms';
      segs.appendChild(p);
      var l=pt(LR,i*30+15),t=document.createElementNS(NS,'text');
      t.setAttribute('x',l[0]);t.setAttribute('y',l[1]);t.setAttribute('class','mlab'+(i===cm?' cur':''));t.textContent=name.slice(0,3);
      labs.appendChild(t);tl.push(t);
    });
    var today=(cm+(now.getDate()-1)/new Date(now.getFullYear(),cm+1,0).getDate())/12;
    var hx=[];for(var k=0;k<6;k++){var a=k*60*Math.PI/180;hx.push((7*Math.cos(a)).toFixed(2)+','+(7*Math.sin(a)).toFixed(2))}
    hex.setAttribute('points',hx.join(' '));hex.setAttribute('fill','var(--leaf)');
    var ap=pt(RI,today*360);anc.setAttribute('cx',ap[0]);anc.setAttribute('cy',ap[1]);
    var reduceM=matchMedia('(prefers-reduced-motion:reduce)').matches;
    var fd=today,ft=today,running=false,grabbed=false,curM=-1,intro=false;
    function wrapD(d){d=((d%1)+1.5)%1-.5;return d}
    function render(){
      var p=pt(RI,fd*360);mk.setAttribute('transform','translate('+p[0].toFixed(2)+' '+p[1].toFixed(2)+')');
      mk.setAttribute('aria-valuenow',Math.floor(fd*12));mk.setAttribute('aria-valuetext',M[Math.floor(fd*12)%12]);
      if(intro){prog.style.transition='none';prog.style.strokeDashoffset=(1-fd).toFixed(4)}
      var dl=wrapD(fd-today)*360,a0=today*360;
      var off=Math.abs(dl)>2.5;whl.classList.toggle('off',off);
      if(off)str.setAttribute('d',dl>0?arc(RI,a0,a0+dl):arc(RI,a0+dl,a0));
      var i=Math.floor(((fd%1)+1)%1*12);if(i!==curM)showMonth(i);
    }
    function showMonth(i,first){
      curM=i;
      if(first){fill(i);return}
      mid.classList.add('swap');setTimeout(function(){fill(i);mid.classList.remove('swap')},170);
    }
    function fill(i){mm.textContent=(i===cm?'Now \u00b7 ':'')+M[i];st.textContent=info[i][0];bl.textContent=info[i][1]}
    // honey-thick follow: the hexagon lags the pointer a little
    function tick(){
      var d=wrapD(ft-fd);fd=((fd+d*(grabbed?.16:.07))%1+1)%1;render();
      if(grabbed&&Math.random()<.35&&!reduceM)trail();
      if(Math.abs(d)>.0004||grabbed)requestAnimationFrame(tick);else{running=false;fd=ft;render()}
    }
    function go(){if(!running){running=true;requestAnimationFrame(tick)}}
    function trail(){
      var p=pt(RI,fd*360),h=document.createElementNS(NS,'polygon'),sz=2+Math.random()*3;
      var q=[];for(var k=0;k<6;k++){var a=k*60*Math.PI/180;q.push((sz*Math.cos(a)).toFixed(2)+','+(sz*Math.sin(a)).toFixed(2))}
      h.setAttribute('points',q.join(' '));h.setAttribute('transform','translate('+p[0].toFixed(1)+' '+p[1].toFixed(1)+')');
      var dx=(Math.random()-.5)*26,dy=(Math.random()-.5)*26;
      spk.appendChild(h);
      var an=h.animate([{transform:'translate('+p[0].toFixed(1)+'px,'+p[1].toFixed(1)+'px) scale(.3)',opacity:0},
        {transform:'translate('+(p[0]+dx*.3).toFixed(1)+'px,'+(p[1]+dy*.3).toFixed(1)+'px) scale(1)',opacity:.8,offset:.2},
        {transform:'translate('+(p[0]+dx).toFixed(1)+'px,'+(p[1]+dy).toFixed(1)+'px) scale(.5) rotate(90deg)',opacity:0}],{duration:1500+Math.random()*900,easing:'cubic-bezier(.3,.6,.4,1)'});
      h.removeAttribute('transform');an.onfinish=function(){h.remove()};
    }
    function fracAt(e){
      var r=svg.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
      return ((Math.atan2(dx,-dy)/(2*Math.PI))%1+1)%1;
    }
    mk.addEventListener('pointerdown',function(e){
      e.preventDefault();grabbed=true;whl.classList.add('grab');mk.setPointerCapture(e.pointerId);ft=fracAt(e);go();
    });
    mk.addEventListener('pointermove',function(e){if(grabbed)ft=fracAt(e)});
    function rel(e){if(!grabbed)return;grabbed=false;whl.classList.remove('grab');try{mk.releasePointerCapture(e.pointerId)}catch(_){}go()}
    mk.addEventListener('pointerup',rel);mk.addEventListener('pointercancel',rel);
    mk.addEventListener('dblclick',function(){ft=today;go()});
    mk.addEventListener('keydown',function(e){
      var step=e.key==='ArrowRight'||e.key==='ArrowUp'?1/24:e.key==='ArrowLeft'||e.key==='ArrowDown'?-1/24:0;
      if(e.key==='Home'){ft=today;go();e.preventDefault();return}
      if(step){ft=((ft+step)%1+1)%1;go();e.preventDefault()}
    });
    rs.addEventListener('click',function(){ft=today;go()});
    fd=ft=today;render();showMonth(Math.floor(today*12),true);
    function start(){whl.classList.add('in');setTimeout(function(){intro=true;prog.style.strokeDashoffset=(1-fd).toFixed(4)},2600)}
    prog.style.setProperty('--p',(1-today).toFixed(4));
    if('IntersectionObserver' in window){
      var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){start();io.disconnect()}})},{threshold:.35});io.observe(whl);
    }else start();
  })();
  // label detail band: gentle parallax
  (function(){var im=document.getElementById('dimg'),band=im.parentNode;
    if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
    function f(){var r=band.getBoundingClientRect(),p=(r.top+r.height/2)/innerHeight-.5;im.style.transform='translateY('+(p*-12)+'%)'}
    addEventListener('scroll',f,{passive:true});f();})();
  // hero jars follow the pointer a little
  var jars=document.querySelectorAll('.jars .jar');
  if(matchMedia('(pointer:fine)').matches&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
    window.addEventListener('mousemove',function(e){
      var x=e.clientX/innerWidth-.5,y=e.clientY/innerHeight-.5;
      jars.forEach(function(j){var k=+j.dataset.k;
        j.style.transform='translate('+(x*-22*k)+'px,'+(y*-10*k)+'px)';
        var r=j.getBoundingClientRect(),dx=(e.clientX-(r.left+r.width/2))/r.width;
        j.style.setProperty('--lean',Math.max(-1,Math.min(1,dx))*4+'deg');});
    });
  }
  // clicking a hero jar glides to its block, which gives a small welcome bounce
  jars.forEach(function(j){j.addEventListener('click',function(e){
    var t=document.querySelector(j.getAttribute('href'));if(!t)return;e.preventDefault();
    t.scrollIntoView({behavior:'smooth',block:'start'});
    setTimeout(function(){t.classList.remove('arrive');void t.offsetWidth;t.classList.add('arrive')},650);
  })});
})();
