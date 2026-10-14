/* Jar Al Khaleej Unified Portal v2.0.
   Local UI lock only. Firebase Authentication + Security Rules MUST protect data. */
(() => {
'use strict';
const catalog = window.JAR_PORTAL_CATALOG || {categories:[],apps:[]};
const appIndex = new Map(catalog.apps.map(a=>[a.id,a]));
const categoryIndex = new Map(catalog.categories.map(c=>[c.id,c]));
const PREFIX = 'jar-alkhaleej-portal:v1:';
const KEY_CRED = PREFIX+'lock';
const KEY_PREF = PREFIX+'preferences';
const KEY_FAV = PREFIX+'favorites';
const KEY_RECENT = PREFIX+'recent';
const KEY_ATTEMPTS = PREFIX+'attempts';
const KEY_SESSION = PREFIX+'session';
const $ = id => document.getElementById(id);
const storage = {
  get(key){try{return localStorage.getItem(key)}catch{return null}},
  set(key,val){try{localStorage.setItem(key,String(val));return true}catch{return false}},
  remove(key){try{localStorage.removeItem(key)}catch{}}
};
const session = {
  get(key){try{return sessionStorage.getItem(key)}catch{return null}},
  set(key,val){try{sessionStorage.setItem(key,String(val))}catch{}},
  remove(key){try{sessionStorage.removeItem(key)}catch{}}
};
const parseJSON = (s,fallback) => {try{return s?JSON.parse(s):fallback}catch{return fallback}};
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = s => String(s||'').normalize('NFKD').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').toLowerCase().trim();
const prefDefaults = {theme:'light',lockMinutes:15};
let prefs = Object.assign({},prefDefaults,parseJSON(storage.get(KEY_PREF),{}));
if(!['light','dark'].includes(prefs.theme)) prefs.theme='light';
if(![5,15,30,60].includes(Number(prefs.lockMinutes))) prefs.lockMinutes=15;
let favoriteIds = new Set((parseJSON(storage.get(KEY_FAV),[])||[]).filter(id=>appIndex.has(id)));
let recentIds = (parseJSON(storage.get(KEY_RECENT),[])||[]).filter(id=>appIndex.has(id)).slice(0,8);
let credential = parseJSON(storage.get(KEY_CRED),null);
let unlocked = false, lastActivity=Date.now(), currentAppId='', activeCategory='all', searchTerm='';
let gate = {intent:'setup',method:'pin',patternFirst:null,patternSecond:null,patternLogin:null,patternActive:[],patternDrawing:false,patternPos:null};
let expandedSidebarGroup = 'orders';
let toastTimeout;

function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),3200)}
function notifyGate(message){const e=$('gateError');e.textContent=message;e.hidden=!message;}
function applyTheme(){document.body.dataset.theme=prefs.theme}
function savePreferences(){storage.set(KEY_PREF,JSON.stringify(prefs));applyTheme()}
function credName(m){return ({pin:'رمز PIN',pattern:'نقش نمط',password:'كلمة مرور'})[m]||'غير محدد'}
function markActivity(){if(unlocked)lastActivity=Date.now()}
function setCurrentView(app){$('homeView').hidden=!!app;$('viewerView').hidden=!app}
function routeApp(id){if(!appIndex.has(id))return; const hash='#app='+encodeURIComponent(id);if(location.hash===hash)routeFromHash();else location.hash=hash}
function routeGroup(id){if(!categoryIndex.has(id))return;const hash='#group='+encodeURIComponent(id);if(location.hash===hash)routeFromHash();else location.hash=hash}
function routeHome(){if(location.hash==='#home')routeFromHash();else location.hash='#home'}
function focusAppSearch(){
  activeCategory='all';searchTerm='';$('appSearch').value='';
  if(location.hash!=='#home')history.replaceState(null,'','#home');
  renderHome();$('appSearch').focus();
}
function readRoute(){
  const raw=(location.hash||'#home').slice(1);
  const pos=raw.indexOf('=');
  if(pos>=0){let arg='';try{arg=decodeURIComponent(raw.slice(pos+1))}catch{arg=raw.slice(pos+1)}return {kind:raw.slice(0,pos),id:arg}}
  return {kind:'home',id:''};
}
function routeFromHash(){
  if(!unlocked)return;
  const r=readRoute();
  if(r.kind==='app' && appIndex.has(r.id)) openApp(r.id);
  else if(r.kind==='group' && categoryIndex.has(r.id)){activeCategory=r.id;searchTerm='';$('appSearch').value='';renderHome();}
  else{activeCategory='all';searchTerm='';$('appSearch').value='';renderHome()}
}
/* All visual icons are local SVG assets; no icon-font network dependency. */
const categoryIcons = {orders:'clipboard',sales:'chart',finance:'wallet',factory:'factory',engineering:'ruler',management:'folder'};
const appIcons = {
  'orders-dashboard':'chart','order-entry':'plus','production-board':'factory',
  'order-print':'printer','order-print-old':'file','sales-field':'phone',
  'sales-leads':'message','sales-totals':'chart','sales-calc':'calculator',
  'cash-manager':'wallet','cash-monitor':'chart','mixing-ledger':'flask',
  'stock-manager':'package','production-report':'file','frp-designer':'ruler',
  'maintenance':'wrench','devices-records':'users','fleet':'car','sadad-guide':'invoice'
};
const icon = (name,css='icon') => `<svg class="${css}" aria-hidden="true"><use href="assets/icons.svg#${name}"></use></svg>`;
function renderSidebar(){
  $('sidebarGroups').innerHTML=catalog.categories.map(c=>{
    const items=catalog.apps.filter(a=>a.category===c.id);
    const open=expandedSidebarGroup===c.id;
    return `<div class="side-group"><div class="side-group-title"><button class="side-link side-section" type="button" data-action="group" data-group="${esc(c.id)}"><span class="side-emoji">${icon(categoryIcons[c.id]||'folder')}</span><span>${esc(c.name)}</span></button><span class="chev">${open?'⌄':'‹'}</span></div><div class="side-group-children" ${open?'':'hidden'}>${items.map(a=>`<button class="side-link side-mini" type="button" data-action="open" data-app="${esc(a.id)}">${a.role==='child'?'↳ ':''}${esc(a.title)}</button>`).join('')}</div></div>`;
  }).join('');
}
function activeSidebar(id=null){
  document.querySelectorAll('.sidebar .side-link').forEach(b=>b.classList.remove('active'));
  if(id){
    const a=appIndex.get(id);expandedSidebarGroup=a?.category||expandedSidebarGroup;
    renderSidebar();
    const b=document.querySelector(`.sidebar [data-app="${CSS.escape(id)}"]`);if(b)b.classList.add('active');
  } else {
    renderSidebar();
    const nav=activeCategory==='all'?$('.side-home'):document.querySelector(`.sidebar [data-group="${CSS.escape(activeCategory)}"]`);
    nav?.classList.add('active');
  }
}
function appCard(a){
  const f=favoriteIds.has(a.id);
  const chip=a.role==='child'?'صفحة فرعية':a.role==='legacy'?'نسخة سابقة':'تطبيق رئيسي';
  return `<article class="app-card" data-category="${esc(a.category)}"><div class="app-card-top"><div class="app-icon">${icon(appIcons[a.id]||'grid')}</div><button type="button" class="favorite-button ${f?'is-favorite':''}" data-action="favorite" data-app="${esc(a.id)}" aria-label="${f?'إزالة من':'إضافة إلى'} المفضلة" title="المفضلة">${f?'★':'☆'}</button></div><div class="app-card-body"><h4>${esc(a.title)}</h4><p>${esc(a.description)}</p></div><div class="app-card-bottom"><span class="app-chip">${esc(chip)}</span><button class="app-open" type="button" data-action="open" data-app="${esc(a.id)}">فتح التطبيق ${icon('arrow-up-right')}</button></div></article>`;
}
function renderHome(){
  setCurrentView(false);currentAppId='';$('appFrame').src='about:blank';
  const group=categoryIndex.get(activeCategory);
  $('topLocation').textContent=group?group.name:'الرئيسية';$('topSubheading').textContent=group?group.subtitle:'جميع أدوات العمل في مكان واحد';
  $('totalAppsCount').textContent=catalog.apps.length;$('totalGroupsCount').textContent=catalog.categories.length;
  const today=$('todayDate');if(today)today.textContent=new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Riyadh'}).format(new Date());
  const q=plain(searchTerm);
  $('categoryTabs').innerHTML=`<button type="button" class="cat-tab ${activeCategory==='all'?'active':''}" data-action="filter" data-group="all">جميع التطبيقات</button>`+catalog.categories.map(c=>`<button type="button" class="cat-tab ${activeCategory===c.id?'active':''}" data-action="filter" data-group="${esc(c.id)}">${icon(categoryIcons[c.id]||'folder')} ${esc(c.name)}</button>`).join('');
  const data=catalog.apps.filter(a=>(activeCategory==='all'||a.category===activeCategory) && (!q||plain([a.title,a.description,a.file,categoryIndex.get(a.category)?.name].join(' ')).includes(q)));
  $('appsGrid').innerHTML=data.map(appCard).join('');$('emptyResults').hidden=!!data.length;
  $('sectionCount').textContent=`${data.length} تطبيقًا`; $('filterCount').textContent=`${data.length} من أصل ${catalog.apps.length}`;
  $('appSectionTitle').textContent=group?group.name:'جميع التطبيقات';
  $('sectionLabel').textContent=group?group.subtitle:'جميع الأدوات';
  const fav=catalog.apps.filter(a=>favoriteIds.has(a.id));
  $('favoritesSection').hidden=activeCategory!=='all'||!!q||!fav.length;
  $('favoritesGrid').innerHTML=fav.map(appCard).join('');
  const recent=recentIds.map(id=>appIndex.get(id)).filter(Boolean).slice(0,3);
  $('recentsSection').hidden=activeCategory!=='all'||!!q||!recent.length;
  $('recentsGrid').innerHTML=recent.map(appCard).join('');
  activeSidebar();closeSidebar();
}
function openApp(id){
  const a=appIndex.get(id);if(!a)return;
  setCurrentView(true);$('topLocation').textContent=a.title;$('topSubheading').textContent=categoryIndex.get(a.category)?.name||'';
  $('viewerGroup').textContent=categoryIndex.get(a.category)?.name||'';
  $('viewerTitle').textContent=a.title;$('viewerDesc').textContent=a.description;
  activeSidebar(id);closeSidebar();
  if(currentAppId!==id || !$('appFrame').getAttribute('src')?.includes('apps/')){
    $('frameLoading').hidden=false;
    $('appFrame').src='apps/'+encodeURIComponent(a.file);
    currentAppId=id;
  }
  recentIds=[id,...recentIds.filter(x=>x!==id)].slice(0,8);
  storage.set(KEY_RECENT,JSON.stringify(recentIds));markActivity();
}
function toggleFavorite(id){if(favoriteIds.has(id))favoriteIds.delete(id);else favoriteIds.add(id);storage.set(KEY_FAV,JSON.stringify([...favoriteIds]));if(!$('homeView').hidden)renderHome();toast(favoriteIds.has(id)?'أضيف إلى المفضلة':'أزيل من المفضلة')}
function toggleSidebar(){const open=$('sidebar').classList.toggle('open');$('sideScrim').hidden=!open;$('menuToggle').setAttribute('aria-expanded',String(open))}
function closeSidebar(){$('sidebar').classList.remove('open');$('sideScrim').hidden=true;$('menuToggle').setAttribute('aria-expanded','false')}
function showSettings(){if(!unlocked)return;$('themeSetting').value=prefs.theme;$('lockSetting').value=String(prefs.lockMinutes);$('currentMethodName').textContent=credName(credential?.method);$('settingsDialog').hidden=false;markActivity()}
function closeSettings(){$('settingsDialog').hidden=true}

/* Hash PBKDF2 (WebCrypto) to avoid storing plain credentials; this cannot secure files or Firebase. */
const te=new TextEncoder();
const B64 = bytes => btoa(String.fromCharCode(...bytes));
const fromB64 = str => Uint8Array.from(atob(str),ch=>ch.charCodeAt(0));
async function derive(secret,salt,iterations){
  const key=await crypto.subtle.importKey('raw',te.encode('jar-portal-v1|'+secret),'PBKDF2',false,['deriveBits']);
  const out=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations,hash:'SHA-256'},key,256);
  return new Uint8Array(out);
}
async function newCredential(method,secret){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const rounds=260000, hash=await derive(secret,salt,rounds);
  return {v:1,method,salt:B64(salt),hash:B64(hash),iterations:rounds,createdAt:new Date().toISOString()};
}
async function verifyCredential(secret){
  const given=await derive(secret,fromB64(credential.salt),Number(credential.iterations)||260000);
  const expected=fromB64(credential.hash);
  let diff=given.length ^ expected.length;
  for(let i=0;i<Math.min(given.length,expected.length);i++)diff|=(given[i]^expected[i]);
  return diff===0;
}
function gateMode(intent,method){
  gate={intent,method:method||credential?.method||'pin',patternFirst:null,patternSecond:null,patternLogin:null,patternActive:[],patternDrawing:false,patternPos:null};
  $('gate').hidden=false;
  $('gateMethodPicker').hidden=!['setup','change-set'].includes(intent);
  $('gateConfirmWrap').hidden=!['setup','change-set'].includes(intent);
  $('gateCancel').hidden=!['verify-change','change-set'].includes(intent);
  const configs={
    setup:['إعداد وسيلة الدخول','اختر طريقة فتح هذه البوابة على جهازك.'],
    unlock:['فتح مساحة العمل','أدخل وسيلة الدخول التي سبق تعيينها على هذا المتصفح.'],
    'verify-change':['تأكيد وسيلة الدخول الحالية','تحقق من وسيلة الدخول الحالية قبل تغييرها.'],
    'change-set':['تعيين وسيلة دخول جديدة','اختر رمز PIN أو نمطًا أو كلمة مرور جديدة.']
  };
  $('gateTitle').textContent=configs[intent][0];$('gateDescription').textContent=configs[intent][1];
  $('gateSubmit').textContent={setup:'حفظ وسيلة الدخول وفتح النظام',unlock:'فتح النظام','verify-change':'تأكيد الهوية','change-set':'اعتماد وسيلة الدخول الجديدة'}[intent];
  notifyGate('');drawGateInputs();
  if(!window.isSecureContext || !crypto?.subtle){notifyGate('يلزم فتح النظام على HTTPS أو http://localhost لتفعيل قفل WebCrypto. لا تفتح ملف HTML مباشرة بطريقة file://.');$('gateSubmit').disabled=true}
  else $('gateSubmit').disabled=false;
  if(intent!=='setup'&&intent!=='change-set'){
    $('gateMethodPicker').hidden=true;
  }
  if(gate.method!=='pattern')setTimeout(()=>$('gateSecret').focus(),40);
}
function drawGateInputs(){
  document.querySelectorAll('.method-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.method===gate.method));
  $('gateTextInputs').hidden=gate.method==='pattern';$('patternArea').hidden=gate.method!=='pattern';
  const enroll=['setup','change-set'].includes(gate.intent);
  const isPIN=gate.method==='pin';
  $('gateSecretLabel').textContent=enroll?(isPIN?'تعيين رمز PIN':'تعيين كلمة مرور'):(isPIN?'رمز PIN':'كلمة المرور');
  $('gateSecret').value='';$('gateConfirm').value='';
  $('gateSecret').setAttribute('inputmode',isPIN?'numeric':'text');
  $('gateConfirm').setAttribute('inputmode',isPIN?'numeric':'text');
  $('gateSecret').placeholder=isPIN?'6 أرقام على الأقل':'10 أحرف على الأقل';
  $('gateConfirm').placeholder='أعد نفس القيمة للتأكيد';
  gate.patternFirst=null;gate.patternSecond=null;gate.patternLogin=null;gate.patternActive=[];
  $('patternHint').textContent=enroll?'ارسم نمطًا من 4 نقاط على الأقل، ثم كرره للتأكيد.':'ارسم النمط الذي سبق اختياره.';
  renderPattern();
}
function chooseMethod(method){if(!['pin','password','pattern'].includes(method))return;gate.method=method;notifyGate('');drawGateInputs()}

/* Touch/mouse/stylus 3x3 pattern. Stored pattern only as salted derived key. */
const nodePoints=Array.from({length:9},(_,i)=>({x:50+(i%3)*100,y:50+Math.floor(i/3)*100}));
function renderPattern(){
  const board=$('patternSvg');if(!board)return;
  const active=gate.patternActive;
  $('patternLine').setAttribute('d',active.length?'M '+active.map(i=>`${nodePoints[i].x} ${nodePoints[i].y}`).join(' L ')+(gate.patternDrawing&&gate.patternPos?` L ${gate.patternPos.x} ${gate.patternPos.y}`:''):'');
  board.querySelectorAll('circle').forEach((c,i)=>c.classList.toggle('is-active',active.includes(i)));
}
function clearPatternVisual(){gate.patternActive=[];gate.patternDrawing=false;gate.patternPos=null;renderPattern()}
function getSvgPoint(ev){const rect=$('patternSvg').getBoundingClientRect();return {x:(ev.clientX-rect.left)/rect.width*300,y:(ev.clientY-rect.top)/rect.height*300}}
function addPatternPoints(point){for(let i=0;i<nodePoints.length;i++)if(!gate.patternActive.includes(i)){const n=nodePoints[i];if(Math.hypot(point.x-n.x,point.y-n.y)<33){gate.patternActive.push(i);break}}renderPattern()}
function finishPattern(){
  if(!gate.patternDrawing)return;
  gate.patternDrawing=false;gate.patternPos=null;const sequence=gate.patternActive.join('-');
  if(gate.patternActive.length<4){notifyGate('يجب أن يتكوّن النمط من 4 نقاط مختلفة على الأقل.');clearPatternVisual();return}
  const enrollment=['setup','change-set'].includes(gate.intent);
  if(enrollment){
    if(!gate.patternFirst){gate.patternFirst=sequence;gate.patternSecond=null;$('patternHint').textContent='تم تسجيل النمط الأول. أعد رسم النمط نفسه للتأكيد.';toast('أعد رسم النمط للتأكيد');}
    else if(gate.patternFirst===sequence){gate.patternSecond=sequence;$('patternHint').textContent='النمط مطابق. اضغط زر الاعتماد الآن.';toast('تطابق النمط بنجاح');}
    else{gate.patternFirst=null;gate.patternSecond=null;$('patternHint').textContent='النمطان مختلفان. ابدأ الرسم من جديد.';notifyGate('النمط الثاني مختلف؛ ارسم نمطًا جديدًا ثم أعده للتأكيد.');}
  }else{gate.patternLogin=sequence;$('patternHint').textContent='تم إدخال النمط. اضغط فتح النظام.'}
  setTimeout(clearPatternVisual,240);
}
function attachPatternEvents(){
  const el=$('patternSvg');
  el.innerHTML += nodePoints.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="15"></circle>`).join('');
  el.addEventListener('pointerdown',ev=>{if($('patternArea').hidden)return;ev.preventDefault();notifyGate('');clearPatternVisual();gate.patternDrawing=true;const p=getSvgPoint(ev);gate.patternPos=p;addPatternPoints(p);try{el.setPointerCapture(ev.pointerId)}catch{}});
  el.addEventListener('pointermove',ev=>{if(!gate.patternDrawing)return;ev.preventDefault();const p=getSvgPoint(ev);gate.patternPos=p;addPatternPoints(p)});
  el.addEventListener('pointerup',ev=>{if(gate.patternDrawing){addPatternPoints(getSvgPoint(ev));finishPattern()}});
  el.addEventListener('pointercancel',()=>clearPatternVisual());
}
function invalidSecret(method,s){
  if(method==='pin')return /^\d{6,12}$/.test(s)?'':'يجب أن يتكوّن PIN من 6 إلى 12 رقمًا.';
  if(method==='password')return s.length>=10?'':'اختر كلمة مرور من 10 أحرف على الأقل.';
  return (s.split('-').length>=4)?'':'ارسم نمطًا من أربع نقاط على الأقل.';
}
function currentGateSecret(){return gate.method==='pattern'?gate.patternLogin:$('gateSecret').value}
function attemptState(){return parseJSON(storage.get(KEY_ATTEMPTS),{failures:0,until:0})}
function recordFailure(){
  const a=attemptState();a.failures=(a.failures||0)+1;
  if(a.failures>=5){const minutes=Math.min(30,2**Math.min(4,a.failures-5));a.until=Date.now()+minutes*60000}
  storage.set(KEY_ATTEMPTS,JSON.stringify(a));return a;
}
async function submitGate(ev){
  ev.preventDefault();if(!crypto?.subtle)return;
  const btn=$('gateSubmit');if(btn.disabled)return;
  const enroll=gate.intent==='setup'||gate.intent==='change-set';
  let secret=enroll?(gate.method==='pattern'?gate.patternSecond:$('gateSecret').value):currentGateSecret();
  if(!secret){notifyGate(gate.method==='pattern'?'ارسم النمط المطلوب قبل المتابعة.':'أدخل القيمة المطلوبة.');return}
  const wrong=invalidSecret(gate.method,secret);if(enroll&&wrong){notifyGate(wrong);return}
  if(enroll){
    if(gate.method==='pattern'&&(!gate.patternFirst||gate.patternFirst!==gate.patternSecond)){notifyGate('ارسم النمط مرتين بنفس الترتيب.');return}
    if(gate.method!=='pattern'&&$('gateConfirm').value!==secret){notifyGate('القيمتان غير متطابقتين.');return}
  }else{
    const a=attemptState();if(a.until>Date.now()){notifyGate(`تم إيقاف المحاولات مؤقتًا. أعد المحاولة بعد ${Math.ceil((a.until-Date.now())/60000)} دقيقة.`);return}
  }
  btn.disabled=true;btn.textContent='جارٍ التحقق...';notifyGate('');
  try{
    if(enroll){
      const next=await newCredential(gate.method,secret);
      if(!storage.set(KEY_CRED,JSON.stringify(next)))throw new Error('تعذر التخزين المحلي؛ تحقق من إعدادات المتصفح.');
      credential=next;storage.remove(KEY_ATTEMPTS);unlockShell();toast('تم تحديث وسيلة الدخول بنجاح');
    }else{
      const verified=await verifyCredential(secret);
      if(!verified){const a=recordFailure();gate.patternLogin=null;clearPatternVisual();notifyGate(a.until>Date.now()?'تم إيقاف المحاولات مؤقتًا بعد خمس محاولات خاطئة.':'وسيلة الدخول غير صحيحة. حاول مرة أخرى.');return}
      storage.remove(KEY_ATTEMPTS);
      if(gate.intent==='verify-change'){gateMode('change-set',credential.method);return}
      unlockShell();
    }
  }catch(e){console.error('Portal gate failure',e);notifyGate('تعذر تنفيذ العملية. تحقق من تشغيل الموقع عبر HTTPS/localhost وتوفر تخزين المتصفح.');}
  finally{btn.disabled=false;btn.textContent={setup:'حفظ وسيلة الدخول وفتح النظام',unlock:'فتح النظام','verify-change':'تأكيد الهوية','change-set':'اعتماد وسيلة الدخول الجديدة'}[gate.intent]}
}
function unlockShell(){
  unlocked=true;session.set(KEY_SESSION,credential.hash);$('gate').hidden=true;$('appShell').hidden=false;
  lastActivity=Date.now();routeFromHash();
}
function lockShell(reason=''){
  unlocked=false;session.remove(KEY_SESSION);closeSettings();closeSidebar();
  $('appFrame').src='about:blank';currentAppId='';$('appShell').hidden=true;
  gateMode(credential?'unlock':'setup',credential?.method||'pin');if(reason)notifyGate(reason);
}
function listenSession(){
  setInterval(()=>{if(unlocked&&Date.now()-lastActivity>=Number(prefs.lockMinutes)*60000)lockShell('انتهت الجلسة بسبب عدم الاستخدام؛ يرجى تسجيل الدخول من جديد.')},15000);
  for(const event of ['pointerdown','keydown','touchstart','wheel'])window.addEventListener(event,markActivity,{passive:true});
  window.addEventListener('message',ev=>{
    if(!unlocked||ev.origin!==location.origin||ev.source!==$('appFrame').contentWindow)return;
    const d=ev.data;if(!d||typeof d!=='object')return;
    if(d.type==='jar-portal:activity'){markActivity();return}
    if(d.type==='jar-portal:navigate'&&typeof d.appId==='string'&&appIndex.has(d.appId))routeApp(d.appId);
  });
  window.addEventListener('storage',e=>{if(e.key===KEY_CRED&&credential){const next=parseJSON(e.newValue,null);if(!next||next.hash!==credential.hash){credential=next;lockShell('تغيّرت إعدادات الدخول في نافذة أخرى.') }} });
}
function handleDelegatedClick(e){
  const b=e.target.closest?.('[data-action]');if(!b)return;
  const action=b.dataset.action;
  if(action==='home')routeHome();
  else if(action==='open')routeApp(b.dataset.app);
  else if(action==='group'){expandedSidebarGroup=b.dataset.group;routeGroup(b.dataset.group)}
  else if(action==='filter'){activeCategory=b.dataset.group; if(activeCategory==='all')routeHome();else routeGroup(activeCategory)}
  else if(action==='favorite')toggleFavorite(b.dataset.app);
  else if(action==='settings')showSettings();
  else if(action==='lock')lockShell();
}
function attachEvents(){
  document.body.addEventListener('click',handleDelegatedClick);
  $('appSearch').addEventListener('input',e=>{searchTerm=e.target.value;renderHome()});
  $('globalSearch')?.addEventListener('click',focusAppSearch);
  $('menuToggle').addEventListener('click',toggleSidebar);
  $('sideScrim').addEventListener('click',closeSidebar);
  $('settingsShortcut').addEventListener('click',showSettings);
  $('lockShortcut').addEventListener('click',()=>lockShell());
  $('closeSettings').addEventListener('click',closeSettings);
  $('settingsDialog').addEventListener('click',e=>{if(e.target===$('settingsDialog'))closeSettings()});
  $('themeSetting').addEventListener('change',e=>{prefs.theme=e.target.value;savePreferences()});
  $('lockSetting').addEventListener('change',e=>{prefs.lockMinutes=Number(e.target.value);savePreferences();markActivity()});
  $('changeLockMethod').addEventListener('click',()=>{closeSettings();gateMode('verify-change',credential.method)});
  $('lockFromSettings').addEventListener('click',()=>lockShell());
  $('gateMethodPicker').addEventListener('click',e=>{const b=e.target.closest('[data-method]');if(b)chooseMethod(b.dataset.method)});
  $('gateForm').addEventListener('submit',submitGate);
  $('gateCancel').addEventListener('click',()=>{if(!unlocked){unlockShell()}else{$('gate').hidden=true;$('appShell').hidden=false}});
  $('clearPattern').addEventListener('click',()=>{clearPatternVisual();gate.patternFirst=null;gate.patternSecond=null;gate.patternLogin=null;$('patternHint').textContent='ارسم النمط من جديد.'});
  $('reloadApp').addEventListener('click',()=>{if(!currentAppId)return;markActivity();$('frameLoading').hidden=false;try{$('appFrame').contentWindow.location.reload()}catch{$('appFrame').src=$('appFrame').src}});
  $('expandApp').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('viewerBox').requestFullscreen()}catch(e){toast('ملء الشاشة غير متاح في هذا المتصفح')}});
  $('appFrame').addEventListener('load',()=>{
    const src=$('appFrame').getAttribute('src');if(!src||src==='about:blank')return;
    $('frameLoading').hidden=true;
    try{
      const filename=decodeURIComponent($('appFrame').contentWindow.location.pathname.split('/').pop());
      const mapped=filename==='dashboard.html'?'orders-dashboard':catalog.apps.find(a=>a.file===filename)?.id;
      if(mapped && mapped!==currentAppId){currentAppId=mapped; const desired='#app='+encodeURIComponent(mapped);if(location.hash!==desired)history.replaceState(null,'',desired);openApp(mapped)}
    }catch(_){/* Cross-origin URL: do not attempt to access foreign page. */}
  });
  window.addEventListener('hashchange',routeFromHash);
  window.addEventListener('keydown',e=>{
    if(!unlocked)return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();focusAppSearch()}
    if(e.altKey&&e.key.toLowerCase()==='h'){e.preventDefault();routeHome()}
    if(e.key==='Escape'){closeSettings();closeSidebar()}
  });
  window.addEventListener('beforeunload',()=>{ /* Legacy apps own unsaved-change dialogs. */ });
}
function start(){
  applyTheme();renderSidebar();attachPatternEvents();attachEvents();listenSession();
  const secure=!!(window.isSecureContext&&crypto?.subtle);
  if(credential && credential.v!==1){credential=null;storage.remove(KEY_CRED)}
  if(credential && session.get(KEY_SESSION)===credential.hash && secure)unlockShell();
  else gateMode(credential?'unlock':'setup',credential?.method||'pin');
  if(!secure)console.warn('Jar portal: WebCrypto requires HTTPS or localhost.');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
